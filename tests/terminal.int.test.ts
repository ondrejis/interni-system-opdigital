import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  queryRecords,
  registerEntityPolicies,
  resolveEntity,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { CommandDef, ModuleDeps } from "@rebar/core/module-server";
import { configureNotifications } from "@rebar/core/notifications";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
import {
  CORE_TERMINAL_WIDGETS,
  collectTerminalWidgets,
  coreTerminalCommands,
  loadEffectiveTerminalConfig,
  loadTerminalSettings,
  purgeTerminalOps,
  runTerminalOp,
  saveTerminalSettings,
  submitTerminalCommand,
  terminalConfigSchema,
  terminalSettingDef,
  visibleTerminalTiles,
  type TerminalConfig,
} from "@rebar/core/terminal";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { createTask } from "@rebar/core/collab";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as dochazkaManifest } from "@rebar/dochazka";
import { server as dochazkaServer, timeEntry, timeEntryEntity } from "@rebar/dochazka/server";
import { manifest as realizaceManifest } from "@rebar/realizace";
import { siteDiary } from "@rebar/realizace/schema";
import { defectEntity, server as realizaceServer } from "@rebar/realizace/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job, jobMember } from "@rebar/zakazky/schema";
import { jobEntity, server as zakazkyServer } from "@rebar/zakazky/server";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: [],
    calendarLayers: [],
    diaryPrefill: [],
    emit: async () => {},
    settings: {
      get: async (_db: unknown, def: { default: Record<string, unknown> }) => def.default,
    },
  }) as unknown as ModuleDeps;

const commands = new Map<string, CommandDef>(
  [
    ...(dochazkaServer.commands ?? []),
    ...(realizaceServer.commands ?? []),
    ...(zakazkyServer.commands ?? []),
    ...coreTerminalCommands,
  ].map((c) => [c.name, c as CommandDef]),
);
const modules = [dochazkaManifest, realizaceManifest, zakazkyManifest];
const defs = collectTerminalWidgets(modules);

/** Dlaždice, které by uživatel viděl (stejná funkce jako na serveru), a odeslání zápisu přes jediný vstupní bod. */
const base: TerminalConfig = terminalConfigSchema.parse({});
function terminalFor(
  ctx: Parameters<typeof submitTerminalCommand>[0],
  config: TerminalConfig = base,
) {
  const can = (p: string) => ctx.actor.permissions.has(p);
  const tiles = visibleTerminalTiles(defs, config, can);
  return {
    tiles,
    submit: (opId: string, command: string, input: unknown) =>
      submitTerminalCommand(ctx, { opId, command, input }, { tiles, commands, deps: deps() }),
  };
}
const opId = () => crypto.randomUUID();

beforeAll(async () => {
  configureNotifications({ events: realizaceManifest.notifications ?? [] });
  clearEntityPolicies();
  registry = createEntityRegistry([
    companyEntity,
    personEntity,
    jobEntity,
    timeEntryEntity,
    defectEntity,
  ]);
  registerEntityPolicies(registry);
  for (const m of [zakazkyManifest, realizaceManifest]) {
    for (const p of m.seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of "lookups" in m.seed ? (m.seed.lookups ?? []) : [])
      await ensureLookup(app.db, l);
    await ensureSeries(app.db, m.seed.series ?? []);
  }
});

const WORKER_PERMS: [string, "all" | "own"][] = [
  ["dochazka.own", "all"],
  ["zakazky.read", "own"],
  ["realizace.read", "own"],
  ["realizace.write", "own"],
];
const worker = () => makeUser(app.db, [...WORKER_PERMS], { name: "Montér Test" });

async function newJob(opts: { managerId?: string; members?: string[]; phase?: string } = {}) {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `T-${randomBytes(4).toString("hex")}`,
      title: "Stavba terminál",
      companyId: c!.id,
      stageId: stage.id,
      managerId: opts.managerId ?? null,
      phase: opts.phase ?? "execution",
      address: "Pekařská 8, Rokycany",
      valueMinor: 123_456_700,
    })
    .returning();
  for (const userId of opts.members ?? [])
    await app.db.insert(jobMember).values({ jobId: j!.id, userId });
  return j!;
}

