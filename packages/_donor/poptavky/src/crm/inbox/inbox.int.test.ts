import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  registerEntityPolicies,
  resolveEntity,
  setPhaseHooks,
  type EntityRegistry,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { UserError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { manifest as kontaktyManifest } from "@rebar/kontakty";
import { company, person } from "@rebar/kontakty/schema";
import { companyEntity, findContactDuplicates, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job, jobParticipant } from "@rebar/zakazky/schema";
import { jobEntity, server as zakazkyServer } from "@rebar/zakazky/server";
import { manifest } from "../../index";
import { inquiry, intakeLog } from "../../schema";
import {
  convertCommand,
  createIntakeKeyCommand,
  inquiryEntity,
  receiveInquiry,
} from "../../server";
import { crmHooks } from "../hooks";
import { ensureCrmDefaults } from "../seed";
import {
  importCommand,
  overviewCommand,
  participantAddCommand,
  participantRemoveCommand,
  participantUpdateCommand,
  participantsListCommand,
  qualifyPreviewCommand,
  quickAddCommand,
  ensureJobTypeField,
} from "./index";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let inquiryE: ResolvedEntity;
const events: unknown[] = [];
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    emit: async (name: string, payload: unknown) => void events.push([name, payload]),
  }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, inquiryEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const m of [manifest, zakazkyManifest, kontaktyManifest]) {
    for (const p of "pipelines" in m.seed ? (m.seed.pipelines ?? []) : [])
      await ensurePipeline(app.db, p);
    for (const l of "lookups" in m.seed ? m.seed.lookups : []) await ensureLookup(app.db, l);
    if ("series" in m.seed) await ensureSeries(app.db, m.seed.series);
  }
  await ensureCrmDefaults(app.db);
  await ensureJobTypeField(app.db);
  inquiryE = await resolveEntity(app.db, inquiryEntity);
});
beforeEach(() => setPhaseHooks([...(zakazkyServer.phaseHooks ?? []), ...crmHooks]));

const tag = () => randomBytes(3).toString("hex");
const all = (...keys: string[]) => keys.map((k) => [k, "all"] as [string, "all"]);
const boss = () =>
  makeUser(
    app.db,
    all(
      "poptavky.read",
      "poptavky.write",
      "poptavky.convert",
      "poptavky.intake",
      "zakazky.read",
      "zakazky.write",
      "zakazky.finance",
      "kontakty.read",
      "kontakty.write",
    ),
  );
type User = Awaited<ReturnType<typeof boss>>;

const count = async (table: typeof company | typeof person, name: string) =>
  (
    await app.db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.name, name), isNull(table.deletedAt)))
  ).length;

const qa = (extra: Record<string, unknown>) =>
  quickAddCommand.input.parse({ skipFirstActivity: true, ...extra });

