import { and, eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ServiceMap } from "@rebar/core/contracts";
import { schema } from "@rebar/core/db";
import { setDomainEvents, type DomainEvent, type DomainEventName } from "@rebar/core/events";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import { connectAppDb, createStubServices, makeUser } from "@rebar/core/testing";
import { company, person } from "@rebar/kontakty/schema";
import { manifest } from "../index";
import {
  completeJob,
  createJob,
  createJobsFromWonDeal,
  getJobBrief,
  getJobBriefs,
  listTemplates,
  setCurrentPhase,
  setMarketingStage,
} from "../api";
import { job, jobMember, jobPhase, jobTemplate } from "../schema";
import { ensureDefaultTemplates } from "../templates/defaults";
import { commands } from "./commands";
import { commands as templateCommands } from "../templates/commands";
import { boardImpl, jobDetailImpl, prefillImpl } from "./detail";
import { slippingJobs, calendarLayers, clientCard, dashboardMetrics, privatePaths } from "./insights";
import { todayPrague, addDays } from "../shared";

/*
  Integrační testy modulu „zakazky“ proti databázi: vznik zakázky ze šablony, z vyhraného obchodu a ručně, fáze (pás,
  dokončení, marketing), stavy a ukončení, tým, šablony, soukromé zakázky a rozsah „jen moje“. Služby ostatních modulů
  jsou zaznamenávající stuby (`createStubServices`), události zachytává registr `setDomainEvents`.
*/

const app = connectAppDb();
afterAll(() => app.close());

type Stub = Parameters<typeof createStubServices>[0];
type Person = Awaited<ReturnType<typeof makeUser>>;

const cmd = (name: string) => {
  const c = [...commands, ...templateCommands].find((x) => x.name === name);
  if (!c) throw new Error(`Příkaz ${name} neexistuje`);
  return c;
};
/** Zavolá příkaz stejně jako vstupní bod aplikace: zod vstup, oprávnění a handler. */
async function run(who: Person, name: string, input: unknown, deps: ModuleDeps) {
  const c = cmd(name);
  const keys = [c.permission ?? []].flat();
  if (keys.length && !keys.some((k) => who.ctx.actor.permissions.has(k) || who.ctx.actor.unrestricted))
    throw new PermissionError();
  return c.handler(who.ctx, c.input.parse(input), deps);
}

let owner: Person;
let partner: Person;
let external: Person;
let c1: string; // klient A
let c2: string; // klient B

let events: DomainEvent[] = [];
const sees = (name: DomainEventName) => events.filter((e) => e.name === name);

function setup(stub: Stub = {}) {
  const { services, calls } = createStubServices(stub);
  const deps = { services } as unknown as ModuleDeps;
  events = [];
  const capture = (name: DomainEventName) => [
    async (_c: unknown, e: DomainEvent) => void events.push(e),
  ];
  setDomainEvents(
    Object.fromEntries(
      (
        [
          "project.created",
          "project.phase_changed",
          "project.phase_completed",
          "project.completed",
        ] as DomainEventName[]
      ).map((n) => [n, capture(n)]),
    ),
    () => deps,
  );
  return { deps, calls };
}
afterEach(() => setDomainEvents(undefined, undefined));

beforeAll(async () => {
  await ensureSeries(app.db, manifest.seed?.series ?? []);
  const all = ["read", "create", "write", "delete", "export", "templates"].map(
    (a): [string, "all"] => [`zakazky.${a}`, "all"],
  );
  owner = await makeUser(app.db, [...all, ["private.read", "all"], ["finance.read", "all"]], {
    name: "Ondřej",
  });
  partner = await makeUser(app.db, [...all, ["finance.read", "all"]], { name: "Patrik" });
  external = await makeUser(
    app.db,
    [
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
    ],
    { name: "Externista" },
  );
  const [a, b] = await app.db
    .insert(company)
    .values([{ name: "Novák s.r.o." }, { name: "Dvořák a syn" }])
    .returning({ id: company.id });
  c1 = a!.id;
  c2 = b!.id;
  await ensureDefaultTemplates(app.db);
});

const base = (over: Record<string, unknown> = {}) => ({
  title: "Nový web",
  type: "web" as const,
  companyId: c1,
  ownerId: owner.id,
  startDate: "2026-10-01",
  ...over,
});

const phasesOf = (jobId: string) =>
  app.db
    .select()
    .from(jobPhase)
    .where(and(eq(jobPhase.jobId, jobId), isNull(jobPhase.deletedAt)))
    .orderBy(jobPhase.position);
const jobOf = async (id: string) => (await app.db.select().from(job).where(eq(job.id, id)))[0]!;
const templateByName = async (name: string) =>
  (await app.db.select().from(jobTemplate).where(eq(jobTemplate.name, name)))[0]!;

describe("výchozí šablony", () => {
  it("se založí jednou: čtyři šablony, výchozí pro každý typ", async () => {
    const rows = await app.db.select().from(jobTemplate);
    expect(rows.map((r) => r.name).sort()).toEqual([
      "Marketing – retainer",
      "Marketing – úvodní fáze",
      "Systémy",
      "Web",
    ]);
    expect(await ensureDefaultTemplates(app.db)).toBe(0);
    const list = await listTemplates(owner.ctx);
    expect(list.filter((t) => t.isDefault).map((t) => t.type).sort()).toEqual([
      "marketing",
      "systemy",
      "web",
    ]);
    expect((await listTemplates(owner.ctx, "web")).map((t) => t.name)).toEqual(["Web"]);
  });
});

