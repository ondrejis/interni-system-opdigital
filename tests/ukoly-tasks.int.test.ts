import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPipeline } from "@rebar/core/config-data";
import type { Db } from "@rebar/core/db";
import { PrivateAssignmentError } from "@rebar/core/entities";
import type { DomainEventHandler, DomainEventHandlers } from "@rebar/core/events";
import { setDomainEvents } from "@rebar/core/events";
import { createModuleDeps, type ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { connectAppDb } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { deal } from "@rebar/obchody/schema";
import { job } from "@rebar/zakazky/schema";
import { task, taskType } from "@rebar/ukoly/schema";
import {
  assignCommand,
  completeCommand,
  countsCommand,
  createCommand,
  deleteCommand,
  forRecordCommand,
  getCommand,
  listCommand,
  parseCommand,
  publishAndAssignCommand,
  quickAddCommand,
  rescheduleCommand,
  setStatusCommand,
  typeDeleteCommand,
  typeListCommand,
  typeSaveCommand,
  updateCommand,
} from "../packages/modules/ukoly/src/tasks/commands";
import { ensureTaskTypes } from "../packages/modules/ukoly/src/tasks/seed";
import { metrics } from "../packages/modules/ukoly/src/tasks/providers";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Úkoly a aktivity (UKO-A) nad skutečnou databází: příkazy `ukoly.*`, pravidla úkolu (podúkol, čas jen s datem, dokončení),
  doménové události, systémová pole obchodu, soukromí (VID-06), služba `tasks`, typy a metriky. Celý soubor běží
  v jedné transakci, která se vrátí.
*/
const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let deps: ModuleDeps;
const seen: { name: string; data: unknown }[] = [];
const today = todayIso();

const owner = () => f.people.owner.ctx;
const partner = () => f.people.partner.ctx;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  await ensureTaskTypes(db);
  // pravé služby a příspěvky modulů; události zachycuje špión vedle skutečných obsluh
  const collected = f.collected;
  deps = createModuleDeps(
    {
      registry: f.registry,
      queue: { send: async () => null },
      storage: f.deps.storage,
      settings: f.deps.settings,
      cipher: f.deps.cipher,
      baseURL: "http://localhost:3100",
      emit: async () => {},
      calendarLayers: collected.calendarLayers,
    },
    { services: collected.services, contributions: collected.contributions },
  );
  const spy =
    (name: string): DomainEventHandler =>
    async (_ctx, e) => {
      seen.push({ name, data: e.data });
    };
  const handlers: Record<string, DomainEventHandler[]> = {};
  for (const [k, list] of Object.entries(collected.eventHandlers))
    handlers[k] = [...(list as DomainEventHandler[])];
  for (const n of ["task.created", "task.completed", "task.changed"])
    (handlers[n] ??= []).push(spy(n));
  setDomainEvents(handlers as DomainEventHandlers, () => deps);
}, 120_000);

afterAll(async () => {
  setDomainEvents(undefined, undefined);
  await discard();
  await app.close();
});

/** Zavolá příkaz tak, jak ho volá aplikace: vstup projde schématem. */
const run = async <S extends { input: { parse: (v: unknown) => unknown } }>(
  cmd: S & { handler: (ctx: never, i: never, d: ModuleDeps) => Promise<unknown> },
  who: ReturnType<typeof owner>,
  input: unknown,
) => cmd.handler(who as never, cmd.input.parse(input) as never, deps);
const T = (v: unknown) => v as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function makeCompany(name = "Novák s.r.o.") {
  const [c] = await db.insert(company).values({ name }).returning();
  return c!.id;
}
async function makeDeal(opts: { companyId?: string; isPrivate?: boolean } = {}) {
  const pipe = await getPipeline(db, "deal", "default");
  const [d] = await db
    .insert(deal)
    .values({
      title: "Nový web",
      stageId: pipe!.stages[0]!.id,
      ...(opts.companyId ? { companyId: opts.companyId } : {}),
      ...(opts.isPrivate ? { isPrivate: true } : {}),
    })
    .returning();
  return d!.id;
}
let jobSeq = 0;
async function makeJob(companyId: string) {
  const [j] = await db
    .insert(job)
    .values({
      number: `Z-2026-9${String(++jobSeq).padStart(2, "0")}`,
      title: "Web",
      companyId,
      type: "web",
    })
    .returning();
  return j!.id;
}
const dealRow = async (id: string) => (await db.select().from(deal).where(eq(deal.id, id)))[0]!;