describe("rychlé zadání poptávky: jedna transakce", () => {
  it("jedním příkazem vznikne firma, osoba i zakázka ve fázi Poptávka; typ, město a zdroj se uloží", async () => {
    const u = await boss();
    const t = tag();
    const res = await quickAddCommand.handler(
      u.ctx,
      qa({
        contact: {
          name: `Petr Nový ${t}`,
          phone: "+420 603 111 222",
          email: `petr-${t}@example.cz`,
        },
        company: {
          name: `Stavba ${t} s.r.o.`,
          ico: undefined,
          data: { type: "investor", city: "Plzeň" },
        },
        title: `Rekonstrukce ${t}`,
        address: "Hlavní 12, Plzeň",
        siteCity: "Plzeň",
        jobType: "reconstruction",
        valueMinor: 450_000_00,
        source: "phone",
        expectedCloseDate: "2026-12-15",
      }),
      deps(),
    );
    expect(res).toMatchObject({ createdCompany: true, createdPerson: true, firstActivityId: null });
    const [j] = await app.db.select().from(job).where(eq(job.id, res.jobId));
    expect(j).toMatchObject({
      title: `Rekonstrukce ${t}`,
      phase: "inquiry",
      companyId: res.companyId,
      personId: res.personId,
      valueMinor: 450_000_00,
      siteCity: "Plzeň",
      crmSource: "phone",
      expectedCloseDate: "2026-12-15",
    });
    expect((j!.custom as Record<string, unknown>).job_type).toBe("reconstruction");
    const [c] = await app.db.select().from(company).where(eq(company.id, res.companyId));
    expect(c).toMatchObject({ name: `Stavba ${t} s.r.o.`, type: "investor", city: "Plzeň" });
    const [p] = await app.db.select().from(person).where(eq(person.id, res.personId!));
    expect(p).toMatchObject({ name: `Petr Nový ${t}`, companyId: res.companyId });
  });

  it("první aktivita je povinná, ledaže ji volající výslovně vynechá", async () => {
    const u = await boss();
    const t = tag();
    await expect(
      quickAddCommand.handler(
        u.ctx,
        quickAddCommand.input.parse({ company: { name: `Bez aktivity ${t}` } }),
        deps(),
      ),
    ).rejects.toThrow(/první aktivitu/);
    expect(await count(company, `Bez aktivity ${t}`)).toBe(0);
  });

  it("duplicita (stejný e-mail) zastaví zadání větou; nic nevznikne, `use` použije nalezenou, `create` založí novou", async () => {
    const u = await boss();
    const t = tag();
    const [existing] = await app.db
      .insert(company)
      .values({ name: `Stará ${t}`, email: `stara-${t}@example.cz` })
      .returning();
    const base = { contact: { name: `Karel ${t}`, email: `STARA-${t}@example.cz` } };
    await expect(
      quickAddCommand.handler(u.ctx, qa({ ...base, company: { name: `Nová ${t}` } }), deps()),
    ).rejects.toThrow(new RegExp(`Firma „Stará ${t}“ se stejným e-mailem už existuje`));
    expect(await count(company, `Nová ${t}`)).toBe(0);
    expect(await count(person, `Karel ${t}`)).toBe(0);

    const used = await quickAddCommand.handler(
      u.ctx,
      qa({ ...base, company: { name: `Nová ${t}` }, duplicates: "use" }),
      deps(),
    );
    expect(used.companyId).toBe(existing!.id);
    expect(used.createdCompany).toBe(false);

    const created = await quickAddCommand.handler(
      u.ctx,
      qa({
        ...base,
        contact: { name: `Karel Druhý ${t}`, email: `STARA-${t}@example.cz` },
        company: { name: `Nová ${t}` },
        duplicates: "create",
      }),
      deps(),
    );
    expect(created.companyId).not.toBe(existing!.id);
    expect(created.createdCompany).toBe(true);
  });

  it("shoda v IČO použije existující firmu vždy", async () => {
    const u = await boss();
    const t = tag();
    const ico = `${Math.floor(10000000 + Math.random() * 89999999)}`;
    const [existing] = await app.db
      .insert(company)
      .values({ name: `IČO firma ${t}`, ico })
      .returning();
    const res = await quickAddCommand.handler(
      u.ctx,
      qa({ company: { name: "Jiný název", ico } }),
      deps(),
    );
    expect(res.companyId).toBe(existing!.id);
  });

  it("vybraná osoba dodá firmu i kontakt; soukromý investor (jen jméno) dostane firmu pojmenovanou po sobě", async () => {
    const u = await boss();
    const t = tag();
    const [c] = await app.db
      .insert(company)
      .values({ name: `Firma osoby ${t}` })
      .returning();
    const [p] = await app.db
      .insert(person)
      .values({ name: `Osoba ${t}`, companyId: c!.id })
      .returning();
    const a = await quickAddCommand.handler(u.ctx, qa({ contact: { personId: p!.id } }), deps());
    expect(a).toMatchObject({ companyId: c!.id, personId: p!.id, createdCompany: false });
    const b = await quickAddCommand.handler(
      u.ctx,
      qa({ contact: { name: `Soukromý ${t}` } }),
      deps(),
    );
    expect(b.createdCompany).toBe(true);
    expect(await count(company, `Soukromý ${t}`)).toBe(1);
  });

  it("selže-li založení zakázky (neplatný stav), nezůstane ani firma ani osoba", async () => {
    const u = await boss();
    const t = tag();
    const stages = (await getPipeline(app.db, "job", "default"))!.stages;
    const won = stages.find((s) => s.kind === "won" || s.phase === "preparation")!;
    await expect(
      quickAddCommand.handler(
        u.ctx,
        qa({
          contact: { name: `Rollback ${t}` },
          company: { name: `Rollback firma ${t}` },
          stageId: won.id,
        }),
        deps(),
      ),
    ).rejects.toThrow(/obchodním stavu/);
    expect(await count(company, `Rollback firma ${t}`)).toBe(0);
    expect(await count(person, `Rollback ${t}`)).toBe(0);
  });

  it("zvolený stav fáze nabídka se použije; bez oprávnění ke kontaktům nová firma nevznikne", async () => {
    const u = await boss();
    const stages = (await getPipeline(app.db, "job", "default"))!.stages;
    const target = stages.find((s) => s.name === "Kontaktováno")!;
    const res = await quickAddCommand.handler(
      u.ctx,
      qa({ company: { name: `Stav ${tag()}` }, stageId: target.id }),
      deps(),
    );
    const [j] = await app.db.select().from(job).where(eq(job.id, res.jobId));
    expect(j!.stageId).toBe(target.id);

    const t = tag();
    const noContacts = await makeUser(app.db, all("zakazky.read", "zakazky.write"));
    await expect(
      quickAddCommand.handler(noContacts.ctx, qa({ company: { name: `Zakazano ${t}` } }), deps()),
    ).rejects.toThrow();
    expect(await count(company, `Zakazano ${t}`)).toBe(0);
    expect(quickAddCommand.permission).toBe("zakazky.write");
  });
});