describe("založení zakázky ze šablony", () => {
  it("výchozí šablona typu: číslo Z-RRRR-NNN, fáze s daty, úkoly a služby ostatních modulů, událost", async () => {
    const { deps, calls } = setup({ tasks: true, finance: true, clients: true });
    const out = await createJob(owner.ctx, deps, base({ leadId: partner.id, memberIds: [external.id] }));
    expect(out.number).toMatch(/^Z-\d{4}-\d{3}$/);
    const j = await jobOf(out.id);
    expect(j).toMatchObject({
      type: "web",
      status: "active",
      billingModel: "one_off",
      marketingStage: null,
      startDate: "2026-10-01",
      dueDate: "2026-11-21",
      isPrivate: false,
    });
    const phases = await phasesOf(out.id);
    expect(phases.map((p) => [p.name, p.status, p.plannedStart])).toEqual([
      ["Podklady", "in_progress", "2026-10-01"],
      ["Návrh", "not_started", "2026-10-08"],
      ["Vývoj", "not_started", "2026-10-18"],
      ["Revize klienta", "not_started", "2026-11-08"],
      ["Spuštění", "not_started", "2026-11-15"],
      ["Předání", "not_started", "2026-11-18"],
    ]);
    expect(j.currentPhaseId).toBe(phases[0]!.id);
    expect(j.templateId).toBe((await templateByName("Web")).id);

    const members = await app.db.select().from(jobMember).where(eq(jobMember.jobId, out.id));
    expect(members.map((m) => [m.userId, m.role]).sort()).toEqual(
      [
        [partner.id, "lead"],
        [external.id, "member"],
      ].sort(),
    );

    const byMethod = (m: string) => calls.filter((c) => c.method === m);
    expect(byMethod("addServices")[0]!.args.slice(1)).toEqual([c1, ["web"]]);
    const taskCall = byMethod("createFromTemplate")[0]!.args[1] as Parameters<
      ServiceMap["tasks"]["createFromTemplate"]
    >[1];
    expect(taskCall).toMatchObject({ jobId: out.id, ownerId: owner.id, leadId: partner.id, startDate: "2026-10-01" });
    expect(taskCall.phaseIds).toEqual(phases.map((p) => p.id));
    expect(taskCall.items).toHaveLength(11);
    expect(taskCall.items[0]).toMatchObject({
      title: "Získat od klienta podklady (texty, fotografie, logo)",
      phaseId: phases[0]!.id,
      dueDate: "2026-10-08",
      assigneeId: owner.id,
    });
    const fin = byMethod("initJobFinance")[0]!.args[1] as Record<string, unknown>;
    expect(fin).toMatchObject({ jobId: out.id, ownerId: owner.id, billingModel: "one_off", templatePayments: [] });
    expect(fin.split).toBeUndefined();

    const [created] = sees("project.created");
    expect(created!.entity).toEqual({ type: "job", id: out.id, isPrivate: false });
    expect(created!.data).toMatchObject({
      project: { id: out.id, number: out.number, type: "web", companyId: c1, ownerId: owner.id, startDate: "2026-10-01" },
    });
  });

  it("čísla zakázek jdou po sobě a zakázka v budoucnu je plánovaná", async () => {
    const { deps } = setup();
    const a = await createJob(owner.ctx, deps, base());
    const b = await createJob(owner.ctx, deps, base({ startDate: addDays(todayPrague(), 10) }));
    const n = (s: string) => Number(s.slice(-3));
    expect(n(b.number)).toBe(n(a.number) + 1);
    const j = await jobOf(b.id);
    expect(j.status).toBe("planned");
    expect((await phasesOf(b.id)).every((p) => p.status === "not_started")).toBe(true);
  });

  it("bez zapnutých služeb se zakázka založí (úkoly a platby se přeskočí)", async () => {
    const { deps } = setup();
    const out = await createJob(owner.ctx, deps, base());
    expect((await phasesOf(out.id)).length).toBe(6);
  });

  it("prázdná zakázka bez šablony nemá fáze ani aktuální fázi", async () => {
    const { deps, calls } = setup({ tasks: true, finance: true });
    const out = await createJob(owner.ctx, deps, base({ withoutTemplate: true }));
    expect(await phasesOf(out.id)).toEqual([]);
    const j = await jobOf(out.id);
    expect(j).toMatchObject({ currentPhaseId: null, templateId: null, dueDate: null });
    expect(calls.some((c) => c.method === "createFromTemplate")).toBe(false);
    expect(calls.some((c) => c.method === "initJobFinance")).toBe(true);
  });

  it("šablona jiného typu nebo archivovaná se odmítne, neexistující klient také", async () => {
    const { deps } = setup();
    const marketing = await templateByName("Marketing – úvodní fáze");
    await expect(
      createJob(owner.ctx, deps, base({ templateId: marketing.id })),
    ).rejects.toThrow(/jiný typ/);
    await expect(
      createJob(owner.ctx, deps, base({ companyId: "00000000-0000-4000-8000-000000000009" })),
    ).rejects.toThrow(UserError);
    await expect(
      createJob(owner.ctx, deps, base({ ownerId: "00000000-0000-4000-8000-000000000009" })),
    ).rejects.toThrow(UserError);
  });

  it("změna šablony se nepromítne do běžící zakázky", async () => {
    const { deps } = setup();
    const out = await createJob(owner.ctx, deps, base());
    const tpl = await templateByName("Web");
    await run(owner, "zakazky.template.update", {
      id: tpl.id,
      payload: { phases: [{ name: "Jediná fáze" }] },
    }, deps);
    expect((await phasesOf(out.id)).map((p) => p.name)).toContain("Podklady");
    const next = await createJob(owner.ctx, deps, base());
    expect((await phasesOf(next.id)).map((p) => p.name)).toEqual(["Jediná fáze"]);
    // vrátit původní šablonu pro další testy
    const { DEFAULT_TEMPLATES } = await import("../templates/defaults");
    await run(owner, "zakazky.template.update", {
      id: tpl.id,
      payload: DEFAULT_TEMPLATES.find((t) => t.name === "Web")!.payload,
    }, deps);
  });
});