describe("založení a rychlé zadání", () => {
  it("úkol se založí, výchozí řešitel je zakladatel a vzniknou události task.created a task.changed", async () => {
    seen.length = 0;
    const t = T(await run(createCommand, owner(), { title: "Poslat nabídku", dueDate: today }));
    expect(t).toMatchObject({
      title: "Poslat nabídku",
      typeKey: "task",
      status: "todo",
      priority: "none",
      assigneeId: f.people.owner.id,
      dueDate: today,
      dueTime: null,
      state: "today",
      isPrivate: false,
    });
    expect(seen.map((s) => s.name)).toEqual(["task.created", "task.changed"]);
    expect(T(seen[1]!.data)).toMatchObject({ taskId: t.id, before: null });
  });

  it("quickAdd „zavolat Novákovi zítra 10:00“ založí Hovor na zítra 10:00 a vrátí rozpoznání", async () => {
    const now = new Date("2026-10-14T07:00:00Z"); // středa 9:00 v Praze
    const r = T(
      await (
        await import("../packages/modules/ukoly/src/tasks/write")
      ).quickAdd(owner(), deps, { text: "zavolat Novákovi zítra 10:00" }, now),
    );
    expect(r.task).toMatchObject({
      title: "Zavolat Novákovi",
      typeKey: "call",
      typeName: "Hovor",
      dueDate: "2026-10-15",
      dueTime: "10:00",
      isCalendarEvent: true,
    });
    expect(r.parsed.recognized.map((x: { kind: string }) => x.kind)).toEqual(
      expect.arrayContaining(["type", "date", "time"]),
    );
  });

  it("quickAdd s výslovnými hodnotami z náhledu je přebije a prázdný název odmítne", async () => {
    const r = T(
      await run(quickAddCommand, owner(), {
        text: "zavolat Novákovi zítra 10:00",
        override: { typeKey: "meeting", dueDate: "2027-01-05", dueTime: "08:30", title: "Porada" },
      }),
    );
    expect(r.task).toMatchObject({
      title: "Porada",
      typeKey: "meeting",
      dueDate: "2027-01-05",
      dueTime: "08:30",
    });
    await expect(run(quickAddCommand, owner(), { text: "zítra 10:00" })).rejects.toBeInstanceOf(
      UserError,
    );
  });

  it("ukoly.parse vrací náhled s typem z nastavení a příznakem prázdného názvu", async () => {
    const p = T(await run(parseCommand, owner(), { text: "schůzka v pátek 14:00 na hodinu" }));
    expect(p).toMatchObject({
      typeKey: "meeting",
      dueTime: "14:00",
      durationMin: 60,
      needsTitle: false,
    });
    expect(p.type).toMatchObject({ key: "meeting", name: "Schůzka" });
    expect(T(await run(parseCommand, owner(), { text: "zítra" })).needsTitle).toBe(true);
  });

  it("čas bez data se odmítne, odebrání data odebere i čas; neexistující typ se odmítne", async () => {
    const t = T(
      await run(createCommand, owner(), { title: "A", dueDate: today, dueTime: "10:00" }),
    );
    expect(t.dueTime).toBe("10:00");
    await expect(
      run(createCommand, owner(), { title: "B", dueTime: "10:00" }),
    ).resolves.toMatchObject({ dueDate: null, dueTime: null });
    const cleared = T(await run(updateCommand, owner(), { id: t.id, dueDate: null }));
    expect(cleared).toMatchObject({ dueDate: null, dueTime: null, state: "nodate" });
    await expect(
      run(createCommand, owner(), { title: "C", typeKey: "neexistuje" }),
    ).rejects.toBeInstanceOf(UserError);
  });

  it("vazby: obchod doplní organizaci, popis a štítky se uloží", async () => {
    const c = await makeCompany();
    const d = await makeDeal({ companyId: c });
    const t = T(
      await run(createCommand, owner(), {
        title: "Obchodní krok",
        dealId: d,
        description: "Podrobnosti",
        tags: [],
      }),
    );
    expect(t.deal.id).toBe(d);
    expect(t.company.id).toBe(c);
    expect(t.description).toBe("Podrobnosti");
  });
});