describe("kvalifikace poptávky: údaje nové firmy, UTM, náhled duplicit", () => {
  it("údaje z ARES se použijí pro novou firmu a kanál i kampaň se přenesou na zakázku", async () => {
    const u = await boss();
    const t = tag();
    const row = await createRecord(u.ctx, registry, inquiryE, {
      title: `Fasáda ${t}`,
      contactName: `Jana ${t}`,
      companyName: `Neuvedená ${t}`,
      source: "web",
      sourceChannel: "facebook / cpc",
      campaign: "podzim-2026",
    }).then((r) => r.row);
    const ico = `${Math.floor(10000000 + Math.random() * 89999999)}`;
    const res = (await convertCommand.handler(
      u.ctx,
      convertCommand.input.parse({
        id: row.id,
        ico,
        companyData: {
          name: `Opravdová firma ${t} a.s.`,
          dic: `CZ${ico}`,
          street: "Jankovcova 1522/53",
          city: "Praha",
          zip: "170 00",
        },
      }),
      deps(),
    )) as { jobId: string; companyId: string };
    const [c] = await app.db.select().from(company).where(eq(company.id, res.companyId));
    expect(c).toMatchObject({
      name: `Opravdová firma ${t} a.s.`,
      ico,
      city: "Praha",
      zip: "170 00",
    });
    const [j] = await app.db.select().from(job).where(eq(job.id, res.jobId));
    expect(j).toMatchObject({
      crmSource: "web",
      crmSourceChannel: "facebook / cpc",
      crmCampaign: "podzim-2026",
    });
  });

  it("náhled kvalifikace vrátí údaje poptávky a existující kontakty (e-mail, telefon, IČO)", async () => {
    const u = await boss();
    const t = tag();
    await app.db.insert(person).values({ name: `Známý ${t}`, email: `znamy-${t}@example.cz` });
    const row = await createRecord(u.ctx, registry, inquiryE, {
      title: `Podlahy ${t}`,
      contactName: `Neznámý ${t}`,
      contactEmail: `znamy-${t}@example.cz`,
    }).then((r) => r.row);
    const preview = await qualifyPreviewCommand.handler(u.ctx, { id: row.id }, deps());
    expect(preview.inquiry.contactEmail).toBe(`znamy-${t}@example.cz`);
    expect(preview.duplicates.persons.map((p) => p.name)).toContain(`Známý ${t}`);
    const dupes = await findContactDuplicates(u.ctx, { email: `ZNAMY-${t}@example.cz` });
    expect(dupes.persons).toHaveLength(1);
    const blind = await makeUser(app.db, all("poptavky.read", "poptavky.convert"));
    await expect(
      qualifyPreviewCommand.handler(blind.ctx, { id: row.id }, deps()),
    ).resolves.toMatchObject({
      duplicates: { companies: [], persons: [] },
    });
  });
});