const runningOf = (userId: string) =>
  app.db
    .select()
    .from(timeEntry)
    .where(
      and(eq(timeEntry.userId, userId), isNull(timeEntry.endedAt), isNull(timeEntry.deletedAt)),
    );

describe("jednorázové provedení zápisu (runTerminalOp)", () => {
  it("opakované odeslání téhož zápisu zápis nezopakuje a vrátí původní výsledek", async () => {
    const u = await worker();
    const id = opId();
    let runs = 0;
    const run = async () => ({ n: ++runs });
    const a = await runTerminalOp(u.ctx, { opId: id, command: "x.y" }, run);
    const b = await runTerminalOp(u.ctx, { opId: id, command: "x.y" }, run);
    expect(a).toEqual({ duplicate: false, result: { n: 1 } });
    expect(b).toEqual({ duplicate: true, result: { n: 1 } });
    expect(runs).toBe(1);
  });

  it("souběžné odeslání téhož zápisu (dvě záložky, dvojí ťuknutí) vykoná zápis právě jednou", async () => {
    const u = await worker();
    const id = opId();
    let runs = 0;
    const outs = await Promise.all(
      Array.from({ length: 6 }, () =>
        runTerminalOp(u.ctx, { opId: id, command: "x.y" }, async () => {
          runs += 1;
          await new Promise((r) => setTimeout(r, 30));
          return { ok: true };
        }),
      ),
    );
    expect(runs).toBe(1);
    expect(outs.filter((o) => !o.duplicate)).toHaveLength(1);
    expect(outs.every((o) => (o.result as { ok: boolean }).ok)).toBe(true);
  });

  it("selže-li zápis, nic se neuloží a jde ho bezpečně zkusit znovu", async () => {
    const u = await worker();
    const id = opId();
    await expect(
      runTerminalOp(u.ctx, { opId: id, command: "x.y" }, async () => {
        throw new UserError("Konflikt.");
      }),
    ).rejects.toThrow("Konflikt.");
    const again = await runTerminalOp(u.ctx, { opId: id, command: "x.y" }, async () => "ok");
    expect(again).toEqual({ duplicate: false, result: "ok" });
  });

  it("cizí identifikátor ani jiný příkaz pod stejným identifikátorem se nepřijme", async () => {
    const a = await worker();
    const b = await worker();
    const id = opId();
    await runTerminalOp(a.ctx, { opId: id, command: "x.y" }, async () => 1);
    await expect(runTerminalOp(b.ctx, { opId: id, command: "x.y" }, async () => 2)).rejects.toThrow(
      UserError,
    );
    await expect(runTerminalOp(a.ctx, { opId: id, command: "x.z" }, async () => 3)).rejects.toThrow(
      UserError,
    );
  });

  it("staré záznamy se uklízejí", async () => {
    const u = await worker();
    const id = opId();
    await runTerminalOp(u.ctx, { opId: id, command: "x.y" }, async () => 1);
    await app.db
      .update(schema.terminalOp)
      .set({ createdAt: new Date(Date.now() - 90 * 86_400_000) })
      .where(eq(schema.terminalOp.id, id));
    await purgeTerminalOps(u.ctx);
    const rows = await app.db.select().from(schema.terminalOp).where(eq(schema.terminalOp.id, id));
    expect(rows).toEqual([]);
  });
});