describe("marketing: úvodní fáze a retainer", () => {
  it("úvodní fáze: dvě platby po 7 000 Kč (Patrik fakturuje první, Ondřej druhou), stav úvodní fáze", async () => {
    const { deps, calls } = setup({ tasks: true, finance: true });
    // vlastník zakázky je Patrik, druhý partner je Ondřej (první uživatel s finance.read, který není vlastník)
    const out = await createJob(
      partner.ctx,
      deps,
      base({ type: "marketing", ownerId: partner.id, title: "Kampaně" }),
    );
    const j = await jobOf(out.id);
    expect(j).toMatchObject({ billingModel: "intro_then_retainer", marketingStage: "intro" });
    const fin = calls.find((c) => c.method === "initJobFinance")!.args[1] as {
      templatePayments: { amountMinor: number; kind: string; issuerId: string; dueOn: string }[];
    };
    expect(fin.templatePayments.map((p) => [p.amountMinor, p.kind, p.issuerId, p.dueOn])).toEqual([
      [700_000, "intro", partner.id, "2026-10-15"],
      [700_000, "intro", owner.id, "2026-11-15"],
    ]);
    const phases = await phasesOf(out.id);
    expect(phases.map((p) => p.role)).toEqual([null, null, null, null, "intro_evaluation", "retainer"]);
    expect(phases[0]!.status).toBe("in_progress");
  });

  it("rovnou retainer: bez úvodních plateb, vyhodnocení přeskočeno, retainer předán financím", async () => {
    const { deps, calls } = setup({ tasks: true, finance: true });
    const retainer = {
      amountMinor: 1_500_000,
      fromMonth: "2026-11",
      issueDay: 5,
      issuerMode: "alternate" as const,
      issuerId: owner.id,
      split: [],
    };
    const out = await createJob(owner.ctx, deps, base({ type: "marketing", retainer }));
    const j = await jobOf(out.id);
    expect(j).toMatchObject({ billingModel: "retainer", marketingStage: "retainer" });
    const phases = await phasesOf(out.id);
    expect(phases.find((p) => p.role === "intro_evaluation")!.status).toBe("skipped");
    const fin = calls.find((c) => c.method === "initJobFinance")!.args[1] as Record<string, unknown>;
    expect(fin.templatePayments).toEqual([]);
    expect(fin.retainer).toEqual(retainer);
    const tasks = calls.find((c) => c.method === "createFromTemplate")!.args[1] as {
      items: { title: string }[];
    };
    expect(tasks.items.some((i) => /Vyhodnocení|Schůzka s klientem/.test(i.title))).toBe(false);
  });

  it("vyhodnocení úvodní fáze vyšle phase_completed s rolí, Retainer se klikem nezvolí a rozhodnutí ho nastaví", async () => {
    const { deps } = setup({ tasks: true });
    const out = await createJob(owner.ctx, deps, base({ type: "marketing", title: "Kampaně 2" }));
    const phases = await phasesOf(out.id);
    const evaluation = phases.find((p) => p.role === "intro_evaluation")!;
    const retainer = phases.find((p) => p.role === "retainer")!;
    events.length = 0;

    // dokončit vyhodnocení: dřívější fáze se dokončí také, aktuální zůstane na vyhodnocení (Retainer čeká na volbu)
    const done = await run(owner, "zakazky.phase.complete", { jobId: out.id, phaseId: evaluation.id }, deps);
    expect((done as { completedPhaseIds: string[] }).completedPhaseIds).toHaveLength(5);
    const completed = sees("project.phase_completed");
    expect(completed.map((e) => (e.data as { name: string }).name)).toEqual(
      phases.slice(0, 5).map((p) => p.name),
    );
    const evalEvent = completed.at(-1)!.data as Record<string, unknown>;
    expect(evalEvent).toMatchObject({
      jobId: out.id,
      phaseId: evaluation.id,
      role: "intro_evaluation",
      type: "marketing",
      marketingStage: "intro",
      isLast: false,
    });
    expect((await jobOf(out.id)).currentPhaseId).toBe(evaluation.id);

    // klik na Retainer je zakázaný
    await expect(
      run(owner, "zakazky.setPhase", { jobId: out.id, phaseId: retainer.id }, deps),
    ).rejects.toThrow(/Pokračovat na retainer/);
    const preview = (await run(owner, "zakazky.phase.preview", { jobId: out.id, phaseId: retainer.id }, deps)) as {
      blockedReason: string | null;
    };
    expect(preview.blockedReason).toMatch(/Pokračovat na retainer/);

    // rozhodnutí (volá finance): stav retainer přesune zakázku do fáze Retainer
    events.length = 0;
    await setMarketingStage(owner.ctx, out.id, "decision");
    expect((await jobOf(out.id)).currentPhaseId).toBe(evaluation.id);
    await setMarketingStage(owner.ctx, out.id, "retainer");
    const j = await jobOf(out.id);
    expect(j.marketingStage).toBe("retainer");
    expect(j.currentPhaseId).toBe(retainer.id);
    const after = await phasesOf(out.id);
    expect(after.find((p) => p.id === retainer.id)!.status).toBe("in_progress");
    expect(after.find((p) => p.id === evaluation.id)!.status).toBe("done");
    expect(sees("project.phase_changed")).toHaveLength(1);

    // Ukončit: dokončí zakázku a marketing je ukončen
    const end = await completeJob(owner.ctx, deps, { jobId: out.id, reason: "retainer_ended" });
    expect(end.clientHasOtherActiveJob).toBe(true); // klient má další živé zakázky z předchozích testů
    expect(await jobOf(out.id)).toMatchObject({ status: "done", marketingStage: "ended" });
    expect(sees("project.completed")[0]!.data).toMatchObject({ reason: "retainer_ended" });
  });

  it("stav marketingu jen u marketingové zakázky", async () => {
    const { deps } = setup();
    const web = await createJob(owner.ctx, deps, base());
    await expect(setMarketingStage(owner.ctx, web.id, "decision")).rejects.toThrow(UserError);
  });
});