describe("podúkoly (jedna úroveň)", () => {
  it("podúkol zdědí vazby rodiče a rodič ukazuje počty", async () => {
    const c = await makeCompany();
    const d = await makeDeal({ companyId: c });
    const parent = T(await run(createCommand, owner(), { title: "Rodič", dealId: d }));
    const sub = T(await run(createCommand, owner(), { title: "Podúkol", parentId: parent.id }));
    expect(sub).toMatchObject({ parentId: parent.id, parentTitle: "Rodič" });
    expect(sub.deal.id).toBe(d);
    await run(setStatusCommand, owner(), { id: sub.id, status: "done" });
    const detail = T(await run(getCommand, owner(), { id: parent.id }));
    expect(detail.subtasks).toEqual({ total: 1, done: 1 });
    expect(detail.subtaskList.map((s: { id: string }) => s.id)).toEqual([sub.id]);
  });

  it("podúkol podúkolu a podúkol úkolu s podúkoly se odmítne", async () => {
    const a = T(await run(createCommand, owner(), { title: "A" }));
    const b = T(await run(createCommand, owner(), { title: "B", parentId: a.id }));
    await expect(run(createCommand, owner(), { title: "C", parentId: b.id })).rejects.toThrow(
      /jednu úroveň/,
    );
    const x = T(await run(createCommand, owner(), { title: "X" }));
    await expect(run(updateCommand, owner(), { id: a.id, parentId: x.id })).rejects.toThrow(
      /podúkoly/,
    );
    await expect(run(updateCommand, owner(), { id: x.id, parentId: x.id })).rejects.toThrow(
      /sám sebe/,
    );
  });
});

describe("stavy, dokončení a nabídka dalšího kroku (UKO-07)", () => {
  it("dokončení nastaví completedAt a událost task.completed, znovuotevření ho smaže", async () => {
    const t = T(await run(createCommand, owner(), { title: "Hotovo?" }));
    seen.length = 0;
    const r = T(await run(completeCommand, owner(), { id: t.id }));
    expect(r.task).toMatchObject({ status: "done", state: "done" });
    expect(r.task.completedAt).toBeTruthy();
    expect(r.offer).toEqual({ outcome: false, next: null }); // obyčejný úkol nic nenabízí
    expect(seen.map((s) => s.name)).toEqual(
      expect.arrayContaining(["task.completed", "task.changed"]),
    );
    const reopened = T(await run(setStatusCommand, owner(), { id: t.id, status: "in_progress" }));
    expect(reopened).toMatchObject({ status: "in_progress", completedAt: null });
  });

  it("dokončení hovoru nabídne výsledek a další aktivitu, ale nic nevytvoří", async () => {
    const before = (await db.select().from(task)).length;
    const t = T(
      await run(createCommand, owner(), {
        title: "Zavolat",
        typeKey: "call",
        dueDate: "2026-10-16",
        dueTime: "10:00",
        durationMin: 15,
      }),
    );
    const r = T(await run(completeCommand, owner(), { id: t.id }));
    expect(r.offer.outcome).toBe(true);
    expect(r.offer.next).toMatchObject({
      typeKey: "call",
      title: "Zavolat",
      dueTime: "10:00",
      durationMin: 15,
    });
    expect(r.offer.next.dueDate > today).toBe(true);
    expect(r.next).toBeNull();
    expect((await db.select().from(task)).length).toBe(before + 1); // jen ten jeden
  });

  it("výsledek zadaný při dokončení ukáže, že nabídka výsledku už není potřeba; další aktivita se založí jen na požádání", async () => {
    const t = T(
      await run(createCommand, owner(), {
        title: "Schůzka",
        typeKey: "meeting",
        dueDate: today,
        dueTime: "09:00",
      }),
    );
    const r = T(
      await run(completeCommand, owner(), {
        id: t.id,
        outcome: "Domluveno, pošle podklady",
        next: { title: "Poslat nabídku", dueDate: addDaysIso(today, 3) },
      }),
    );
    expect(r.task.outcome).toBe("Domluveno, pošle podklady");
    expect(r.offer.outcome).toBe(false);
    expect(r.next).toMatchObject({ title: "Poslat nabídku", dueDate: addDaysIso(today, 3) });
  });

  it("vlastní typ s příznakem „v kalendáři“ se chová jako aktivita", async () => {
    await run(typeSaveCommand, owner(), {
      key: "navsteva",
      name: "Návštěva",
      icon: "map-pin",
      isCalendarEvent: true,
    });
    const t = T(
      await run(createCommand, owner(), {
        title: "U klienta",
        typeKey: "navsteva",
        dueDate: today,
      }),
    );
    expect(T(await run(completeCommand, owner(), { id: t.id })).offer.next).not.toBeNull();
  });

  it("hotový úkol nejde přeplánovat; otevřený ano (datum, čas, odložení o dny)", async () => {
    const t = T(
      await run(createCommand, owner(), { title: "Odložit", dueDate: today, dueTime: "10:00" }),
    );
    const moved = T(
      await run(rescheduleCommand, owner(), {
        id: t.id,
        dueDate: addDaysIso(today, 2),
        dueTime: "15:00",
      }),
    );
    expect(moved).toMatchObject({ dueDate: addDaysIso(today, 2), dueTime: "15:00" });
    const snoozed = T(await run(rescheduleCommand, owner(), { id: t.id, days: 7 }));
    expect(snoozed).toMatchObject({ dueDate: addDaysIso(today, 7), dueTime: "15:00" });
    await run(completeCommand, owner(), { id: t.id });
    await expect(
      run(rescheduleCommand, owner(), { id: t.id, dueDate: today }),
    ).rejects.toBeInstanceOf(UserError);
  });
});