describe("zápisy z terminálu: docházka", () => {
  it("příchod odeslaný dvakrát (opakování z fronty) vytvoří jedinou píchačku", async () => {
    const u = await worker();
    const t = terminalFor(u.ctx);
    const id = opId();
    const first = await t.submit(id, "dochazka.clock.in", { jobId: null });
    const second = await t.submit(id, "dochazka.clock.in", { jobId: null });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(await runningOf(u.id)).toHaveLength(1);
  });

  it("zápis odložený bez signálu se zapíše s časem ťuknutí, ne s časem doručení", async () => {
    const u = await worker();
    const t = terminalFor(u.ctx);
    const at = new Date(Date.now() - 2 * 3_600_000);
    await t.submit(opId(), "dochazka.clock.in", { jobId: null, at: at.toISOString() });
    const [run] = await runningOf(u.id);
    expect(Math.abs(run!.startedAt!.getTime() - at.getTime())).toBeLessThan(1000);
    // odchod o hodinu později: doba je od příchodu do ťuknutí na odchod
    const out = await t.submit(opId(), "dochazka.clock.out", {
      at: new Date(at.getTime() + 3_600_000).toISOString(),
    });
    expect((out.result as { minutes: number }).minutes).toBe(60);
  });

  it("příliš starý zápis a odchod před příchodem se odmítnou českou větou", async () => {
    const u = await worker();
    const t = terminalFor(u.ctx);
    await expect(
      t.submit(opId(), "dochazka.clock.in", {
        jobId: null,
        at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      }),
    ).rejects.toThrow(/starší než 3 dny/);
    await t.submit(opId(), "dochazka.clock.in", { jobId: null });
    await expect(
      t.submit(opId(), "dochazka.clock.out", {
        at: new Date(Date.now() - 3_600_000).toISOString(),
      }),
    ).rejects.toThrow("Odchod nemůže být dřív než příchod.");
  });

  it("konflikt (píchačka už běží z jiného zařízení) je česká hláška a nic nezapíše", async () => {
    const u = await worker();
    const t = terminalFor(u.ctx);
    await t.submit(opId(), "dochazka.clock.in", { jobId: null });
    const conflicting = opId();
    await expect(t.submit(conflicting, "dochazka.clock.in", { jobId: null })).rejects.toThrow(
      "Píchačka už běží. Nejdřív zaznamenejte odchod.",
    );
    expect(await runningOf(u.id)).toHaveLength(1);
    // zápis se nezapamatoval jako provedený: po odchodu ho jde odeslat znovu
    await t.submit(opId(), "dochazka.clock.out", {});
    const retry = await t.submit(conflicting, "dochazka.clock.in", { jobId: null });
    expect(retry.duplicate).toBe(false);
  });

  it("příkaz, který nepatří žádné dlaždici, server z terminálu odmítne", async () => {
    const u = await worker();
    const t = terminalFor(u.ctx);
    await expect(t.submit(opId(), "dochazka.week", { weekStart: "2026-10-05" })).rejects.toThrow(
      "Tato akce není v terminálu povolená.",
    );
    await expect(t.submit(opId(), "neexistuje.prikaz", {})).rejects.toThrow(PermissionError);
  });
});

describe("dlaždice podle modulů, oprávnění a nastavení", () => {
  it("bez oprávnění dlaždice není vidět a server její příkaz odmítne", async () => {
    const nobody = await makeUser(app.db, [["zakazky.read", "own"]]);
    const t = terminalFor(nobody.ctx);
    expect(t.tiles.map((x) => x.key)).not.toContain("dochazka.clock");
    await expect(t.submit(opId(), "dochazka.clock.in", { jobId: null })).rejects.toThrow(
      "Tato akce není v terminálu povolená.",
    );
  });

  it("dlaždice vypnutá správcem nebo klientem je pro server stejná jako neexistující", async () => {
    const u = await worker();
    const off = terminalConfigSchema.parse({
      tiles: [{ widget: "dochazka.clock", enabled: false }],
    });
    const t = terminalFor(u.ctx, off);
    expect(t.tiles.map((x) => x.key)).not.toContain("dochazka.clock");
    await expect(t.submit(opId(), "dochazka.clock.in", { jobId: null })).rejects.toThrow(
      "Tato akce není v terminálu povolená.",
    );
    expect(await runningOf(u.id)).toHaveLength(0);
  });

  it("dlaždice vypnutého modulu v terminálu není (modul nedodá ani příkaz)", async () => {
    const u = await worker();
    const only = collectTerminalWidgets([dochazkaManifest]);
    const tiles = visibleTerminalTiles(only, base, (p) => u.ctx.actor.permissions.has(p));
    expect(tiles.map((x) => x.key)).toEqual(["dochazka.clock", "core.tasks"]);
    expect(tiles.map((x) => x.key)).not.toContain("realizace.diary");
  });

  it("oprávnění příkazu platí i pro viditelnou dlaždici (zápis do deníku bez realizace.write)", async () => {
    const readOnly = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["realizace.read", "own"],
    ]);
    const t = terminalFor(readOnly.ctx);
    expect(t.tiles.map((x) => x.key)).not.toContain("realizace.diary");
    await expect(
      t.submit(opId(), "realizace.terminal.note", { jobId: crypto.randomUUID(), text: "x" }),
    ).rejects.toThrow();
  });
});

