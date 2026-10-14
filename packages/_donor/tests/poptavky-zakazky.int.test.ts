import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  registerEntityPolicies,
  resolveEntity,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as poptavkyManifest } from "@rebar/poptavky";
import { convertCommand, crmApi, inquiryEntity } from "@rebar/poptavky/server";
import { crmActivity, inquiry } from "@rebar/poptavky/schema";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { jobEntity } from "@rebar/zakazky/server";
import { job } from "@rebar/zakazky/schema";

const app = connectAppDb();
afterAll(() => app.close());

let withJobs: EntityRegistry;
let withoutJobs: EntityRegistry;
const events: unknown[] = [];
const deps = (registry: EntityRegistry) =>
  ({
    registry,
    baseURL: "http://localhost",
    emit: async (name: string, payload: unknown) => void events.push([name, payload]),
  }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  withJobs = createEntityRegistry([companyEntity, personEntity, inquiryEntity, jobEntity]);
  withoutJobs = createEntityRegistry([companyEntity, personEntity, inquiryEntity]);
  registerEntityPolicies(withJobs);
  for (const m of [poptavkyManifest, zakazkyManifest]) {
    for (const p of m.seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of "lookups" in m.seed ? m.seed.lookups : []) await ensureLookup(app.db, l);
    if ("series" in m.seed) await ensureSeries(app.db, m.seed.series);
  }
  await crmApi.ensureCrmDefaults(app.db); // typy aktivit pro první aktivitu při kvalifikaci
});

const boss = () =>
  makeUser(app.db, [
    ["poptavky.read", "all"],
    ["poptavky.write", "all"],
    ["poptavky.convert", "all"],
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
  ]);

async function newInquiry(
  u: Awaited<ReturnType<typeof boss>>,
  extra: Record<string, unknown> = {},
) {
  const E = await resolveEntity(app.db, inquiryEntity);
  const tag = randomBytes(3).toString("hex");
  const { row } = await createRecord(u.ctx, withJobs, E, {
    title: `Koupelna ${tag}`,
    value: 250_000_00,
    contactName: `Jan ${tag}`,
    companyName: `Novák ${tag} s.r.o.`,
    contactEmail: `jan-${tag}@example.cz`,
    ...extra,
  });
  return { row, tag };
}

/** Vstup příkazu kvalifikace s výchozími hodnotami (jako po průchodu zod schématem příkazu). */
const qualify = (id: string, extra: Record<string, unknown> = {}) =>
  convertCommand.input.parse({ id, ...extra });