describe("systémová pole obchodu (OBCH-14)", () => {
  it("další a poslední aktivita obchodu se přepočítá po vzniku, dokončení i smazání úkolu", async () => {
    const d = await makeDeal();
    const t1 = T(
      await run(createCommand, owner(), {
        title: "Dřív",
        dealId: d,
        dueDate: addDaysIso(today, 2),
        dueTime: "10:00",
      }),
    );
    const t2 = T(
      await run(createCommand, owner(), {
        title: "Později",
        dealId: d,
        dueDate: addDaysIso(today, 5),
      }),
    );
    let row = await dealRow(d);
    expect(row.nextTaskId).toBe(t1.id);
    expect(row.nextActivityAt).toBeTruthy();
    expect(row.lastActivityAt).toBeNull();

    await run(completeCommand, owner(), { id: t1.id });
    row = await dealRow(d);
    expect(row.nextTaskId).toBe(t2.id);
    expect(row.lastActivityAt).toBeTruthy();

    await run(deleteCommand, owner(), { id: t2.id });
    row = await dealRow(d);
    expect(row.nextTaskId).toBeNull();
    expect(row.nextActivityAt).toBeNull();
    expect(row.lastActivityAt).toBeTruthy(); // dokončený t1 zůstává
  });

  it("soukromý úkol u sdíleného obchodu se do polí nepočítá (partner by termín uviděl)", async () => {
    const d = await makeDeal();
    const open = T(
      await run(createCommand, owner(), {
        title: "Sdílený",
        dealId: d,
        dueDate: addDaysIso(today, 9),
      }),
    );
    await run(createCommand, owner(), {
      title: "Soukromý",
      dealId: d,
      dueDate: addDaysIso(today, 1),
      isPrivate: true,
    });
    expect((await dealRow(d)).nextTaskId).toBe(open.id);
  });

  it("přesun úkolu na jiný obchod přepočítá oba; poslední aktivita organizace se zapíše", async () => {
    const c = await makeCompany("Jiná s.r.o.");
    const a = await makeDeal({ companyId: c });
    const b = await makeDeal({ companyId: c });
    const t = T(
      await run(createCommand, owner(), {
        title: "Přesun",
        dealId: a,
        dueDate: addDaysIso(today, 3),
      }),
    );
    expect((await dealRow(a)).nextTaskId).toBe(t.id);
    await run(updateCommand, owner(), { id: t.id, dealId: b });
    expect((await dealRow(a)).nextTaskId).toBeNull();
    expect((await dealRow(b)).nextTaskId).toBe(t.id);
    await run(completeCommand, owner(), { id: t.id });
    const [co] = await db.select().from(company).where(eq(company.id, c));
    expect(co!.lastActivityAt).toBeTruthy();
  });
});