describe("zakázky z vyhraného obchodu", () => {
  const deal = "00000000-0000-4000-8000-0000000000d1";
  const row = (type: "web" | "marketing" | "systemy", over: Record<string, unknown> = {}) => ({
    type,
    templateId: null,
    title: `Novák – ${type}`,
    startDate: "2026-10-05",
    ownerId: owner.id,
    memberIds: [],
    ...over,
  });

  it("více služeb: řádek za řádkem, vazba na obchod, cena zůstane prázdná; služba klienta a události", async () => {
    const { deps, calls } = setup({ tasks: true, finance: true, clients: true });
    const out = await createJobsFromWonDeal(owner.ctx, deps, {
      dealId: deal,
      companyId: c1,
      rows: [row("web"), row("marketing", { billingModel: "intro_then_retainer" })],
      dealValueMinor: 5_000_000,
    });
    expect(out.jobs.map((j) => j.type)).toEqual(["web", "marketing"]);
    const rows = await Promise.all(out.jobs.map((j) => jobOf(j.id)));
    expect(rows.every((r) => r.dealId === deal && r.priceMinor === null)).toBe(true);
    expect(calls.filter((c) => c.method === "addServices")).toHaveLength(2);
    expect(sees("project.created")).toHaveLength(2);
    expect(calls.filter((c) => c.method === "initJobFinance")).toHaveLength(2);
  });

  it("jediná služba: cena se předvyplní hodnotou obchodu (R-39)", async () => {
    const { deps } = setup();
    const out = await createJobsFromWonDeal(owner.ctx, deps, {
      dealId: deal,
      companyId: c1,
      rows: [row("systemy", { title: "" })],
      dealValueMinor: 12_000_000,
    });
    const j = await jobOf(out.jobs[0]!.id);
    expect(j.priceMinor).toBe(12_000_000);
    expect(j.title).toBe("Novák s.r.o. – Systémy");
  });

  it("prázdné řádky nic nezaloží; chyba v jednom řádku vrátí všechny", async () => {
    const { deps } = setup();
    expect(await createJobsFromWonDeal(owner.ctx, deps, { dealId: deal, companyId: c1, rows: [] })).toEqual({
      jobs: [],
    });
    const before = await app.db.select().from(job);
    await expect(
      createJobsFromWonDeal(owner.ctx, deps, {
        dealId: deal,
        companyId: c1,
        rows: [row("web", { title: "Dobrý řádek" }), row("systemy", { ownerId: "00000000-0000-4000-8000-000000000009" })],
      }),
    ).rejects.toThrow(UserError);
    expect((await app.db.select().from(job)).length).toBe(before.length);
  });

  it("soukromý obchod dává soukromé zakázky i fáze", async () => {
    const { deps } = setup();
    const privateDeal = "00000000-0000-4000-8000-0000000000d2";
    await app.db.insert(schema.privateRecord).values({ entityType: "deal", entityId: privateDeal });
    const out = await createJobsFromWonDeal(owner.ctx, deps, {
      dealId: privateDeal,
      companyId: c1,
      rows: [row("web")],
    });
    const j = await jobOf(out.jobs[0]!.id);
    expect(j.isPrivate).toBe(true);
    expect((await phasesOf(j.id)).every((p) => p.isPrivate)).toBe(true);
    expect(sees("project.created")[0]!.entity.isPrivate).toBe(true);
    expect(
      await app.db
        .select()
        .from(schema.privateRecord)
        .where(eq(schema.privateRecord.entityId, j.id)),
    ).toHaveLength(1);
    // partner ji nevidí
    expect(await getJobBrief(partner.ctx, j.id)).toBeNull();
    expect(await getJobBrief(owner.ctx, j.id)).toMatchObject({ id: j.id, isPrivate: true });
  });

  it("předvyplnění dialogu: řádek za službu s výchozí šablonou a cenou jen u jediné služby", async () => {
    const one = await prefillImpl(owner.ctx, { companyId: c1, services: ["web"], ownerId: owner.id, dealValueMinor: 100 });
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({
      type: "web",
      templateName: "Web",
      title: "Novák s.r.o. – Web",
      priceMinor: 100,
      ownerId: owner.id,
      startDate: todayPrague(),
    });
    const two = await prefillImpl(owner.ctx, { companyId: c1, services: ["web", "marketing"], dealValueMinor: 100 });
    expect(two.map((r) => [r.type, r.priceMinor, r.billingModel])).toEqual([
      ["web", null, "one_off"],
      ["marketing", null, "intro_then_retainer"],
    ]);
  });
});