describe("import poptávek z CSV", () => {
  const sourceRow = (line: number, extra: Record<string, unknown> = {}) => ({ line, ...extra });

  it("řádky s chybou se vrátí po řádcích, ostatní se uloží; vzorce dostanou apostrof", async () => {
    const u = await boss();
    const t = tag();
    const res = await importCommand.handler(
      u.ctx,
      importCommand.input.parse({
        rows: [
          sourceRow(2, {
            name: `Alena ${t}`,
            email: `alena-${t}@example.cz`,
            phone: "+420 777 123 456",
            value: "150 000 Kč",
            source: "web",
          }),
          sourceRow(3, { name: `Špatný ${t}`, email: "není-email" }),
          sourceRow(4, {
            name: `=HYPERLINK("http://zlo.example","klik") ${t}`,
            company: "@SUM(A1)",
            message: "+cmd|' /C calc'!A0",
          }),
          sourceRow(5, { name: `Telefon ${t}`, phone: "abc" }),
          sourceRow(6, { name: `Částka ${t}`, value: "hodně" }),
          sourceRow(7, {}),
          sourceRow(8, { name: `Duplicita ${t}`, email: `ALENA-${t}@example.cz` }),
        ],
      }),
      deps(),
    );
    const byLine = Object.fromEntries(res.results.map((r) => [r.line, r]));
    expect(byLine[2]).toMatchObject({ status: "ok" });
    expect(byLine[3]).toMatchObject({ status: "error", message: expect.stringMatching(/E-mail/) });
    expect(byLine[4]).toMatchObject({ status: "ok" });
    expect(byLine[5]).toMatchObject({ status: "error", message: expect.stringMatching(/Telefon/) });
    expect(byLine[6]).toMatchObject({ status: "error", message: expect.stringMatching(/částka/) });
    expect(byLine[7]).toMatchObject({ status: "error" });
    expect(byLine[8]).toMatchObject({
      status: "duplicate",
      message: expect.stringMatching(/řádku 2/),
    });
    expect(res).toMatchObject({ created: 2, errors: 4, duplicates: 1, dryRun: false });

    const [a] = await app.db.select().from(inquiry).where(eq(inquiry.id, byLine[2]!.id!));
    expect(a).toMatchObject({
      contactName: `Alena ${t}`,
      contactEmail: `alena-${t}@example.cz`,
      expectedValueMinor: 150_000_00,
      source: "web",
    });
    const [inj] = await app.db.select().from(inquiry).where(eq(inquiry.id, byLine[4]!.id!));
    expect(inj!.contactName!.startsWith("'=")).toBe(true);
    expect(inj!.companyName!.startsWith("'@")).toBe(true);
    expect(inj!.message!.startsWith("'+")).toBe(true);
  });

  it("náhled (dryRun) nic nezapíše; existující poptávka se stejným e-mailem je duplicita, `create` ji propustí", async () => {
    const u = await boss();
    const t = tag();
    await createRecord(u.ctx, registry, inquiryE, {
      title: `Existující ${t}`,
      contactEmail: `exist-${t}@example.cz`,
    });
    const rows = [sourceRow(2, { name: `Nový ${t}`, email: `EXIST-${t}@example.cz` })];
    const dry = await importCommand.handler(
      u.ctx,
      importCommand.input.parse({ rows, dryRun: true }),
      deps(),
    );
    expect(dry.results[0]).toMatchObject({ status: "duplicate" });
    const before = await app.db
      .select({ id: inquiry.id })
      .from(inquiry)
      .where(eq(inquiry.contactName, `Nový ${t}`));
    expect(before).toHaveLength(0);
    const forced = await importCommand.handler(
      u.ctx,
      importCommand.input.parse({ rows, duplicates: "create" }),
      deps(),
    );
    expect(forced).toMatchObject({ created: 1, duplicates: 0 });
  });

  it("limit řádků a prázdný soubor odmítne už validace vstupu; zápis vyžaduje oprávnění `poptavky.write`", () => {
    expect(importCommand.input.safeParse({ rows: [] }).success).toBe(false);
    const many = Array.from({ length: 501 }, (_, i) => ({ line: i + 1, name: "x" }));
    expect(importCommand.input.safeParse({ rows: many }).success).toBe(false);
    expect(importCommand.permission).toBe("poptavky.write");
  });
});

