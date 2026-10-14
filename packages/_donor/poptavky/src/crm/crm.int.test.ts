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
  updateRecord,
  type EntityRegistry,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job, jobStageHistory } from "@rebar/zakazky/schema";
import { jobEntity, server as zakazkyServer } from "@rebar/zakazky/server";
import { manifest } from "../index";
import { crmActivity, crmActivityType } from "../schema";
import { inquiryEntity } from "../server";
import { archiveDeal, loseDeal, reopenDeal, unarchiveDeal, winDeal } from "./deals/transitions";
import { recomputeJobCrm } from "./deals/recompute";
import { fieldRulesSetting, readFieldRules, type FieldRule } from "./field-rules";
import { setFieldRulesCommand, fieldRulesCommand } from "./deals/commands";
import { crmHooks } from "./hooks";
import { stageHistory } from "./history";
import { ensureCrmDefaults } from "./seed";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let jobE: ResolvedEntity;
let stages: { id: string; name: string; phase: string | null }[];
const settings = createSettings(
  createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") })),
);
const deps = () => ({ registry, settings, baseURL: "http://localhost" }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, inquiryEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const m of [manifest, zakazkyManifest]) {
    for (const p of m.seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of "lookups" in m.seed ? m.seed.lookups : []) await ensureLookup(app.db, l);
    if ("series" in m.seed) await ensureSeries(app.db, m.seed.series);
  }
  await ensureCrmDefaults(app.db);
  jobE = await resolveEntity(app.db, jobEntity);
  stages = (await getPipeline(app.db, "job", "default"))!.stages;
});
beforeEach(() => setPhaseHooks([...(zakazkyServer.phaseHooks ?? []), ...crmHooks]));

const stage = (name: string) => stages.find((s) => s.name === name)!;
const boss = () =>
  makeUser(app.db, [
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["zakazky.finance", "all"],
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
    ["settings.manage", "all"],
  ]);
type User = Awaited<ReturnType<typeof boss>>;

async function mkJob(u: User, extra: Record<string, unknown> = {}) {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const r = await createRecord(u.ctx, registry, jobE, {
    title: `Zakázka ${randomBytes(3).toString("hex")}`,
    company: c!.id,
    value: 1_000_000_00,
    ...extra,
  });
  return r.row;
}
const raw = async (id: string) => (await app.db.select().from(job).where(eq(job.id, id)))[0]!;
const upd = (u: User, id: string, patch: Record<string, unknown>) =>
  updateRecord(u.ctx, registry, jobE, id, patch);

const DAY = 86_400_000;

/** Dnešní půlnoc pražského času (konvence celodenní aktivity); letní i zimní čas. */
function pragueMidnight(): Date {
  const prague = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Prague" });
  const day = prague(new Date());
  for (const offset of ["+01:00", "+02:00"]) {
    const d = new Date(`${day}T00:00:00${offset}`);
    if (
      prague(d) === day &&
      d.toLocaleTimeString("en-GB", { timeZone: "Europe/Prague" }) === "00:00:00"
    )
      return d;
  }
  throw new Error("Půlnoc se nepodařilo určit.");
}

describe("historie stavů a vstup do stavu", () => {
  it("založení zakázky zapíše první řádek historie a čas vstupu do stavu", async () => {
    const u = await boss();
    const j = await mkJob(u);
    const history = await stageHistory(u.ctx, j.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      stageId: stage("Nová poptávka").id,
      phase: "inquiry",
      leftAt: null,
      days: 0,
      stageName: "Nová poptávka",
    });
    const r = await raw(j.id);
    expect(r.crmStageEnteredAt).toEqual(history[0]!.enteredAt);
    expect(history[0]!.changedBy).toBe(u.id);
  });

  it("změna stavu (i uvnitř fáze) uzavře otevřený řádek, zapíše nový a posune čas vstupu", async () => {
    const u = await boss();
    const j = await mkJob(u);
    const before = await raw(j.id);
    await upd(u, j.id, { stage: stage("Kontaktováno").id });
    await upd(u, j.id, { stage: stage("Obhlídka").id });
    const history = await stageHistory(u.ctx, j.id);
    expect(history.map((h) => h.stageName)).toEqual(["Nová poptávka", "Kontaktováno", "Obhlídka"]);
    expect(history.map((h) => h.leftAt !== null)).toEqual([true, true, false]);
    expect(history[0]!.leftAt!.getTime()).toBe(history[1]!.enteredAt.getTime());
    const r = await raw(j.id);
    expect(r.crmStageEnteredAt!.getTime()).toBe(history[2]!.enteredAt.getTime());
    expect(r.crmStageEnteredAt!.getTime()).toBeGreaterThanOrEqual(
      before.crmStageEnteredAt!.getTime(),
    );
    // otevřený řádek je vždy právě jeden
    const open = await app.db
      .select()
      .from(jobStageHistory)
      .where(and(eq(jobStageHistory.jobId, j.id), isNull(jobStageHistory.leftAt)));
    expect(open).toHaveLength(1);
  });
});