describe("fáze zakázky", () => {
  it("klik dopředu dokončí dřívější fáze, události a dotaz na otevřené úkoly", async () => {
    const tasksExt = {
      openCountsByPhase: async (_c: unknown, i: { phaseIds: string[] }) =>
        Object.fromEntries(i.phaseIds.map((id, n) => [id, n + 1])),
      completeOpenInPhases: async (_c: unknown, i: { phaseIds: string[] }) => ({
        completed: i.phaseIds.length * 2,
      }),
    };
    const { deps, calls } = setup({ tasks: tasksExt as never });
    const out = await createJob(owner.ctx, deps, base());
    const phases = await phasesOf(out.id);
    events.length = 0;

    const preview = (await run(owner, "zakazky.phase.preview", { jobId: out.id, phaseId: phases[2]!.id }, deps)) as {
      completing: { name: string; openTasks: number }[];
      totalOpenTasks: number;
    };
    expect(preview.completing.map((c) => [c.name, c.openTasks])).toEqual([
      ["Podklady", 1],
      ["Návrh", 2],
    ]);
    expect(preview.totalOpenTasks).toBe(3);

    const res = (await run(owner, "zakazky.setPhase", { jobId: out.id, phaseId: phases[2]!.id, completeOpenTasks: true }, deps)) as {
      completedPhaseIds: string[];
      completedTasks: number;
    };
    expect(res.completedPhaseIds).toEqual([phases[0]!.id, phases[1]!.id]);
    expect(res.completedTasks).toBe(4);
    expect(calls.some((c) => c.method === "completeOpenInPhases")).toBe(false); // rozšíření není v `calls` (vlastní metody)
    const after = await phasesOf(out.id);
    expect(after.map((p) => p.status)).toEqual(["done", "done", "in_progress", "not_started", "not_started", "not_started"]);
    expect(after[0]!.completedAt).not.toBeNull();
    expect((await jobOf(out.id)).currentPhaseId).toBe(phases[2]!.id);
    expect(sees("project.phase_completed").map((e) => (e.data as { phaseId: string }).phaseId)).toEqual([
      phases[0]!.id,
      phases[1]!.id,
    ]);
    const changed = sees("project.phase_changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]!.data).toMatchObject({ fromPhaseId: phases[0]!.id, toPhaseId: phases[2]!.id });

    // opakovaný klik na tutéž fázi nic nezmění
    events.length = 0;
    await setCurrentPhase(owner.ctx, deps, { jobId: out.id, phaseId: phases[2]!.id });
    expect(events).toEqual([]);

    // zpět: pozdější fáze se vrátí do Nezahájená, dokončené dřívější zůstanou
    const back = await setCurrentPhase(owner.ctx, deps, { jobId: out.id, phaseId: phases[1]!.id });
    expect(back.completedPhaseIds).toEqual([]);
    expect((await phasesOf(out.id)).map((p) => p.status)).toEqual([
      "done",
      "in_progress",
      "not_started",
      "not_started",
      "not_started",
      "not_started",
    ]);
  });

  it("podle názvu fáze (board) a poslední fáze má isLast", async () => {
    const { deps } = setup();
    const out = await createJob(owner.ctx, deps, base());
    await run(owner, "zakazky.setPhase", { jobId: out.id, phaseName: "vývoj" }, deps);
    const phases = await phasesOf(out.id);
    expect((await jobOf(out.id)).currentPhaseId).toBe(phases[2]!.id);
    await expect(run(owner, "zakazky.setPhase", { jobId: out.id, phaseName: "Neexistuje" }, deps)).rejects.toThrow(UserError);
    events.length = 0;
    await run(owner, "zakazky.phase.complete", { jobId: out.id, phaseId: phases[5]!.id }, deps);
    const last = sees("project.phase_completed").at(-1)!.data as { isLast: boolean; name: string };
    expect(last).toMatchObject({ name: "Předání", isLast: true });
    // po dokončení poslední fáze aktuální zůstává na ní
    expect((await jobOf(out.id)).currentPhaseId).toBe(phases[5]!.id);
    await expect(run(owner, "zakazky.phase.complete", { jobId: out.id, phaseId: phases[5]!.id }, deps)).rejects.toThrow(/dokončená/);
  });

  it("dokončení dřívější fáze, když je aktuální už dál, pás nehýbe", async () => {
    const { deps } = setup();
    const out = await createJob(owner.ctx, deps, base());
    const phases = await phasesOf(out.id);
    await run(owner, "zakazky.setPhase", { jobId: out.id, phaseId: phases[3]!.id }, deps);
    // fáze 3 je aktuální a 0–2 hotové; vrátíme fázi 1 do práce a zase ji dokončíme
    await run(owner, "zakazky.phases.edit", {
      jobId: out.id,
      phases: (await phasesOf(out.id)).map((p) => ({ id: p.id, name: p.name, role: p.role })),
    }, deps);
    expect((await jobOf(out.id)).currentPhaseId).toBe(phases[3]!.id);
  });

  it("uzavřená zakázka fáze nemění", async () => {
    const { deps } = setup();
    const out = await createJob(owner.ctx, deps, base());
    await completeJob(owner.ctx, deps, { jobId: out.id, reason: "finished" });
    const phases = await phasesOf(out.id);
    await expect(setCurrentPhase(owner.ctx, deps, { jobId: out.id, phaseId: phases[2]!.id })).rejects.toThrow(/uzavřená/);
  });

  it("úprava fází: pořadí, přidání, odebrání aktuální fáze přesune aktuální na první nehotovou", async () => {
    const { deps } = setup();
    const out = await createJob(owner.ctx, deps, base());
    const phases = await phasesOf(out.id);
    events.length = 0;
    const edited = (await run(owner, "zakazky.phases.edit", {
      jobId: out.id,
      phases: [
        { id: phases[1]!.id, name: "Návrh a schválení" },
        { name: "Nová fáze" },
        { id: phases[2]!.id, name: "Vývoj" },
      ],
    }, deps)) as { phaseIds: string[]; currentPhaseId: string | null };
    const after = await phasesOf(out.id);
    expect(after.map((p) => p.name)).toEqual(["Návrh a schválení", "Nová fáze", "Vývoj"]);
    expect(after.map((p) => p.position)).toEqual([0, 1, 2]);
    // aktuální fáze „Podklady“ byla odebrána: nová aktuální je první nehotová
    expect(edited.currentPhaseId).toBe(phases[1]!.id);
    expect((await jobOf(out.id)).currentPhaseId).toBe(phases[1]!.id);
    expect(sees("project.phase_changed")).toHaveLength(1);
    // odebraná fáze je v koši (měkce smazaná)
    const removed = await app.db.select().from(jobPhase).where(eq(jobPhase.id, phases[0]!.id));
    expect(removed[0]!.deletedAt).not.toBeNull();
    await expect(
      run(owner, "zakazky.phases.edit", {
        jobId: out.id,
        phases: [
          { name: "A", role: "retainer" },
          { name: "B", role: "retainer" },
        ],
      }, deps),
    ).rejects.toThrow(UserError);
    await expect(
      run(owner, "zakazky.phases.edit", { jobId: out.id, phases: [{ id: phases[5]!.id, name: "x" }] }, deps),
    ).rejects.toThrow(UserError);
  });
});

describe("stav zakázky a ukončení", () => {
  it("dokončení nezablokuje, upozorní na otevřené úkoly a platby a na jinou živou zakázku klienta", async () => {
    const { deps } = setup({
      tasks: { openCounts: async () => ({ open: 3, overdue: 1 }) },
      finance: { unpaidCount: async () => 2 },
    });
    const c = (await app.db.insert(company).values({ name: "Jediná zakázka s.r.o." }).returning({ id: company.id }))[0]!.id;
    const a = await createJob(owner.ctx, deps, base({ companyId: c }));
    const b = await createJob(owner.ctx, deps, base({ companyId: c, title: "Druhá" }));
    const preview = (await run(owner, "zakazky.complete.preview", { jobId: a.id }, deps)) as Record<string, unknown>;
    expect(preview).toMatchObject({ openTasks: 3, unpaidPayments: 2, clientHasOtherActiveJob: true, clientId: c });

    events.length = 0;
    const first = await completeJob(owner.ctx, deps, { jobId: a.id, reason: "finished" });
    expect(first).toEqual({ openTasks: 3, unpaidPayments: 2, clientHasOtherActiveJob: true });
    const ja = await jobOf(a.id);
    expect(ja.status).toBe("done");
    expect(ja.completedAt).not.toBeNull();
    expect(sees("project.completed")[0]!.data).toMatchObject({ reason: "finished" });
    await expect(completeJob(owner.ctx, deps, { jobId: a.id, reason: "finished" })).rejects.toThrow(/uzavřená/);

    // poslední živá zakázka: klient je nabídnut jako bývalý
    const last = await completeJob(owner.ctx, deps, { jobId: b.id, reason: "cancelled" });
    expect(last.clientHasOtherActiveJob).toBe(false);
    expect((await jobOf(b.id)).status).toBe("cancelled");
    expect(sees("project.completed")[1]!.data).toMatchObject({ reason: "cancelled" });
  });

  it("stav klienta Bývalý přes službu klienti, jen když nemá jinou živou zakázku", async () => {
    const setStatus = async () => ({ changed: true, clientSince: null });
    const { deps, calls } = setup({ clients: { setStatus } });
    const c = (await app.db.insert(company).values({ name: "Bývalý s.r.o." }).returning({ id: company.id }))[0]!.id;
    const a = await createJob(owner.ctx, deps, base({ companyId: c }));
    const b = await createJob(owner.ctx, deps, base({ companyId: c, title: "Další" }));
    await expect(run(owner, "zakazky.client.setFormer", { jobId: a.id }, deps)).rejects.toThrow(/další aktivní/);
    await completeJob(owner.ctx, deps, { jobId: b.id, reason: "finished" });
    expect(await run(owner, "zakazky.client.setFormer", { jobId: a.id, reason: "Konec spolupráce" }, deps)).toEqual({ changed: true });
    const call = calls.find((x) => x.method === "setStatus")!.args[1] as Record<string, unknown>;
    expect(call).toMatchObject({ companyId: c, status: "former", reason: "Konec spolupráce", source: "job_ended" });
    expect(call.endedOn).toBe(todayPrague());
    const none = setup();
    await expect(run(owner, "zakazky.client.setFormer", { jobId: a.id }, none.deps)).rejects.toThrow(/Klienti/);
  });

  it("změna stavu: pozastavit, znovu otevřít, uzavření přes setStatus", async () => {
    const { deps } = setup();
    const out = await createJob(owner.ctx, deps, base());
    await run(owner, "zakazky.setStatus", { jobId: out.id, status: "paused" }, deps);
    expect((await jobOf(out.id)).status).toBe("paused");
    const closed = (await run(owner, "zakazky.setStatus", { jobId: out.id, status: "done" }, deps)) as {
      closed: boolean;
      status: string;
    };
    expect(closed).toMatchObject({ closed: true, status: "done" });
    expect((await jobOf(out.id)).completedAt).not.toBeNull();
    await run(owner, "zakazky.setStatus", { jobId: out.id, status: "active" }, deps);
    const j = await jobOf(out.id);
    expect(j).toMatchObject({ status: "active", completedAt: null });
  });
});

describe("tým a další kontakty", () => {
  it("člen týmu vidí zakázku i při rozsahu „jen moje“, odebraný už ne", async () => {
    const { deps } = setup();
    const out = await createJob(owner.ctx, deps, base());
    await expect(run(external, "zakazky.detail", { jobId: out.id }, deps)).rejects.toThrow(NotFoundError);
    await run(owner, "zakazky.team.add", { jobId: out.id, userId: external.id }, deps);
    const d = (await run(external, "zakazky.detail", { jobId: out.id }, deps)) as { members: { userId: string; role: string }[] };
    expect(d.members).toEqual([{ userId: external.id, name: "Externista", role: "member" }]);
    // změna role = povýšení na vedoucího (jeden řádek)
    await run(owner, "zakazky.team.add", { jobId: out.id, userId: external.id, role: "lead" }, deps);
    expect((await app.db.select().from(jobMember).where(and(eq(jobMember.jobId, out.id), isNull(jobMember.deletedAt))))).toHaveLength(1);
    // externista smí zakázku měnit, protože je členem (rozsah „jen moje“)
    await run(external, "zakazky.setStatus", { jobId: out.id, status: "paused" }, deps);
    await run(owner, "zakazky.team.remove", { jobId: out.id, userId: external.id }, deps);
    await expect(run(external, "zakazky.detail", { jobId: out.id }, deps)).rejects.toThrow(NotFoundError);
    // odebraného lze přidat znovu
    await run(owner, "zakazky.team.add", { jobId: out.id, userId: external.id }, deps);
  });

  it("další kontakt: přidání, změna role a odebrání", async () => {
    const { deps } = setup();
    const out = await createJob(owner.ctx, deps, base());
    const [p] = await app.db.insert(person).values({ lastName: "Svoboda" }).returning({ id: person.id });
    await run(owner, "zakazky.participants.add", { jobId: out.id, personId: p!.id, role: "Správce webu" }, deps);
    await run(owner, "zakazky.participants.add", { jobId: out.id, personId: p!.id, role: "Investor" }, deps);
    let d = (await jobDetailImpl(owner.ctx, deps, out.id)).participants;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ personName: "Svoboda", role: "Investor" });
    await run(owner, "zakazky.participants.remove", { jobId: out.id, personId: p!.id }, deps);
    d = (await jobDetailImpl(owner.ctx, deps, out.id)).participants;
    expect(d).toEqual([]);
    await expect(
      run(owner, "zakazky.participants.add", { jobId: out.id, personId: "00000000-0000-4000-8000-000000000009" }, deps),
    ).rejects.toThrow(UserError);
  });
});