describe("soukromí a přiřazení (VID-06)", () => {
  it("soukromý úkol partner nevidí (detail, seznam, počty); vlastník ano", async () => {
    const t = T(
      await run(createCommand, owner(), {
        title: "PRIVATE-CANARY-1",
        isPrivate: true,
        dueDate: today,
      }),
    );
    expect(t.isPrivate).toBe(true);
    await expect(run(getCommand, partner(), { id: t.id })).rejects.toBeInstanceOf(NotFoundError);
    const list = T(await run(listCommand, partner(), { view: "all", scope: "all" }));
    expect(JSON.stringify(list)).not.toContain("PRIVATE-CANARY-1");
    const mine = T(await run(listCommand, owner(), { view: "all" }));
    expect(JSON.stringify(mine)).toContain("PRIVATE-CANARY-1");
  });

  it("partner nesmí založit soukromý úkol", async () => {
    await expect(
      run(createCommand, partner(), { title: "X", isPrivate: true }),
    ).rejects.toBeInstanceOf(UserError);
  });

  it("soukromý úkol nejde přiřadit partnerovi; „Zveřejnit a přiřadit“ ho zveřejní a přiřadí", async () => {
    const t = T(await run(createCommand, owner(), { title: "Pro Patrika", isPrivate: true }));
    await expect(
      run(assignCommand, owner(), { id: t.id, assigneeId: f.people.partner.id }),
    ).rejects.toBeInstanceOf(PrivateAssignmentError);
    await expect(
      run(createCommand, owner(), {
        title: "Rovnou",
        isPrivate: true,
        assigneeId: f.people.partner.id,
      }),
    ).rejects.toBeInstanceOf(PrivateAssignmentError);
    await expect(
      run(publishAndAssignCommand, partner(), { id: t.id, assigneeId: f.people.partner.id }),
    ).rejects.toBeInstanceOf(PermissionError); // zveřejnit smí jen vlastník
    const r = T(
      await run(publishAndAssignCommand, owner(), { id: t.id, assigneeId: f.people.partner.id }),
    );
    expect(r).toMatchObject({ isPrivate: false, assigneeId: f.people.partner.id });
    // přiřazený úkol se druhému objeví okamžitě (UKO-09)
    const theirs = T(await run(listCommand, partner(), { view: "all" }));
    expect(theirs.rows.map((x: { id: string }) => x.id)).toContain(t.id);
  });

  it("úkol u soukromého obchodu je soukromý (zděděný zámek) a nejde zveřejnit samostatně", async () => {
    const d = await makeDeal({ isPrivate: true });
    const t = T(await run(createCommand, owner(), { title: "U soukromého", dealId: d }));
    expect(t.isPrivate).toBe(true);
    await expect(
      run(publishAndAssignCommand, owner(), { id: t.id, assigneeId: f.people.partner.id }),
    ).rejects.toBeInstanceOf(UserError);
  });
});