describe("příjem z webu: UTM, past na roboty, dvojité odeslání", () => {
  async function key(u: User) {
    const k = (await createIntakeKeyCommand.handler(u.ctx, { name: `Klíč ${tag()}` }, deps())) as {
      secret: string;
    };
    return k.secret;
  }

  it("UTM značky se uloží jako kanál a kampaň a přenesou se do zakázky při kvalifikaci", async () => {
    const u = await boss();
    const secret = await key(u);
    const t = tag();
    const { id } = await receiveInquiry(
      app.db,
      deps(),
      secret,
      {
        name: `Návštěvník ${t}`,
        email: `n-${t}@example.cz`,
        utm_source: "facebook",
        utm_medium: "cpc",
        utm_campaign: "jaro",
      },
      "1.2.3.4",
    );
    const [row] = await app.db.select().from(inquiry).where(eq(inquiry.id, id));
    expect(row).toMatchObject({ sourceChannel: "facebook / cpc", campaign: "jaro", source: "web" });
  });

  it("vyplněná past (`_hp`) poptávku nezaloží, ale tváří se, že proběhla; zapíše se jako spam", async () => {
    const u = await boss();
    const secret = await key(u);
    const t = tag();
    const res = await receiveInquiry(
      app.db,
      deps(),
      secret,
      { name: `Robot ${t}`, email: `r-${t}@example.cz`, _hp: "http://spam.example" },
      "9.9.9.9",
    );
    expect(res.spam).toBe(true);
    expect(
      await app.db
        .select()
        .from(inquiry)
        .where(eq(inquiry.contactEmail, `r-${t}@example.cz`)),
    ).toHaveLength(0);
    const log = await app.db.select().from(intakeLog).where(eq(intakeLog.outcome, "spam"));
    expect(log.length).toBeGreaterThan(0);
  });

  it("stejné odeslání do deseti minut nevytvoří druhou poptávku; řídicí znaky se odstraní", async () => {
    const u = await boss();
    const secret = await key(u);
    const t = tag();
    const payload = {
      name: `Dvojklik\u0007 ${t}`,
      email: `d-${t}@example.cz`,
      message: "Dobrý den",
    };
    const a = await receiveInquiry(app.db, deps(), secret, payload, "1.1.1.1");
    const b = await receiveInquiry(app.db, deps(), secret, payload, "1.1.1.1");
    expect(b.id).toBe(a.id);
    const [row] = await app.db.select().from(inquiry).where(eq(inquiry.id, a.id));
    expect(row!.contactName).toBe(`Dvojklik ${t}`);
    await expect(receiveInquiry(app.db, deps(), secret, { email: "x" }, null)).rejects.toThrow(
      UserError,
    );
  });
});

describe("účastníci zakázky", () => {
  async function mkJob(u: User) {
    const t = tag();
    const res = await quickAddCommand.handler(
      u.ctx,
      qa({ company: { name: `Účastníci ${t}` } }),
      deps(),
    );
    const [p] = await app.db
      .insert(person)
      .values({ name: `TDI ${t}`, email: `tdi-${t}@example.cz`, phone: "777 888 999" })
      .returning();
    return { ...res, person: p!, t };
  }

  it("přidání, seznam s kontaktem, změna role, odebrání; duplicita se odmítne; audit na zakázce", async () => {
    const u = await boss();
    const { jobId, person: p } = await mkJob(u);
    await participantAddCommand.handler(u.ctx, { jobId, personId: p.id, role: "TDI" }, deps());
    await expect(
      participantAddCommand.handler(u.ctx, { jobId, personId: p.id, role: "investor" }, deps()),
    ).rejects.toThrow(/už je mezi účastníky/);
    const list = await participantsListCommand.handler(u.ctx, { jobId }, deps());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: p.name, role: "TDI", email: p.email });
    await participantUpdateCommand.handler(u.ctx, { id: list[0]!.id, role: "Projektant" }, deps());
    expect((await participantsListCommand.handler(u.ctx, { jobId }, deps()))[0]!.role).toBe(
      "Projektant",
    );
    await participantRemoveCommand.handler(u.ctx, { id: list[0]!.id }, deps());
    expect(await participantsListCommand.handler(u.ctx, { jobId }, deps())).toHaveLength(0);
    // znovu přidat jde (měkce smazaný řádek unikátní index neblokuje)
    await participantAddCommand.handler(u.ctx, { jobId, personId: p.id }, deps());
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityType, "job"), eq(schema.auditLog.entityId, jobId)));
    expect(audit.filter((a) => /účastník/i.test(a.summary ?? "")).length).toBeGreaterThanOrEqual(3);
    expect(
      await app.db.select().from(jobParticipant).where(eq(jobParticipant.jobId, jobId)),
    ).toHaveLength(2);
  });

  it("kontakty vidí jen ten, kdo smí číst kontakty; zakázku, kterou nevidí, i seznam účastníků odmítne", async () => {
    const u = await boss();
    const { jobId, person: p } = await mkJob(u);
    await participantAddCommand.handler(u.ctx, { jobId, personId: p.id, role: "TDI" }, deps());
    const reader = await makeUser(app.db, all("zakazky.read"));
    const list = await participantsListCommand.handler(reader.ctx, { jobId }, deps());
    expect(list[0]).toMatchObject({ name: p.name, email: null, phone: null });
    const mine = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
      ["kontakty.read", "all"],
    ]);
    await expect(participantsListCommand.handler(mine.ctx, { jobId }, deps())).rejects.toThrow();
    await expect(
      participantAddCommand.handler(mine.ctx, { jobId, personId: p.id }, deps()),
    ).rejects.toThrow();
  });
});