describe("soukromé zakázky a viditelnost", () => {
  it("soukromou zakázku smí založit jen vlastník a nelze ji přidělit někomu, kdo soukromé nevidí", async () => {
    const { deps } = setup();
    await expect(createJob(partner.ctx, deps, base({ ownerId: partner.id, isPrivate: true }))).rejects.toThrow(/jen vlastník/);
    await expect(createJob(owner.ctx, deps, base({ isPrivate: true, memberIds: [partner.id] }))).rejects.toThrow(/nevidí/);
    const out = await createJob(owner.ctx, deps, base({ isPrivate: true, title: "PRIVATE-CANARY-1 zakázka" }));
    expect((await jobOf(out.id)).isPrivate).toBe(true);
    // člen s oprávněním na soukromé se přidat smí, bez něj ne
    await expect(run(owner, "zakazky.team.add", { jobId: out.id, userId: partner.id }, deps)).rejects.toThrow(/nevidí/);
  });

  it("partner soukromé zakázky nevidí: detail, board, metriky, vrstvy, karta klienta ani souhrny (canary)", async () => {
    const { deps } = setup({ tasks: { overdueJobIds: async () => [] } });
    const secret = await createJob(owner.ctx, deps, base({
      title: "PRIVATE-CANARY-2 tajná zakázka",
      isPrivate: true,
      dueDate: "2020-01-01",
      companyId: c2,
    }));
    await expect(run(partner, "zakazky.detail", { jobId: secret.id }, deps)).rejects.toThrow(NotFoundError);
    await expect(run(partner, "zakazky.complete.preview", { jobId: secret.id }, deps)).rejects.toThrow(NotFoundError);
    await expect(run(partner, "zakazky.setStatus", { jobId: secret.id, status: "paused" }, deps)).rejects.toThrow(NotFoundError);
    expect(await getJobBrief(partner.ctx, secret.id)).toBeNull();
    expect(await getJobBriefs(partner.ctx, [secret.id])).toEqual([]);

    // každá ruční čtecí cesta modulu: partner canary nenajde, vlastník ano
    for (const p of privatePaths) {
      const asPartner = JSON.stringify(await p.run(partner.ctx, deps));
      expect(asPartner, p.name).not.toContain("PRIVATE-CANARY");
      expect(asPartner, p.name).not.toContain(secret.id);
    }
    const asOwner = JSON.stringify(await boardImpl(owner.ctx, deps, { by: "status", includeClosed: true }));
    expect(asOwner).toContain("PRIVATE-CANARY-2");
    expect(JSON.stringify(await privatePaths.find((p) => p.name === "zakazky.api.briefs")!.run(owner.ctx, deps))).toContain(secret.id);

    // součty a počty bez soukromých
    const slipOwner = (await slippingJobs(owner.ctx, deps)).map((r) => r.id);
    const slipPartner = (await slippingJobs(partner.ctx, deps)).map((r) => r.id);
    expect(slipOwner).toContain(secret.id);
    expect(slipPartner).not.toContain(secret.id);
    const counts = (ctx: typeof owner.ctx) => clientCard.tabCounts!(ctx, c2);
    expect((await counts(owner.ctx)).zakazky).toBe((await counts(partner.ctx)).zakazky! + 1);
    const metric = dashboardMetrics.find((m) => m.key === "zakazky.slipping")!;
    const input = { from: null, to: null, jobId: null, userId: null, bucket: null, limit: 10, params: {}, today: todayPrague() };
    const mo = await metric.compute(owner.ctx, input, deps);
    const mp = await metric.compute(partner.ctx, input, deps);
    expect((mo as { value: number }).value).toBe((mp as { value: number }).value + 1);
    const layer = calendarLayers[0]!;
    const inRange = { from: "2019-12-01", to: "2020-02-01" };
    expect((await layer.items(owner.ctx, inRange, deps)).some((i) => i.title.includes("PRIVATE-CANARY-2"))).toBe(true);
    expect(await layer.items(partner.ctx, inRange, deps)).toEqual([]);
  });

  it("rozsah „jen moje“: externista v boardu a výpisech vidí jen své zakázky", async () => {
    const { deps } = setup();
    const mine = await createJob(owner.ctx, deps, base({ ownerId: external.id, title: "Moje zakázka" }));
    const foreign = await createJob(owner.ctx, deps, base({ title: "Cizí zakázka" }));
    const board = await boardImpl(external.ctx, deps, { by: "status", includeClosed: true });
    const ids = board.columns.flatMap((c) => c.cards.map((x) => x.id));
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(foreign.id);
    expect(await getJobBrief(external.ctx, foreign.id)).toBeNull();
    await expect(run(external, "zakazky.phases.edit", { jobId: foreign.id, phases: [{ name: "X" }] }, deps)).rejects.toThrow(NotFoundError);
  });

  it("příkazy bez oprávnění: externista nezakládá zakázky ani šablony", async () => {
    const { deps } = setup();
    await expect(run(external, "zakazky.create", base(), deps)).rejects.toThrow(PermissionError);
    await expect(run(external, "zakazky.template.create", { name: "x", type: "web" }, deps)).rejects.toThrow(PermissionError);
  });
});