describe("váha obchodu a pravděpodobnost", () => {
  it("vážená hodnota vychází z pravděpodobnosti stavu a mění se se stavem", async () => {
    const u = await boss();
    // do fáze nabídka se bez adresy stavby nejde dostat (hook přechodu)
    const j = await mkJob(u, { address: "Nová 1" });
    expect((await raw(j.id)).crmWeightedMinor).toBe(100_000_00); // Nová poptávka: 10 %
    await upd(u, j.id, { stage: stage("Nabídka odeslána").id });
    expect((await raw(j.id)).crmWeightedMinor).toBe(650_000_00); // 65 %
  });

  it("ruční přepsání má přednost, změna stavu ho zruší", async () => {
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Jednání").id });
    expect((await raw(j.id)).crmWeightedMinor).toBe(800_000_00);
    await upd(u, j.id, { crmProbabilityPct: 25 });
    expect(await raw(j.id)).toMatchObject({ crmProbabilityPct: 25, crmWeightedMinor: 250_000_00 });
    await upd(u, j.id, { stage: stage("Nabídka odeslána").id });
    expect(await raw(j.id)).toMatchObject({
      crmProbabilityPct: null,
      crmWeightedMinor: 650_000_00,
    });
  });

  it("přepsání zadané při založení nebo touž úpravou jako stav se ponechá", async () => {
    const u = await boss();
    const j = await mkJob(u, { crmProbabilityPct: 40 });
    expect(await raw(j.id)).toMatchObject({ crmProbabilityPct: 40, crmWeightedMinor: 400_000_00 });
    await upd(u, j.id, { stage: stage("Kontaktováno").id, crmProbabilityPct: 55 });
    expect(await raw(j.id)).toMatchObject({ crmProbabilityPct: 55, crmWeightedMinor: 550_000_00 });
    await upd(u, j.id, { stage: stage("Obhlídka").id });
    expect(await raw(j.id)).toMatchObject({
      crmProbabilityPct: null,
      crmWeightedMinor: 350_000_00,
    });
  });

  it("změna ceny zakázky přepočítá váženou hodnotu", async () => {
    const u = await boss();
    const j = await mkJob(u);
    await upd(u, j.id, { value: 2_000_000_00 });
    expect((await raw(j.id)).crmWeightedMinor).toBe(200_000_00);
  });

  it("vážená hodnota je za oprávněním ekonomiky (bez něj ji aktér nevidí)", async () => {
    const u = await boss();
    const foreman = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["kontakty.read", "all"],
    ]);
    const j = await mkJob(u);
    const { queryRecords } = await import("@rebar/core/entities");
    const page = await queryRecords(foreman.ctx, registry, jobE, { q: String(j.title) });
    expect(page.rows[0]).toBeDefined();
    expect(page.rows[0]).not.toHaveProperty("crmWeighted");
    const withEcon = await queryRecords(u.ctx, registry, jobE, { q: String(j.title) });
    expect(withEcon.rows[0]).toHaveProperty("crmWeighted");
  });
});