describe("přehled obchodu firmy a osoby", () => {
  it("zakázky firmy s fází a stavem, souhrn; částky jen s `zakazky.finance`", async () => {
    const u = await boss();
    const t = tag();
    const a = await quickAddCommand.handler(
      u.ctx,
      qa({
        company: { name: `Přehled ${t}` },
        contact: { name: `Kontakt ${t}` },
        valueMinor: 300_000_00,
      }),
      deps(),
    );
    // druhá zakázka stejné firmy
    await quickAddCommand.handler(
      u.ctx,
      qa({ company: { companyId: a.companyId }, valueMinor: 200_000_00, duplicates: "use" }),
      deps(),
    );
    const ov = await overviewCommand.handler(u.ctx, { entity: "company", id: a.companyId }, deps());
    expect(ov.deals).toHaveLength(2);
    expect(ov.summary).toMatchObject({ open: 2, won: 0, openValueMinor: 500_000_00 });
    expect(ov.people.map((p) => p.name)).toContain(`Kontakt ${t}`);
    expect(ov.deals[0]).toMatchObject({ phase: "inquiry", isOpen: true });
    expect(ov.deals[0]!.valueMinor).toBeGreaterThan(0);

    const foreman = await makeUser(app.db, all("zakazky.read", "kontakty.read"));
    const ov2 = await overviewCommand.handler(
      foreman.ctx,
      { entity: "company", id: a.companyId },
      deps(),
    );
    expect(ov2.deals).toHaveLength(2);
    expect(ov2.money).toBe(false);
    expect(ov2.deals[0]).not.toHaveProperty("valueMinor");
    expect(ov2.summary).not.toHaveProperty("openValueMinor");
    expect(JSON.stringify(ov2)).not.toMatch(/weighted/i);
  });

  it("osoba: zakázky jako hlavní kontakt i jako účastník s rolí; bez oprávnění k zakázkám žádné", async () => {
    const u = await boss();
    const t = tag();
    const a = await quickAddCommand.handler(
      u.ctx,
      qa({ company: { name: `Os ${t}` }, contact: { name: `Hlavní ${t}` } }),
      deps(),
    );
    const other = await quickAddCommand.handler(
      u.ctx,
      qa({ company: { name: `Os2 ${t}` } }),
      deps(),
    );
    await participantAddCommand.handler(
      u.ctx,
      { jobId: other.jobId, personId: a.personId!, role: "projektant" },
      deps(),
    );
    const ov = await overviewCommand.handler(u.ctx, { entity: "person", id: a.personId! }, deps());
    expect(ov.deals.map((d) => d.id).sort()).toEqual([a.jobId, other.jobId].sort());
    expect(ov.deals.find((d) => d.id === other.jobId)!.participantRole).toBe("projektant");
    expect(ov.deals.find((d) => d.id === a.jobId)!.participantRole).toBeNull();
    expect(ov.company?.name).toBe(`Os ${t}`);
    const noJobs = await makeUser(app.db, all("kontakty.read"));
    const ov3 = await overviewCommand.handler(
      noJobs.ctx,
      { entity: "person", id: a.personId! },
      deps(),
    );
    expect(ov3.deals).toHaveLength(0);
  });
});