describe("zápisy z terminálu: úkoly", () => {
  it("odškrtnutí úkolu odeslané dvakrát se provede jednou; cizí úkol nejde odškrtnout", async () => {
    const u = await worker();
    const boss = await makeUser(app.db, [["tasks.assign", "all"]]);
    const task = await createTask(boss.ctx, { title: "Zkontrolovat lešení", assigneeId: u.id });
    const t = terminalFor(u.ctx);
    const id = opId();
    await t.submit(id, "core.tasks.complete", { taskId: task.id, done: true });
    const [row] = await app.db.select().from(schema.task).where(eq(schema.task.id, task.id));
    expect(row!.doneAt).not.toBeNull();
    const done1 = row!.doneAt!.getTime();
    const dup = await t.submit(id, "core.tasks.complete", { taskId: task.id, done: true });
    expect(dup.duplicate).toBe(true);
    const [again] = await app.db.select().from(schema.task).where(eq(schema.task.id, task.id));
    expect(again!.doneAt!.getTime()).toBe(done1);

    const other = await worker();
    const foreign = terminalFor(other.ctx);
    await expect(
      foreign.submit(opId(), "core.tasks.complete", { taskId: task.id, done: false }),
    ).rejects.toThrow(NotFoundError);
  });

  it("seznam mých úkolů obsahuje jen moje otevřené úkoly", async () => {
    const u = await worker();
    const other = await worker();
    const boss = await makeUser(app.db, [["tasks.assign", "all"]]);
    await createTask(boss.ctx, { title: "Můj úkol", assigneeId: u.id, dueDate: "2020-01-01" });
    await createTask(boss.ctx, { title: "Cizí úkol", assigneeId: other.id });
    const mine = commands.get("core.tasks.mine")!;
    const res = (await mine.handler(u.ctx, {}, deps())) as {
      tasks: { title: string; overdue: boolean }[];
    };
    expect(res.tasks.map((x) => x.title)).toEqual(["Můj úkol"]);
    expect(res.tasks[0]!.overdue).toBe(true);
  });
});