describe("recomputeJobCrm", () => {
  async function mkType() {
    const [t] = await app.db.select().from(crmActivityType).limit(1);
    return t!.id;
  }
  async function mkActivity(
    u: User,
    jobId: string,
    extra: Partial<typeof crmActivity.$inferInsert> = {},
  ) {
    const [a] = await app.db
      .insert(crmActivity)
      .values({
        typeId: await mkType(),
        subject: "Zavolat",
        jobId,
        assigneeId: u.id,
        createdBy: u.id,
        ...extra,
      })
      .returning();
    return a!;
  }

  it("spočítá otevřené, zpožděné, nejbližší a poslední aktivitu", async () => {
    const u = await boss();
    const j = await mkJob(u);
    const now = new Date();
    await mkActivity(u, j.id, { dueAt: new Date(now.getTime() - 2 * DAY) }); // po termínu
    await mkActivity(u, j.id, { dueAt: new Date(now.getTime() + 3 * DAY) });
    await mkActivity(u, j.id, { dueAt: null }); // bez termínu je otevřená, ale nemá další termín
    await mkActivity(u, j.id, {
      dueAt: new Date(now.getTime() - 5 * DAY),
      doneAt: new Date(now.getTime() - 4 * DAY),
    });
    await mkActivity(u, j.id, {
      dueAt: new Date(now.getTime() - 9 * DAY),
      doneAt: new Date(now.getTime() - 8 * DAY),
    });
    // smazaná aktivita se nepočítá
    await mkActivity(u, j.id, { dueAt: new Date(now.getTime() - 1 * DAY), deletedAt: now });
    const state = await recomputeJobCrm(u.ctx, j.id, now);
    expect(state).toMatchObject({ openActivities: 3, overdueActivities: 1 });
    // nejbližší otevřená aktivita je ta zpožděná (před dvěma dny)
    expect(state.nextActivityAt!.getTime()).toBeLessThan(now.getTime() - DAY);
    expect(state.lastActivityAt!.getTime()).toBeLessThan(now.getTime() - 3 * DAY);
    const r = await raw(j.id);
    expect(r).toMatchObject({ crmOpenActivities: 3, crmOverdueActivities: 1 });
    expect(r.crmNextActivityAt).not.toBeNull();
    expect(r.crmLastActivityAt!.getTime()).toBe(state.lastActivityAt!.getTime());
    // idempotentní a bez posunu `updated_at`
    const stamp = (await raw(j.id)).updatedAt;
    await recomputeJobCrm(u.ctx, j.id, now);
    expect((await raw(j.id)).updatedAt).toEqual(stamp);
  });

  it("celodenní aktivita je po termínu až od dalšího dne", async () => {
    const u = await boss();
    const j = await mkJob(u);
    const midnight = pragueMidnight();
    await mkActivity(u, j.id, { dueAt: midnight, allDay: true });
    expect((await recomputeJobCrm(u.ctx, j.id)).overdueActivities).toBe(0);
    await mkActivity(u, j.id, { dueAt: new Date(midnight.getTime() - DAY), allDay: true });
    expect((await recomputeJobCrm(u.ctx, j.id)).overdueActivities).toBe(1);
  });

  it("hnije otevřený obchod po uplynutí dnů ve stavu bez aktivity; poslední aktivita hnití odloží", async () => {
    const u = await boss();
    const j = await mkJob(u); // Nová poptávka: hnití po 3 dnech
    const now = new Date();
    expect((await recomputeJobCrm(u.ctx, j.id, now)).rotting).toBe(false);
    const later = new Date(now.getTime() + 5 * DAY);
    expect((await recomputeJobCrm(u.ctx, j.id, later)).rotting).toBe(true);
    expect((await raw(j.id)).crmRotting).toBe(true);
    await mkActivity(u, j.id, { doneAt: new Date(later.getTime() - DAY), dueAt: null });
    expect((await recomputeJobCrm(u.ctx, j.id, later)).rotting).toBe(false);
    // vyhraný obchod nehnije
    await winDeal(u.ctx, j.id, deps());
    expect((await recomputeJobCrm(u.ctx, j.id, new Date(now.getTime() + 60 * DAY))).rotting).toBe(
      false,
    );
  });

  it("neexistující zakázka vrátí chybu", async () => {
    const u = await boss();
    await expect(recomputeJobCrm(u.ctx, crypto.randomUUID())).rejects.toThrow(/nenalezena/);
  });
});