describe("kvalifikace poptávky (převod na zakázku)", () => {
  it("vytvoří firmu z textu poptávky, zakázku s číslem ze série v prvním stavu poptávky a poptávku označí jako kvalifikovanou (vše v jedné transakci)", async () => {
    const u = await boss();
    const { row, tag } = await newInquiry(u, { message: "Chceme novou koupelnu", source: "phone" });
    const res = (await convertCommand.handler(u.ctx, qualify(row.id), deps(withJobs))) as {
      jobId: string;
      companyId: string;
    };

    const [j] = await app.db.select().from(job).where(eq(job.id, res.jobId));
    expect(j).toMatchObject({
      companyId: res.companyId,
      valueMinor: 250_000_00,
      managerId: u.id,
      sourceInquiryId: row.id,
      // poptávka nese adresu jen volným textem, takže zakázka začíná ve fázi Poptávka (nabídka až po doplnění adresy)
      phase: "inquiry",
      crmSource: "phone",
      description: "Chceme novou koupelnu",
    });
    const firstStage = (await getPipeline(app.db, "job", "default"))!.stages.find(
      (s) => s.phase === "inquiry",
    )!;
    expect(j!.stageId).toBe(firstStage.id);
    expect(firstStage.name).toBe("Nová poptávka");
    expect(j!.personId).not.toBeNull();
    expect(j!.number).toMatch(/^Z-\d{4}-\d{3,}$/);
    const [c] = await app.db.select().from(company).where(eq(company.id, res.companyId));
    expect(c).toMatchObject({ name: `Novák ${tag} s.r.o.`, email: `jan-${tag}@example.cz` });

    const [after] = await app.db.select().from(inquiry).where(eq(inquiry.id, row.id));
    expect(after).toMatchObject({ convertedJobId: res.jobId, companyId: res.companyId });
    const won = (await getPipeline(app.db, "inquiry", "default"))!.stages.find(
      (s) => s.kind === "won",
    )!;
    expect(after!.stageId).toBe(won.id);
    expect(events).toContainEqual(["poptavky.converted", { id: row.id, jobId: res.jobId }]);
  });

  it("podruhé převést nejde; zakázka se tím nezdvojí", async () => {
    const u = await boss();
    const { row } = await newInquiry(u);
    await convertCommand.handler(u.ctx, qualify(row.id), deps(withJobs));
    await expect(convertCommand.handler(u.ctx, qualify(row.id), deps(withJobs))).rejects.toThrow(
      /už je převedená/,
    );
  });

  it("bez firmy i jména kontaktu převod odmítne s návodem; vybraná existující firma se použije", async () => {
    const u = await boss();
    const bare = await newInquiry(u, { contactName: undefined, companyName: undefined });
    await expect(
      convertCommand.handler(u.ctx, qualify(bare.row.id), deps(withJobs)),
    ).rejects.toThrow(/Doplňte firmu/);
    const [existing] = await app.db
      .insert(company)
      .values({ name: `Existující ${bare.tag}` })
      .returning();
    const res = (await convertCommand.handler(
      u.ctx,
      qualify(bare.row.id, { companyId: existing!.id }),
      deps(withJobs),
    )) as { companyId: string };
    expect(res.companyId).toBe(existing!.id);
  });

  it("bez oprávnění k zakázkám převod selže a nic nezůstane (transakce se vrátí)", async () => {
    const u = await boss();
    const noJobs = await makeUser(app.db, [
      ["poptavky.read", "all"],
      ["poptavky.write", "all"],
      ["poptavky.convert", "all"],
      ["kontakty.read", "all"],
      ["kontakty.write", "all"],
    ]);
    const { row } = await newInquiry(u);
    await expect(
      convertCommand.handler(noJobs.ctx, qualify(row.id), deps(withJobs)),
    ).rejects.toThrow();
    const [after] = await app.db.select().from(inquiry).where(eq(inquiry.id, row.id));
    expect(after!.convertedJobId).toBeNull();
  });

  it("když je modul zakázek vypnutý, převod je nedostupný", async () => {
    const u = await boss();
    const { row } = await newInquiry(u);
    await expect(convertCommand.handler(u.ctx, qualify(row.id), deps(withoutJobs))).rejects.toThrow(
      /Modul Zakázky není zapnutý/,
    );
  });

  it("kontrola duplicit: shoda v e-mailu poptávku zastaví větou, použití nalezené firmy ji propustí, nová se založí na vyžádání", async () => {
    const u = await boss();
    const tag = randomBytes(3).toString("hex");
    const email = `shoda-${tag}@example.cz`;
    const [existing] = await app.db
      .insert(company)
      .values({ name: `Stará firma ${tag}`, email: email.toUpperCase() })
      .returning();
    const a = await newInquiry(u, { contactEmail: email, contactName: undefined });
    await expect(convertCommand.handler(u.ctx, qualify(a.row.id), deps(withJobs))).rejects.toThrow(
      new RegExp(`Firma „Stará firma ${tag}“ se stejným e-mailem už existuje`),
    );
    // nic nevzniklo
    const [still] = await app.db.select().from(inquiry).where(eq(inquiry.id, a.row.id));
    expect(still!.convertedJobId).toBeNull();

    const used = (await convertCommand.handler(
      u.ctx,
      qualify(a.row.id, { duplicates: "use" }),
      deps(withJobs),
    )) as { companyId: string };
    expect(used.companyId).toBe(existing!.id);

    const b = await newInquiry(u, { contactEmail: email, contactName: undefined });
    const created = (await convertCommand.handler(
      u.ctx,
      qualify(b.row.id, { duplicates: "create" }),
      deps(withJobs),
    )) as { companyId: string };
    expect(created.companyId).not.toBe(existing!.id);
  });

  it("kontrola duplicit podle telefonu bez ohledu na předvolbu a mezery; shoda v IČO použije existující firmu vždy", async () => {
    const u = await boss();
    const tag = randomBytes(3).toString("hex");
    const ico = String(10_000_000 + Math.floor(Math.random() * 80_000_000));
    const [byIco] = await app.db
      .insert(company)
      .values({ name: `IČO firma ${tag}`, ico })
      .returning();
    const [byPhone] = await app.db
      .insert(company)
      .values({ name: `Telefon firma ${tag}`, phone: "+420 777 123 456" })
      .returning();

    const p = await newInquiry(u, {
      contactPhone: "777123456",
      contactEmail: undefined,
      contactName: undefined,
    });
    await expect(convertCommand.handler(u.ctx, qualify(p.row.id), deps(withJobs))).rejects.toThrow(
      new RegExp(`Telefon firma ${tag}“ se stejným telefonem`),
    );

    const i = await newInquiry(u, {
      contactPhone: "777123456",
      contactEmail: undefined,
      contactName: undefined,
    });
    const res = (await convertCommand.handler(
      u.ctx,
      qualify(i.row.id, { ico: ` ${ico.slice(0, 2)} ${ico.slice(2)} ` }),
      deps(withJobs),
    )) as { companyId: string };
    expect(res.companyId).toBe(byIco!.id);
    expect(byPhone!.id).not.toBe(res.companyId);
  });

  it("duplicitní kontaktní osoba se hlásí a jde použít; první aktivita projde jako datový tvar", async () => {
    const u = await boss();
    const tag = randomBytes(3).toString("hex");
    const email = `osoba-${tag}@example.cz`;
    const [firma] = await app.db
      .insert(company)
      .values({ name: `Firma ${tag}` })
      .returning();
    const { person } = await import("@rebar/kontakty/schema");
    const [osoba] = await app.db
      .insert(person)
      .values({ name: `Jan Dvořák ${tag}`, email, companyId: firma!.id })
      .returning();
    const q = await newInquiry(u, { contactEmail: email, contactName: `Jan D. ${tag}` });
    await expect(
      convertCommand.handler(u.ctx, qualify(q.row.id, { companyId: firma!.id }), deps(withJobs)),
    ).rejects.toThrow(/Osoba „Jan Dvořák .*“ se stejným e-mailem už existuje/);
    const res = (await convertCommand.handler(
      u.ctx,
      qualify(q.row.id, {
        companyId: firma!.id,
        duplicates: "use",
        firstActivity: {
          typeKey: "site_visit",
          subject: "Obhlídka na místě",
          dueAt: "2026-11-03T08:00:00+01:00",
        },
      }),
      deps(withJobs),
    )) as { jobId: string; personId: string; firstActivityId: string | null };
    expect(res.personId).toBe(osoba!.id);
    // první aktivita se založí ve stejné transakci s vazbami na zakázku, firmu i osobu a zakázka ji hned ukáže
    expect(res.firstActivityId).toBeTruthy();
    const [activity] = await app.db
      .select()
      .from(crmActivity)
      .where(eq(crmActivity.id, res.firstActivityId!));
    expect(activity).toMatchObject({
      subject: "Obhlídka na místě",
      jobId: res.jobId,
      companyId: firma!.id,
      personId: osoba!.id,
      assigneeId: u.id,
      durationMin: 90,
    });
    const [created] = await app.db.select().from(job).where(eq(job.id, res.jobId));
    expect(created!.crmOpenActivities).toBe(1);
    expect(() => qualify(q.row.id, { firstActivity: { subject: "", dueAt: "zítra" } })).toThrow();
  });

  it("zakázka po kvalifikaci má historii stavů s prvním řádkem", async () => {
    const u = await boss();
    const { row } = await newInquiry(u);
    const res = (await convertCommand.handler(u.ctx, qualify(row.id), deps(withJobs))) as {
      jobId: string;
    };
    const { jobStageHistory } = await import("@rebar/zakazky/schema");
    const history = await app.db
      .select()
      .from(jobStageHistory)
      .where(eq(jobStageHistory.jobId, res.jobId));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ phase: "inquiry", leftAt: null });
  });
});