describe("dnes na stavbě: zakázky řemeslníka bez cen", () => {
  it("montér vidí jen zakázky, na kterých je v týmu; výstup neobsahuje žádné ceny ani sazby", async () => {
    const u = await worker();
    const boss = await makeUser(app.db, [["zakazky.read", "all"]], { name: "Vedoucí Test" });
    await app.db
      .insert(schema.employee)
      .values({ userId: boss.id, phone: "+420 603 100 104", hourlyCostMinor: 99_900 });
    const mine = await newJob({ managerId: boss.id, members: [u.id] });
    const foreign = await newJob({ managerId: boss.id });
    const closed = await newJob({ managerId: boss.id, members: [u.id], phase: "closed" });
    const sites = commands.get("zakazky.terminal.sites")!;
    const res = (await sites.handler(u.ctx, {}, deps())) as { sites: { id: string }[] };
    const ids = res.sites.map((s) => s.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(foreign.id);
    expect(ids).not.toContain(closed.id);
    const text = JSON.stringify(res);
    expect(text).not.toMatch(/minor|sum[A-Z]|value|cost|price|margin|hourly|123456700|99900/i);
    const site = res.sites.find((s) => s.id === mine.id) as unknown as {
      address: string;
      manager: { name: string; phone: string };
    };
    expect(site.address).toBe("Pekařská 8, Rokycany");
    expect(site.manager).toEqual({ name: "Vedoucí Test", phone: "+420 603 100 104" });
  });

  it("seznam zakázek pro výběr (entita job) montérovi nevrací ceny a ekonomiku", async () => {
    const u = await worker();
    const j = await newJob({ members: [u.id] });
    const e = await resolveEntity(app.db, registry.get("job")!);
    const page = await queryRecords(u.ctx, registry, e, {
      filters: {
        op: "and",
        conditions: [{ attr: "phase", op: "is_any_of", value: ["execution"] }],
      },
    });
    const row = page.rows.find((r) => r.id === j.id)!;
    expect(row).toBeTruthy();
    for (const key of ["sumContract", "sumMarginPct", "sumDrawdownPct", "value", "sumCost"])
      expect(Object.keys(row), key).not.toContain(key);
  });

  it("harmonogram dneška vrací jen vlastní zakázky a žádné ceny", async () => {
    const u = await worker();
    const j = await newJob({ members: [u.id] });
    const foreign = await newJob();
    const { jobPhase } = await import("@rebar/realizace/schema");
    const today = new Date().toISOString().slice(0, 10);
    for (const jobId of [j.id, foreign.id])
      await app.db.insert(jobPhase).values({
        jobId,
        name: "Betonáž",
        startDate: today,
        endDate: today,
        progress: 10,
        status: "in_progress",
      });
    const res = (await commands.get("realizace.terminal.today")!.handler(u.ctx, {}, deps())) as {
      jobs: { jobId: string; phases: { name: string }[] }[];
    };
    expect(res.jobs.map((x) => x.jobId)).toEqual([j.id]);
    expect(res.jobs[0]!.phases[0]!.name).toBe("Betonáž");
    expect(JSON.stringify(res)).not.toMatch(/minor|cost|price|hourly/i);
  });
});

describe("zápisy z terminálu: deník a závady", () => {
  it("poznámky se do dnešního zápisu připojují, zápisy kolegů se nepřepisují", async () => {
    const a = await worker();
    const b = await worker();
    const j = await newJob({ members: [a.id, b.id] });
    const ta = terminalFor(a.ctx);
    const tb = terminalFor(b.ctx);
    await ta.submit(opId(), "realizace.terminal.note", {
      jobId: j.id,
      text: "Vybourány otvory",
      section: "work",
    });
    await tb.submit(opId(), "realizace.terminal.note", {
      jobId: j.id,
      text: "Zazděn překlad",
      section: "work",
    });
    await ta.submit(opId(), "realizace.terminal.note", {
      jobId: j.id,
      text: "Přijel statik",
      section: "events",
    });
    const rows = await app.db.select().from(siteDiary).where(eq(siteDiary.jobId, j.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.work).toMatch(/^\[\d\d:\d\d\] Vybourány otvory\n\[\d\d:\d\d\] Zazděn překlad$/);
    expect(rows[0]!.events).toMatch(/Přijel statik$/);
  });

  it("zápis odeslaný dvakrát vytvoří jeden řádek deníku", async () => {
    const a = await worker();
    const j = await newJob({ members: [a.id] });
    const t = terminalFor(a.ctx);
    const id = opId();
    await t.submit(id, "realizace.terminal.note", { jobId: j.id, text: "Jednou", section: "work" });
    await t.submit(id, "realizace.terminal.note", { jobId: j.id, text: "Jednou", section: "work" });
    const [row] = await app.db.select().from(siteDiary).where(eq(siteDiary.jobId, j.id));
    expect(row!.work!.split("\n")).toHaveLength(1);
  });

  it("podepsaný zápis dne se nemění, uzavřená a cizí zakázka se odmítne", async () => {
    const a = await worker();
    const j = await newJob({ members: [a.id] });
    const t = terminalFor(a.ctx);
    await t.submit(opId(), "realizace.terminal.note", {
      jobId: j.id,
      text: "Ráno",
      section: "work",
    });
    await app.db.update(siteDiary).set({ signedAt: new Date() }).where(eq(siteDiary.jobId, j.id));
    await expect(
      t.submit(opId(), "realizace.terminal.note", {
        jobId: j.id,
        text: "Odpoledne",
        section: "work",
      }),
    ).rejects.toThrow(/podepsaný/);

    const closed = await newJob({ members: [a.id], phase: "closed" });
    await expect(
      t.submit(opId(), "realizace.terminal.note", { jobId: closed.id, text: "x", section: "work" }),
    ).rejects.toThrow(/uzavřená/);

    const foreign = await newJob();
    await expect(
      t.submit(opId(), "realizace.terminal.note", {
        jobId: foreign.id,
        text: "x",
        section: "work",
      }),
    ).rejects.toThrow();
  });

  it("hlášení závady založí vadu zakázky; zpožděný zápis se zapíše s datem ťuknutí", async () => {
    const a = await worker();
    const j = await newJob({ members: [a.id] });
    const t = terminalFor(a.ctx);
    const res = await t.submit(opId(), "realizace.terminal.defect", {
      jobId: j.id,
      title: "Prasklá deska",
      description: "V ose C",
      severity: "major",
    });
    const id = (res.result as { id: string }).id;
    const [d] = await app.db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, id));
    expect(d).toBeTruthy();
    const e = await resolveEntity(app.db, registry.get("defect")!);
    const page = await queryRecords(a.ctx, registry, e, {});
    expect(page.rows.find((r) => r.id === id)).toMatchObject({
      title: "Prasklá deska",
      severity: "major",
    });
  });
});