describe("výhra, prohra, znovuotevření", () => {
  it("výhra z kteréhokoli obchodního stavu přesune zakázku do přípravy a nastaví datum výhry", async () => {
    const u = await boss();
    for (const from of ["Nová poptávka", "Obhlídka", "Jednání"]) {
      const j = await mkJob(u, { stage: stage(from).id });
      const res = await winDeal(u.ctx, j.id, deps());
      expect(res).toMatchObject({ phase: "preparation", stageId: stage("Příprava").id });
      const r = await raw(j.id);
      expect(r).toMatchObject({ phase: "preparation", stageId: stage("Příprava").id });
      expect(r.wonAt).not.toBeNull();
      expect(r.crmWeightedMinor).toBe(1_000_000_00); // vyhráno = 100 %
    }
  });

  it("výhra poběží přes hooky: bez zákazníka a adresy do nabídky nejde, výhra z nabídky ano", async () => {
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Nabídka v přípravě").id, address: "Nová 1" });
    await expect(winDeal(u.ctx, j.id, deps())).resolves.toMatchObject({ phase: "preparation" });
    await expect(winDeal(u.ctx, j.id, deps())).rejects.toThrow(/už je vyhraná/);
  });

  it("prohra vyžaduje důvod z číselníku, ukládá poznámku, nuluje váhu a zapíše audit", async () => {
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Obhlídka").id });
    await expect(loseDeal(u.ctx, j.id, { reasonKey: "neexistuje" }, deps())).rejects.toThrow(
      /ze seznamu/,
    );
    const res = await loseDeal(u.ctx, j.id, { reasonKey: "price", note: "  Drahé  " }, deps());
    expect(res.phase).toBe("lost");
    const r = await raw(j.id);
    expect(r).toMatchObject({
      phase: "lost",
      lostReason: "price",
      crmLostNote: "Drahé",
      crmWeightedMinor: 0,
    });
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityType, "job"), eq(schema.auditLog.entityId, j.id)));
    expect(audit.some((a) => /Obchod prohrán/.test(a.summary ?? ""))).toBe(true);
    expect(audit.some((a) => a.action === "phase")).toBe(true);
    await expect(loseDeal(u.ctx, j.id, { reasonKey: "price" }, deps())).rejects.toThrow(
      /už je prohraná/,
    );
    await expect(winDeal(u.ctx, j.id, deps())).rejects.toThrow(/znovu otevřete/);
  });

  it("znovuotevření vrátí prohraný obchod do původního stavu a vymaže důvod i poznámku", async () => {
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Nabídka odeslána").id, address: "Nová 1" });
    await loseDeal(u.ctx, j.id, { reasonKey: "timing", note: "Až příští rok" }, deps());
    const res = await reopenDeal(u.ctx, j.id, deps());
    expect(res).toMatchObject({ phase: "offer", stageId: stage("Nabídka odeslána").id });
    const r = await raw(j.id);
    expect(r).toMatchObject({
      phase: "offer",
      stageId: stage("Nabídka odeslána").id,
      lostReason: null,
      crmLostNote: null,
    });
    expect(r.crmWeightedMinor).toBe(650_000_00);
    // v historii zůstal pobyt v prohráno
    const names = (await stageHistory(u.ctx, j.id)).map((h) => h.stageName);
    expect(names).toEqual(["Nabídka odeslána", "Prohráno", "Nabídka odeslána"]);
    await expect(reopenDeal(u.ctx, j.id, deps())).rejects.toThrow(/není co znovu otevírat/);
  });

  it("prohra po výhře (příprava) jde a znovuotevření ji vrátí do poslední povolené fáze", async () => {
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Obhlídka").id });
    await winDeal(u.ctx, j.id, deps());
    await loseDeal(u.ctx, j.id, { reasonKey: "cancelled" }, deps());
    // z prohry se smí jen do poptávky nebo nabídky: původní stav Obhlídka
    const res = await reopenDeal(u.ctx, j.id, deps());
    expect(res.stageId).toBe(stage("Obhlídka").id);
  });

  it("znovuotevření právě vyhraného obchodu vrátí do nabídky; po zahájení realizace už ne", async () => {
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Jednání").id, address: "Nová 1" });
    await winDeal(u.ctx, j.id, deps());
    const res = await reopenDeal(u.ctx, j.id, deps());
    expect(res).toMatchObject({ phase: "offer", stageId: stage("Jednání").id });
    await winDeal(u.ctx, j.id, deps());
    // zahájení realizace vyžaduje datum zahájení a odpovědnou osobu (hooky přechodu)
    await upd(u, j.id, {
      stage: stage("Realizace").id,
      startDate: "2026-11-02",
      manager: u.id,
    });
    await expect(reopenDeal(u.ctx, j.id, deps())).rejects.toThrow(/už znovu otevřít nejde/);
  });

  it("bez oprávnění k zápisu zakázky přechod selže", async () => {
    const u = await boss();
    const reader = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["kontakty.read", "all"],
    ]);
    const j = await mkJob(u);
    await expect(winDeal(reader.ctx, j.id, deps())).rejects.toThrow();
    await expect(loseDeal(reader.ctx, j.id, { reasonKey: "price" }, deps())).rejects.toThrow();
    expect((await raw(j.id)).phase).toBe("inquiry");
  });
});