describe("board a detail", () => {
  it("board podle stavu a podle fází typu; detail hlásí skluz a rozhodnutí", async () => {
    const { deps } = setup({ tasks: { overdueJobIds: async () => [] } });
    const web = await createJob(owner.ctx, deps, base({ title: "Board web", dueDate: "2020-05-05" }));
    await run(owner, "zakazky.setPhase", { jobId: web.id, phaseName: "Vývoj" }, deps);
    const byStatus = await boardImpl(owner.ctx, deps, { by: "status", includeClosed: false });
    expect(byStatus.columns.map((c) => c.key)).toEqual(["planned", "active", "paused"]);
    const card = byStatus.columns.find((c) => c.key === "active")!.cards.find((c) => c.id === web.id)!;
    expect(card).toMatchObject({ currentPhaseName: "Vývoj", overdue: true, slipping: true, companyName: "Novák s.r.o." });
    const byPhase = await boardImpl(owner.ctx, deps, { by: "phase", type: "web", includeClosed: false });
    expect(byPhase.columns.map((c) => c.label)).toContain("Vývoj");
    expect(byPhase.columns.find((c) => c.phaseName === "Vývoj")!.cards.map((c) => c.id)).toContain(web.id);
    await expect(boardImpl(owner.ctx, deps, { by: "phase", includeClosed: false })).rejects.toThrow(UserError);

    const d = await jobDetailImpl(owner.ctx, deps, web.id);
    expect(d).toMatchObject({ overdue: true, slipping: true, decisionPending: false });
    expect(d.job).toMatchObject({ number: web.number, companyName: "Novák s.r.o.", ownerName: "Ondřej", templateName: "Web" });
    expect(d.phases).toHaveLength(6);
    expect(d.counts.openTasks).toBe(0);
    // cena jen s finance.read
    await app.db.update(job).set({ priceMinor: 1_000_00 }).where(eq(job.id, web.id));
    expect((await jobDetailImpl(owner.ctx, deps, web.id)).job.priceMinor).toBe(1_000_00);
    const plain = await makeUser(app.db, [["zakazky.read", "all"]]);
    expect((await jobDetailImpl(plain.ctx, deps, web.id)).job.priceMinor).toBeNull();
  });

  it("zakázka ve skluzu kvůli úkolům po termínu (služba tasks)", async () => {
    const out0 = setup();
    const j = await createJob(owner.ctx, out0.deps, base({ title: "Úkoly po termínu", dueDate: "2099-01-01" }));
    const { deps } = setup({ tasks: { overdueJobIds: async () => [j.id] } });
    const slip = await slippingJobs(owner.ctx, deps);
    expect(slip.find((s) => s.id === j.id)).toMatchObject({ reason: "tasks" });
    expect((await jobDetailImpl(owner.ctx, deps, j.id)).slipping).toBe(true);
  });
});