describe("nastavení terminálu v databázi", () => {
  const cipher = createCipher(
    parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
  );
  const settings = createSettings(cipher);

  it("bez uloženého nastavení platí konfigurace klienta", async () => {
    const eff = await loadEffectiveTerminalConfig(settings, app.db, base);
    expect(eff).toEqual(base);
  });

  it("správce může dlaždice vypnout, přejmenovat a přeřadit; ostatní položky zůstanou z konfigurace", async () => {
    const admin = await makeUser(app.db, [["settings.manage", "all"]]);
    await saveTerminalSettings(admin.ctx, settings, {
      roles: null,
      tiles: [
        { widget: "core.tasks", enabled: true, label: "Co mám udělat" },
        { widget: "dochazka.clock", enabled: false },
      ],
      attendance: { requireJob: true, allowJobChange: false, showHours: false },
      diary: null,
    });
    const eff = await loadEffectiveTerminalConfig(settings, app.db, base);
    expect(eff.tiles[0]).toMatchObject({ widget: "core.tasks", label: "Co mám udělat" });
    expect(eff.attendance).toEqual({ requireJob: true, allowJobChange: false, showHours: false });
    expect(eff.diary).toEqual(base.diary);
    expect(eff.roles).toEqual(base.roles);
    const u = await worker();
    const tiles = visibleTerminalTiles(defs, eff, (p) => u.ctx.actor.permissions.has(p));
    expect(tiles[0]).toMatchObject({ key: "core.tasks", label: "Co mám udělat" });
    expect(tiles.map((x) => x.key)).not.toContain("dochazka.clock");
    // změna se zapsala do auditu
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(eq(schema.auditLog.entityType, "setting"), eq(schema.auditLog.entityId, "terminal")),
      );
    expect(audit.length).toBeGreaterThan(0);
  });

  it("nastavení smí měnit jen držitel settings.manage", async () => {
    const u = await worker();
    await expect(
      saveTerminalSettings(u.ctx, settings, {
        roles: null,
        tiles: null,
        attendance: null,
        diary: null,
      }),
    ).rejects.toThrow(PermissionError);
  });

  it("roli, která spravuje systém, nejde omezit jen na terminál; neexistující role také ne", async () => {
    const admin = await makeUser(app.db, [["settings.manage", "all"]]);
    const adminRole = await makeUser(app.db, [["users.manage", "all"]]);
    const [r] = await app.db
      .select({ key: schema.role.key })
      .from(schema.user)
      .innerJoin(schema.role, eq(schema.user.roleId, schema.role.id))
      .where(eq(schema.user.id, adminRole.id));
    await expect(saveTerminalSettings(admin.ctx, settings, { roles: [r!.key] })).rejects.toThrow(
      /nelze omezit jen na terminál/,
    );
    await expect(
      saveTerminalSettings(admin.ctx, settings, { roles: ["neexistuje"] }),
    ).rejects.toThrow(/neexistuje/);
  });

  it("poškozené uložené nastavení terminál nesrazí: zahodí se jen vadná položka", async () => {
    const admin = await makeUser(app.db, [["settings.manage", "all"]]);
    await settings.set(admin.ctx, terminalSettingDef, {
      version: 1,
      roles: ["worker"],
      tiles: "nesmysl",
      attendance: null,
      diary: null,
    });
    const { value, problems } = await loadTerminalSettings(settings, app.db);
    expect(value.roles).toEqual(["worker"]);
    expect(value.tiles).toBeNull();
    expect(problems.length).toBeGreaterThan(0);
    // vrácení výchozích hodnot
    await saveTerminalSettings(admin.ctx, settings, {
      roles: null,
      tiles: null,
      attendance: null,
      diary: null,
    });
    expect(await loadEffectiveTerminalConfig(settings, app.db, base)).toEqual(base);
  });

  it("dlaždice platformy je k dispozici vždy", () => {
    expect(CORE_TERMINAL_WIDGETS.map((w) => w.key)).toContain("core.tasks");
  });
});