describe("archiv", () => {
  it("archivace nastaví čas, odarchivování ho vrátí; opakování selže", async () => {
    const u = await boss();
    const j = await mkJob(u);
    await archiveDeal(u.ctx, j.id);
    const r = await raw(j.id);
    expect(r.crmArchivedAt).not.toBeNull();
    expect(r.crmRotting).toBe(false);
    await expect(archiveDeal(u.ctx, j.id)).rejects.toThrow(/už je archivovaná/);
    await unarchiveDeal(u.ctx, j.id);
    expect((await raw(j.id)).crmArchivedAt).toBeNull();
    await expect(unarchiveDeal(u.ctx, j.id)).rejects.toThrow(/není archivovaná/);
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityType, "job"), eq(schema.auditLog.entityId, j.id)));
    expect(audit.filter((a) => /archiv/i.test(a.summary ?? ""))).toHaveLength(2);
  });

  it("archivovaný obchod nehnije", async () => {
    const u = await boss();
    const j = await mkJob(u);
    await archiveDeal(u.ctx, j.id);
    const state = await recomputeJobCrm(u.ctx, j.id, new Date(Date.now() + 30 * DAY));
    expect(state.rotting).toBe(false);
  });
});

describe("pravidla kvality polí (povinné od stavu)", () => {
  async function setRules(u: User, rules: FieldRule[]) {
    await setFieldRulesCommand.handler(u.ctx, { rules }, deps());
  }
  afterAll(async () => {
    await app.db.delete(schema.setting).where(eq(schema.setting.key, "crm.fieldRules"));
  });

  it("přechod do stavu od zvoleného pořadí bez vyplněného pole selže českou větou", async () => {
    const u = await boss();
    await setRules(u, [
      { attr: "address", fromStageId: stage("Obhlídka").id, level: "required" },
      { attr: "siteCity", fromStageId: stage("Obhlídka").id, level: "required" },
    ]);
    const j = await mkJob(u);
    // do stavu před hranicí jde bez polí
    await upd(u, j.id, { stage: stage("Kontaktováno").id });
    await expect(upd(u, j.id, { stage: stage("Obhlídka").id })).rejects.toThrow(
      "Před přesunem do stavu „Obhlídka“ vyplňte pole: „Adresa stavby“, „Město stavby“.",
    );
    await upd(u, j.id, { address: "Nová 1" });
    await expect(upd(u, j.id, { stage: stage("Obhlídka").id })).rejects.toThrow(/„Město stavby“/);
    // pole se může vyplnit stejnou úpravou jako stav
    await upd(u, j.id, { stage: stage("Obhlídka").id, siteCity: "Plzeň" });
    expect((await raw(j.id)).stageId).toBe(stage("Obhlídka").id);
    // dál (pozdější stav) se pravidlo uplatní taky, vyplněné pole nevadí
    await upd(u, j.id, { stage: stage("Nabídka v přípravě").id });
  });

  it("pravidlo platí i pro výhru; prohra a pozastavení se nikdy neblokují", async () => {
    const u = await boss();
    await setRules(u, [{ attr: "address", fromStageId: stage("Obhlídka").id, level: "required" }]);
    const j = await mkJob(u, { stage: stage("Kontaktováno").id });
    await expect(winDeal(u.ctx, j.id, deps())).rejects.toThrow(/vyplňte pole: „Adresa stavby“/);
    await loseDeal(u.ctx, j.id, { reasonKey: "price" }, deps());
    expect((await raw(j.id)).phase).toBe("lost");
  });

  it("pole „důležité“ přechod neblokuje; cena nula se bere jako nevyplněná", async () => {
    const u = await boss();
    await setRules(u, [
      { attr: "address", fromStageId: stage("Obhlídka").id, level: "important" },
      { attr: "value", fromStageId: stage("Obhlídka").id, level: "required" },
    ]);
    const j = await mkJob(u, { value: 0 });
    await expect(upd(u, j.id, { stage: stage("Obhlídka").id })).rejects.toThrow(/„Hodnota“/);
    await upd(u, j.id, { value: 10_000_00, stage: stage("Obhlídka").id });
  });

  it("nastavení ověří existenci pole a stavu a vyžaduje oprávnění ke správě", async () => {
    const u = await boss();
    await expect(
      setFieldRulesCommand.handler(
        u.ctx,
        { rules: [{ attr: "neexistuje", fromStageId: stage("Obhlídka").id, level: "required" }] },
        deps(),
      ),
    ).rejects.toThrow(/neexistuje/);
    await expect(
      setFieldRulesCommand.handler(
        u.ctx,
        { rules: [{ attr: "address", fromStageId: crypto.randomUUID(), level: "required" }] },
        deps(),
      ),
    ).rejects.toThrow(/Zvolený stav neexistuje/);
    const reader = await makeUser(app.db, [["zakazky.read", "all"]]);
    await expect(
      setFieldRulesCommand.handler(
        reader.ctx,
        { rules: [{ attr: "address", fromStageId: stage("Obhlídka").id, level: "required" }] },
        deps(),
      ),
    ).rejects.toThrow();
    await setRules(u, [{ attr: "address", fromStageId: stage("Obhlídka").id, level: "required" }]);
    const got = (await fieldRulesCommand.handler(u.ctx, {}, deps())) as {
      rules: { attrLabel: string; stageName: string | null }[];
      attributes: { key: string }[];
    };
    expect(got.rules).toMatchObject([{ attrLabel: "Adresa stavby", stageName: "Obhlídka" }]);
    expect(got.attributes.map((a) => a.key)).toContain("siteCity");
    expect(await readFieldRules(app.db)).toHaveLength(1);
    // nastavení má definovaný tvar
    expect(fieldRulesSetting.default).toEqual({ rules: [] });
  });
});