describe("pohledy „Moje úkoly“ a počty (UKO-04)", () => {
  it("Dnes obsahuje i po termínu; Nadcházejících 7 dní, Bez termínu, Delegované a Hotové jsou oddělené", async () => {
    const [a, b] = [f.people.owner.id, f.people.partner.id];
    const mk = (title: string, extra: object = {}) =>
      run(createCommand, owner(), { title, assigneeId: a, ...extra });
    const overdue = T(await mk("L-po-termínu", { dueDate: addDaysIso(today, -3) }));
    const dnes = T(await mk("L-dnes", { dueDate: today }));
    const brzy = T(await mk("L-za-4-dny", { dueDate: addDaysIso(today, 4) }));
    const daleko = T(await mk("L-za-30-dní", { dueDate: addDaysIso(today, 30) }));
    const bez = T(await mk("L-bez-termínu"));
    const delegovany = T(
      await run(createCommand, owner(), { title: "L-delegovaný", assigneeId: b, dueDate: today }),
    );
    const hotovy = T(await mk("L-hotový", { dueDate: today }));
    await run(completeCommand, owner(), { id: hotovy.id });

    const ids = async (view: string) =>
      new Set(
        T(await run(listCommand, owner(), { view, q: "L-" })).rows.map((r: { id: string }) => r.id),
      );
    expect(await ids("today")).toEqual(new Set([overdue.id, dnes.id]));
    expect(await ids("next7")).toEqual(new Set([brzy.id]));
    expect(await ids("nodate")).toEqual(new Set([bez.id]));
    expect(await ids("delegated")).toEqual(new Set([delegovany.id]));
    expect(await ids("done")).toEqual(new Set([hotovy.id]));
    expect((await ids("all")).has(daleko.id)).toBe(true);

    const counts = T(await run(countsCommand, owner(), {}));
    expect(counts.today).toBeGreaterThanOrEqual(2);
    expect(counts.overdue).toBeGreaterThanOrEqual(1);
    expect(counts.next7).toBeGreaterThanOrEqual(1);
    expect(counts.delegated).toBeGreaterThanOrEqual(1);
  });

  it("úkol bez fáze zakázky má jobPhaseName null (skupina „Bez fáze“, UKO-08) a forRecord vrací otevřené i hotové", async () => {
    const c = await makeCompany("Zakázková s.r.o.");
    const j = await makeJob(c);
    const t = T(await run(createCommand, owner(), { title: "Bez fáze", jobId: j }));
    expect(t).toMatchObject({ jobPhaseId: null, jobPhaseName: null });
    expect(t.job.id).toBe(j);
    expect(t.company.id).toBe(c);
    const done = T(
      await run(createCommand, owner(), { title: "Hotový v zakázce", jobId: j, done: true }),
    );
    const r = T(await run(forRecordCommand, owner(), { jobId: j }));
    expect(r.open.map((x: { id: string }) => x.id)).toEqual([t.id]);
    expect(r.done.map((x: { id: string }) => x.id)).toEqual([done.id]);
    expect(r.counts).toMatchObject({ open: 1, done: 1 });
    const byCompany = T(await run(forRecordCommand, owner(), { companyId: c }));
    expect(byCompany.counts.open).toBe(1);
  });
});