describe("šablony zakázek", () => {
  it("vytvoření, první šablona typu je výchozí, přepnutí výchozí, duplikace, archivace", async () => {
    const { deps } = setup();
    const created = (await run(owner, "zakazky.template.create", {
      name: "Web – e-shop",
      type: "web",
      payload: { phases: [{ name: "Analýza" }, { name: "Spuštění" }], tasks: [{ title: "Kick-off", phaseIndex: 0 }] },
    }, deps)) as { id: string; isDefault: boolean; summary: { phases: number; tasks: number } };
    expect(created.isDefault).toBe(false); // Web už výchozí má
    expect(created.summary).toMatchObject({ phases: 2, tasks: 1 });

    const dup = (await run(owner, "zakazky.template.duplicate", { id: created.id }, deps)) as { id: string; name: string; isDefault: boolean };
    expect(dup.name).toBe("Web – e-shop (kopie)");
    expect(dup.isDefault).toBe(false);

    await run(owner, "zakazky.template.setDefault", { id: created.id }, deps);
    const defaults = (await app.db.select().from(jobTemplate).where(eq(jobTemplate.type, "web"))).filter((t) => t.isDefault);
    expect(defaults.map((t) => t.id)).toEqual([created.id]);
    // nová zakázka bez šablony použije novou výchozí
    const j = await createJob(owner.ctx, deps, base({ title: "E-shop" }));
    expect((await phasesOf(j.id)).map((p) => p.name)).toEqual(["Analýza", "Spuštění"]);

    await expect(run(owner, "zakazky.template.archive", { id: created.id }, deps)).rejects.toThrow(/Výchozí šablonu/);
    await run(owner, "zakazky.template.archive", { id: dup.id }, deps);
    expect((await listTemplates(owner.ctx, "web")).map((t) => t.id)).not.toContain(dup.id);
    const all = (await run(owner, "zakazky.template.list", { includeArchived: true, type: "web" }, deps)) as { id: string; archivedAt: string | null }[];
    expect(all.find((t) => t.id === dup.id)!.archivedAt).not.toBeNull();
    await expect(createJob(owner.ctx, deps, base({ templateId: dup.id }))).rejects.toThrow(/archivovaná/);
    await run(owner, "zakazky.template.archive", { id: dup.id, archived: false }, deps);
    await expect(run(owner, "zakazky.template.setDefault", { id: "00000000-0000-4000-8000-000000000009" }, deps)).rejects.toThrow(NotFoundError);

    // vrátit původní výchozí
    await run(owner, "zakazky.template.setDefault", { id: (await templateByName("Web")).id }, deps);
  });

  it("uložení hotové zakázky jako šablony: fáze bez dat a úkoly jako posuny od startu", async () => {
    const tasksExt = {
      listForTemplate: async (_c: unknown, i: { jobId: string }) => {
        const phases = await phasesOf(i.jobId);
        return [
          { phaseId: phases[0]!.id, title: "Zavolat klientovi", typeKey: "call", priority: "high" as const, assigneeId: owner.id, dueDate: "2026-10-04", estimateMin: 30, description: null },
          { phaseId: phases[2]!.id, title: "Nahrát na server", typeKey: "task", priority: "medium" as const, assigneeId: partner.id, dueDate: "2026-09-01", estimateMin: null, description: "d" },
          { phaseId: null, title: "Bez fáze a řešitele", typeKey: "task", priority: "none" as const, assigneeId: null, dueDate: null, estimateMin: null, description: null },
        ];
      },
    };
    const { deps } = setup({ tasks: tasksExt as never });
    const j = await createJob(owner.ctx, deps, base({ title: "Hotový web" }));
    const saved = (await run(owner, "zakazky.template.saveFromJob", { jobId: j.id, name: "Z hotového webu" }, deps)) as {
      id: string;
      type: string;
      isDefault: boolean;
      payload: { phases: { name: string; offsetDays: number; durationDays: number }[]; tasks: { title: string; assignee: { rule: string }; dueOffsetDays: number | null; phaseIndex: number }[]; payments: unknown[] };
    };
    expect(saved).toMatchObject({ type: "web", isDefault: false });
    expect(saved.payload.phases.map((p) => [p.name, p.offsetDays, p.durationDays]).slice(0, 3)).toEqual([
      ["Podklady", 0, 7],
      ["Návrh", 7, 10],
      ["Vývoj", 17, 21],
    ]);
    expect(saved.payload.tasks.map((t) => [t.title, t.assignee.rule, t.dueOffsetDays, t.phaseIndex])).toEqual([
      ["Zavolat klientovi", "owner", 3, 0],
      ["Nahrát na server", "user", null, 2], // termín před startem se nepřenáší
      ["Bez fáze a řešitele", "none", null, 0],
    ]);
    expect(saved.payload.payments).toEqual([]);

    // šablona z hotové zakázky jde použít a přepsat
    const k = await createJob(owner.ctx, deps, base({ templateId: saved.id, title: "Podle hotového" }));
    expect((await phasesOf(k.id)).map((p) => p.name)).toHaveLength(6);
    const replaced = (await run(owner, "zakazky.template.saveFromJob", { jobId: j.id, name: "Z hotového webu v2", replaceId: saved.id }, deps)) as { id: string; name: string };
    expect(replaced).toMatchObject({ id: saved.id, name: "Z hotového webu v2" });
    const other = await createJob(owner.ctx, deps, base({ type: "systemy", title: "Jiný typ" }));
    await expect(
      run(owner, "zakazky.template.saveFromJob", { jobId: other.id, name: "x", replaceId: saved.id }, deps),
    ).rejects.toThrow(/jiný typ/);
  });
});

describe("obecné založení přes entitu", () => {
  it("zakázka založená formulářem entity dostane fáze z výchozí šablony a událost", async () => {
    const { deps } = setup();
    const { afterGenericCreate } = await import("./after-create");
    const [row] = await app.db
      .insert(job)
      .values({ number: `T-${Date.now()}`, title: "Z formuláře", companyId: c1, type: "systemy", ownerId: owner.id })
      .returning();
    await afterGenericCreate(owner.ctx, row as unknown as Record<string, unknown>);
    expect((await phasesOf(row!.id)).map((p) => p.name)).toEqual(["Analýza", "Specifikace", "Vývoj", "Testování", "Nasazení", "Podpora"]);
    expect((await jobOf(row!.id)).currentPhaseId).not.toBeNull();
    expect(sees("project.created")).toHaveLength(1);
    void deps;
  });
});