describe("ensureCrmDefaults na stávající instanci", () => {
  it("opakované volání nic nemění a typy aktivit jsou doplněné", async () => {
    const again = await ensureCrmDefaults(app.db);
    expect(again).toMatchObject({
      activityTypesAdded: 0,
      jobStagesAdded: 0,
      jobStagesRenamed: 0,
      inquiryStagesRemoved: 0,
      inquiryStagesRenamed: 0,
    });
    const keys = (await app.db.select().from(crmActivityType)).map((t) => t.key);
    expect(keys).toEqual(
      expect.arrayContaining(["call", "meeting", "task", "deadline", "email", "site_visit"]),
    );
    // přesně jednou
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("nic nenarušilo pořadí a pravděpodobnosti stavů", async () => {
    const pipeline = (await getPipeline(app.db, "job", "default"))!;
    expect(pipeline.stages.map((s) => s.name).slice(0, 7)).toEqual([
      "Nová poptávka",
      "Kontaktováno",
      "Obhlídka",
      "Nabídka v přípravě",
      "Nabídka odeslána",
      "Jednání",
      "Příprava",
    ]);
    expect(pipeline.stages.slice(0, 6).map((s) => s.probabilityPct)).toEqual([
      10, 20, 35, 50, 65, 80,
    ]);
    expect(pipeline.stages.slice(0, 6).map((s) => s.rottingDays)).toEqual([3, 5, 7, 5, 10, 7]);
  });
});