describe("rozsah „jen moje“ a oprávnění", () => {
  it("externí bez oprávnění nic nevidí a nezakládá", async () => {
    const ext = f.people.external.ctx;
    await expect(run(listCommand, ext, { view: "all" })).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("typy aktivit (NAS-07)", () => {
  it("seed je idempotentní a obsahuje pět systémových typů", async () => {
    await ensureTaskTypes(db);
    await ensureTaskTypes(db);
    const types = T(await run(typeListCommand, owner(), {})) as {
      key: string;
      isSystem: boolean;
    }[];
    const system = types.filter((t) => t.isSystem).map((t) => t.key);
    expect(system).toEqual(
      expect.arrayContaining(["task", "call", "meeting", "email", "deadline"]),
    );
    expect(new Set(types.map((t) => t.key)).size).toBe(types.length);
  });

  it("typ jde založit a změnit, klíč se nemění, systémový ani používaný typ se nesmaže", async () => {
    const t = T(
      await run(typeSaveCommand, owner(), {
        key: "workshop",
        name: "Workshop",
        icon: "users",
        color: "teal",
        isCalendarEvent: true,
      }),
    );
    expect(t).toMatchObject({ key: "workshop", isSystem: false, isCalendarEvent: true });
    const renamed = T(
      await run(typeSaveCommand, owner(), { id: t.id, key: "workshop", name: "Školení" }),
    );
    expect(renamed.name).toBe("Školení");
    await expect(
      run(typeSaveCommand, owner(), { id: t.id, key: "jiny", name: "Školení" }),
    ).rejects.toThrow(/Klíč/);
    await expect(run(typeSaveCommand, owner(), { key: "workshop", name: "Dup" })).rejects.toThrow(
      /už existuje/,
    );

    const sys = (await db.select().from(taskType)).find((x) => x.key === "call")!;
    await expect(run(typeDeleteCommand, owner(), { id: sys.id })).rejects.toThrow(/systémový/);

    await run(createCommand, owner(), { title: "Školení Plzeň", typeKey: "workshop" });
    await expect(run(typeDeleteCommand, owner(), { id: t.id })).rejects.toThrow(/používá/);
    const free = T(await run(typeSaveCommand, owner(), { key: "volny", name: "Volný" }));
    await run(typeDeleteCommand, owner(), { id: free.id });
    const after = T(await run(typeListCommand, owner(), {})) as { key: string }[];
    expect(after.some((x) => x.key === "volny")).toBe(false);
  });
});

describe("služba tasks pro ostatní moduly", () => {
  const svc = () => deps.services.get("tasks");

  it("createFromTemplate založí úkoly zakázky s fází a řešitelem; openCounts a overdueJobIds je spočítají", async () => {
    const c = await makeCompany("Šablonová s.r.o.");
    const j = await makeJob(c);
    const phase = crypto.randomUUID();
    const r = await svc().createFromTemplate(owner(), {
      jobId: j,
      ownerId: f.people.owner.id,
      startDate: today,
      phaseIds: [phase],
      items: [
        { phaseId: phase, title: "Sběr podkladů", dueDate: addDaysIso(today, -2) },
        {
          phaseId: phase,
          title: "Návrh",
          dueDate: addDaysIso(today, 5),
          estimateMin: 120,
          priority: "high",
        },
      ],
    });
    expect(r.taskIds).toHaveLength(2);
    const rows = await db.select().from(task).where(eq(task.jobId, j));
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (x) => x.assigneeId === f.people.owner.id && x.companyId === c && x.jobPhaseId === phase,
      ),
    ).toBe(true);
    expect(rows.find((x) => x.title === "Návrh")).toMatchObject({
      estimateMin: 120,
      priority: "high",
    });
    expect(await svc().openCounts(owner(), { jobId: j })).toEqual({ open: 2, overdue: 1 });
    expect(await svc().overdueJobIds(owner())).toContain(j);
    expect(await svc().overdueJobIds(partner())).toContain(j);
  });

  it("po fázích: openCountsByPhase, completeOpenInPhases (task.completed) a listForTemplate", async () => {
    const c = await makeCompany("Fázová s.r.o.");
    const j = await makeJob(c);
    const [p1, p2] = [crypto.randomUUID(), crypto.randomUUID()];
    const { taskIds } = await svc().createFromTemplate(owner(), {
      jobId: j,
      ownerId: f.people.owner.id,
      startDate: today,
      phaseIds: [p1, p2],
      items: [
        { phaseId: p1, title: "A1" },
        { phaseId: p1, title: "A2", dueDate: addDaysIso(today, 3), priority: "high" },
        { phaseId: p2, title: "B1" },
      ],
    });
    expect(await svc().openCountsByPhase(owner(), { jobId: j, phaseIds: [p1, p2] })).toEqual({
      [p1]: 2,
      [p2]: 1,
    });
    const tpl = await svc().listForTemplate(owner(), { jobId: j });
    expect(tpl.map((x) => x.title).sort()).toEqual(["A1", "A2", "B1"]);
    expect(tpl.find((x) => x.title === "A2")).toMatchObject({
      phaseId: p1,
      priority: "high",
      dueDate: addDaysIso(today, 3),
    });
    seen.length = 0;
    expect(await svc().completeOpenInPhases(owner(), { jobId: j, phaseIds: [p1] })).toEqual({
      completed: 2,
    });
    expect(seen.filter((s) => s.name === "task.completed")).toHaveLength(2);
    expect(await svc().openCountsByPhase(owner(), { jobId: j, phaseIds: [p1, p2] })).toEqual({
      [p1]: 0,
      [p2]: 1,
    });
    expect((await db.select().from(task).where(eq(task.id, taskIds[2]!)))[0]!.status).toBe("todo");
    expect((await svc().listForTemplate(owner(), { jobId: j })).map((x) => x.title)).toEqual([
      "B1",
    ]);
  });

  it("estimateByJob sečte odhady otevřených i hotových, bez zrušených a bez dvojího počítání podúkolů", async () => {
    const c = await makeCompany("Odhadová s.r.o.");
    const j = await makeJob(c);
    const mk = (i: object) => run(createCommand, owner(), { jobId: j, ...i });
    const parent = T(await mk({ title: "Rodič", estimateMin: 600 }));
    await mk({ title: "Pod 1", parentId: parent.id, estimateMin: 120 });
    await mk({ title: "Pod 2", parentId: parent.id, estimateMin: 60, done: true });
    await mk({ title: "Samostatný", estimateMin: 30 });
    const zrusen = T(await mk({ title: "Zrušený", estimateMin: 999 }));
    await run(setStatusCommand, owner(), { id: zrusen.id, status: "canceled" });
    await mk({ title: "Bez odhadu" });
    await mk({ title: "PRIVATE-CANARY-3", estimateMin: 1000, isPrivate: true });
    expect(await svc().estimateByJob(owner(), j)).toEqual({
      estimateMin: 120 + 60 + 30 + 1000,
      tasks: 4,
    });
    expect(await svc().estimateByJob(partner(), j)).toEqual({ estimateMin: 210, tasks: 3 });
  });

  it("soukromá zakázka: její úkoly se partnerovi nepočítají", async () => {
    const c = await makeCompany();
    const j = await makeJob(c);
    await db.update(job).set({ isPrivate: true }).where(eq(job.id, j));
    const { setVisibility } = await import("@rebar/core/entities");
    await setVisibility(owner(), f.registry, "job", j, false);
    await setVisibility(owner(), f.registry, "job", j, true);
    await svc().createFromTemplate(owner(), {
      jobId: j,
      ownerId: f.people.owner.id,
      startDate: today,
      phaseIds: [],
      items: [{ title: "PRIVATE-CANARY-2", dueDate: addDaysIso(today, -1) }],
    });
    expect(await svc().openCounts(partner(), { jobId: j })).toEqual({ open: 0, overdue: 0 });
    expect(await svc().openCounts(owner(), { jobId: j })).toEqual({ open: 1, overdue: 1 });
    expect(await svc().overdueJobIds(partner())).not.toContain(j);
  });

  it("logDoneActivity zapíše hotový hovor nebo e-mail", async () => {
    const c = await makeCompany();
    const { id } = await svc().logDoneActivity(owner(), {
      typeKey: "email",
      subject: "Nabídka odeslána",
      companyId: c,
    });
    const [row] = await db.select().from(task).where(eq(task.id, id));
    expect(row).toMatchObject({
      status: "done",
      typeKey: "email",
      companyId: c,
      assigneeId: f.people.owner.id,
    });
    expect(row!.completedAt).toBeTruthy();
  });

  it("createMeeting vytvoří úkol typu Schůzka s časem, délkou a účastníky", async () => {
    const { taskId } = await svc().createMeeting(owner(), {
      title: "Konzultace s Novákem",
      startsAt: "2026-11-03T08:00:00Z", // 9:00 v Praze (zimní čas)
      endsAt: "2026-11-03T09:30:00Z",
      place: "Plzeň",
      attendeeEmails: ["Novak@Example.cz"],
    });
    const detail = T(await run(getCommand, owner(), { id: taskId }));
    expect(detail).toMatchObject({
      typeKey: "meeting",
      dueDate: "2026-11-03",
      dueTime: "09:00",
      durationMin: 90,
      place: "Plzeň",
    });
    expect(detail.attendees).toEqual([{ kind: "email", ref: "novak@example.cz", label: null }]);
  });

  it("createPrivateNote smí jen vlastník a poznámka je soukromá", async () => {
    await expect(
      svc().createPrivateNote(partner(), { title: "x", bodyJson: {} }),
    ).rejects.toBeInstanceOf(PermissionError);
    const { id } = await svc().createPrivateNote(owner(), {
      title: "Můj nápad",
      bodyJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Obsah" }] }],
      },
    });
    const { note } = await import("@rebar/ukoly/schema");
    const [row] = await db.select().from(note).where(eq(note.id, id));
    expect(row).toMatchObject({ title: "Můj nápad", bodyText: "Obsah", isPrivate: true });
  });
});

describe("metriky", () => {
  it("ukoly.today a ukoly.overdue počítají otevřené úkoly přidělené uživateli", async () => {
    const run1 = async (key: string, who = owner()) => {
      const m = metrics.find((x) => x.key === key)!;
      const r = await m.compute(
        who,
        {
          from: null,
          to: null,
          jobId: null,
          userId: null,
          bucket: null,
          limit: 10,
          params: {},
          today,
        },
        deps,
      );
      return (r as { value: number }).value;
    };
    const before = { today: await run1("ukoly.today"), overdue: await run1("ukoly.overdue") };
    await run(createCommand, owner(), { title: "M-dnes", dueDate: today });
    await run(createCommand, owner(), { title: "M-po", dueDate: addDaysIso(today, -1) });
    await run(createCommand, owner(), { title: "M-soukromý", dueDate: today, isPrivate: true });
    expect(await run1("ukoly.today")).toBe(before.today + 2);
    expect(await run1("ukoly.overdue")).toBe(before.overdue + 1);
  });
});
