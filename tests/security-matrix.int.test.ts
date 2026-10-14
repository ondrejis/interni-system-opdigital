import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NotFoundError, PermissionError, UserError, scopeOf, type Ctx } from "@rebar/core/rbac";
import {
  createRecord,
  deleteRecord,
  getRecord,
  queryRecords,
  resolveEntity,
  restoreRecord,
  searchAll,
  updateRecord,
  getRecordActivity,
  describeEntity,
} from "@rebar/core/entities";
import { schema } from "@rebar/core/db";
import { prepareEntityExport } from "@rebar/core/export";
import { addComment } from "@rebar/core/collab";
import { listAttachments } from "@rebar/core/files";
import type { Db } from "@rebar/core/db";
import { connectAppDb } from "@rebar/core/testing";
import { assertCommandPermission } from "../apps/web/src/server/command-gate";
import {
  buildFixture,
  MONEY,
  isolatedDb,
  ROLE_KEYS,
  type Fixture,
  type RoleKey,
} from "./support/security-fixture";
import { findForeign, findMoney } from "./support/scan";
import { PROBES, type ProbeEnv } from "./support/security-probes";

const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

const roleCtx = (role: RoleKey): Ctx =>
  ({
    owner: f.people.owner,
    office: f.people.office,
    foreman: f.people.foremanA,
    worker: f.people.workerA,
  })[role].ctx;

/** Odmítnutí, které neprozradí, že záznam existuje: PermissionError, NotFoundError, nebo hláška „neexistuje“. */
const denied = (e: unknown) =>
  e instanceof PermissionError ||
  e instanceof NotFoundError ||
  (e instanceof UserError && /neexistuje|nenalezen|jen své|jen za sebe/i.test(e.message));

/** Příkazy, které cizí záznam tiše nezmění (filtr na vlastníka v dotazu); ověřuje je samostatný test. */
const NOOP_ON_FOREIGN = new Set(["kalendar.import.delete"]);

class Rollback extends Error {}

/** Spustí příkaz jako daný člověk v transakci, která se vždy vrátí, takže sestava zůstane beze změny. */
async function runCmd(person: { ctx: Ctx }, name: string, input: unknown) {
  const cmd = f.collected.commands.get(name)!;
  let result: unknown;
  let failure: unknown;
  try {
    await db.transaction(async (tx) => {
      const ctx: Ctx = { ...person.ctx, db: tx };
      try {
        assertCommandPermission(ctx, cmd);
        result = await cmd.handler(ctx, cmd.input.parse(input), f.deps);
      } catch (e) {
        failure = e;
      }
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  if (failure) throw failure;
  return result;
}

/* ================================================================== */

describe("matice oprávnění: příkazy modulů × výchozí role", () => {
  it("každý registrovaný příkaz je zařazen do matice (nový příkaz bez zařazení test shodí)", () => {
    const missing = [...f.collected.commands.keys()].filter((n) => !(n in PROBES));
    expect(missing, "doplňte příkaz do tests/support/security-probes.ts").toEqual([]);
    const stale = Object.keys(PROBES).filter((n) => !f.collected.commands.has(n));
    expect(stale, "probe pro neexistující příkaz").toEqual([]);
  });

  it("brána příkazu: povoleno právě tehdy, když role má některé z požadovaných oprávnění", () => {
    for (const role of ROLE_KEYS) {
      const ctx = roleCtx(role);
      for (const [name, cmd] of f.collected.commands) {
        const keys = [cmd.permission ?? []].flat();
        const expected = keys.length === 0 || keys.some((k) => scopeOf(ctx, k) !== null);
        let allowed = true;
        try {
          assertCommandPermission(ctx, cmd);
        } catch (e) {
          allowed = false;
          expect(e, `${role}/${name}`).toBeInstanceOf(PermissionError);
        }
        expect(allowed, `${role} → ${name}`).toBe(expected);
      }
    }
  });

  it("majitel smí vše; montér a mistr nedostanou žádný příkaz s oprávněním ekonomiky, rozpočtu, faktur a nastavení", () => {
    const owner = roleCtx("owner");
    for (const [n, cmd] of f.collected.commands)
      expect(() => assertCommandPermission(owner, cmd), n).not.toThrow();
    const restricted =
      /^(zakazky\.(budget|costs|orders|change\.(?!decide)|share|approval\.rules)|fakturace\.|poptavky\.)|\.settings\.|lockMonth/;
    for (const role of ["foreman", "worker"] as const) {
      const ctx = roleCtx(role);
      for (const [n, cmd] of f.collected.commands) {
        if (!restricted.test(n)) continue;
        expect(() => assertCommandPermission(ctx, cmd), `${role} → ${n}`).toThrow(PermissionError);
      }
    }
  });
});

describe("matice oprávnění: mistr a montér nevidí peníze ani cizí zakázky (spuštění příkazů)", () => {
  const leaks: string[] = [];
  const outcomes: string[] = [];

  for (const role of ["foreman", "worker"] as const) {
    it(`${role}: žádný příkaz nevrátí peníze ani data cizí zakázky a zápis cizí zakázky selže`, async () => {
      const me = role === "foreman" ? f.people.foremanA : f.people.workerA;
      const other = role === "foreman" ? f.people.workerB : f.people.foremanB;
      const foreignMarkers = [
        f.jobB.title,
        f.jobB.number,
        f.jobB.orderId,
        f.jobB.invoiceId,
        f.jobB.statementId,
        f.jobB.changeId,
      ];
      for (const [name, probe] of Object.entries(PROBES)) {
        const cmd = f.collected.commands.get(name)!;
        let gateOk = true;
        try {
          assertCommandPermission(me.ctx, cmd);
        } catch {
          gateOk = false;
        }
        if (!gateOk) continue; // zamítnuto bránou (viz test výše)

        // záznam cizího člověka: musí selhat bez prozrazení
        if (probe.foreignOwned) {
          try {
            const res = await runCmd(
              me,
              name,
              probe.input({ f, job: f.jobA, otherUserId: other.id }),
            );
            if (!NOOP_ON_FOREIGN.has(name))
              leaks.push(
                `${role} ${name} (cizí záznam): povoleno, vrátil ${JSON.stringify(res)?.slice(0, 80)}`,
              );
          } catch (e) {
            if (!denied(e))
              leaks.push(
                `${role} ${name} (cizí záznam): chyba ${(e as Error).constructor.name}: ${(e as Error).message}`,
              );
          }
          continue;
        }
        // vlastní zakázka: odpověď nesmí obsahovat peníze
        const own: ProbeEnv = { f, job: f.jobA, otherUserId: other.id };
        try {
          const res = await runCmd(me, name, probe.input(own));
          outcomes.push(`${role} ${name}: ok`);
          for (const m of findMoney(res)) leaks.push(`${role} ${name} (vlastní): ${m}`);
          for (const m of findForeign(res, foreignMarkers))
            leaks.push(`${role} ${name} (vlastní): cizí data ${m}`);
        } catch (e) {
          outcomes.push(
            `${role} ${name}: ${(e as Error).constructor.name} ${(e as Error).message.slice(0, 90).replace(/\s+/g, " ")}`,
          );
        }
        // cizí zakázka: musí selhat s PermissionError/NotFoundError, nikdy data
        if (!probe.global) {
          const foreign: ProbeEnv = { f, job: f.jobB, otherUserId: other.id };
          try {
            const res = await runCmd(me, name, probe.input(foreign));
            leaks.push(
              `${role} ${name} (cizí zakázka): vrátil data ${JSON.stringify(res)?.slice(0, 80)}`,
            );
          } catch (e) {
            if (!denied(e))
              leaks.push(
                `${role} ${name} (cizí zakázka): chyba ${(e as Error).constructor.name}: ${(e as Error).message}`,
              );
          }
        }
      }
    }, 120_000);
  }

  it("souhrn nálezů", () => {
    expect(leaks).toEqual([]);
  });
});

/* ================================================================== */

/** Cizí záznam (z pohledu zakázky A) každé entity; `null` = entita je společná (kontakty, sklad…). */
function foreignRecordOf(key: string): string {
  const ids = f.ids;
  const map: Record<string, string> = {
    company: ids.client,
    person: ids.contact,
    inquiry: ids.inquiry,
    crm_activity: ids.crmActivity,
    crm_note: ids.crmNote,
    crm_activity_type: ids.crmActivityType,
    job: f.jobB.id,
    job_order: f.jobB.orderId,
    defect: f.jobB.defectId,
    invoice: f.jobB.invoiceId,
    received_invoice: f.jobB.receivedId,
    time_entry: f.jobB.memberEntryId,
    stock_item: ids.item,
    warehouse: ids.warehouse,
    stock_doc: ids.stockDoc,
    purchase_order: ids.purchaseOrder,
    stock_count: ids.stockCount,
    asset: ids.asset,
    asset_defect: ids.assetDefect,
    event: ids.eventB,
    calendar_resource: ids.resource,
  };
  const id = map[key];
  if (!id)
    throw new Error(
      `Entita „${key}“ není zařazená v matici oprávnění (tests/security-matrix.int.test.ts).`,
    );
  return id;
}

/** Spustí `fn` v transakci, která se vrátí (zápisy z testu zůstanou beze stopy). */
async function rolledBack<T>(person: { ctx: Ctx }, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  let out!: T;
  let failure: unknown;
  let failed = false;
  try {
    await db.transaction(async (tx) => {
      try {
        out = await fn({ ...person.ctx, db: tx });
      } catch (e) {
        failed = true;
        failure = e;
      }
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  if (failed) throw failure;
  return out;
}

const failsWith = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return null;
};

describe("matice oprávnění: entity × role (čtení, zápis, vytvoření, smazání)", () => {
  it("každá entita je zařazená a má oprávnění z katalogu", () => {
    for (const e of f.collected.entities) {
      expect(() => foreignRecordOf(e.key)).not.toThrow();
      for (const k of [
        e.permissions.read,
        e.permissions.write,
        e.permissions.create,
        e.permissions.delete,
      ]) {
        if (k) expect(f.catalog.has(k), `${e.key}: ${k}`).toBe(true);
      }
    }
  });

  const people = (): [string, { ctx: Ctx }][] => [
    ["owner", f.people.owner],
    ["office", f.people.office],
    ["foreman", f.people.foremanA],
    ["worker", f.people.workerA],
  ];

  it("bez oprávnění nejde číst, zapisovat, zakládat ani mazat; oprávnění s rozsahem „jen moje“ nepustí na cizí záznam", async () => {
    const problems: string[] = [];
    for (const [role, person] of people()) {
      for (const def of f.collected.entities) {
        const resolved = await resolveEntity(person.ctx.db, def);
        const id = foreignRecordOf(def.key);
        const readScope = scopeOf(person.ctx, def.permissions.read);
        const writeScope = scopeOf(person.ctx, def.permissions.write);
        const createScope = scopeOf(person.ctx, def.permissions.create ?? def.permissions.write);
        const deleteScope = scopeOf(person.ctx, def.permissions.delete ?? def.permissions.write);
        const at = `${role}/${def.key}`;

        // čtení seznamu a detailu
        const list = await failsWith(queryRecords(person.ctx, f.registry, resolved, {}));
        if (!readScope && !(list instanceof PermissionError))
          problems.push(`${at}: seznam bez oprávnění`);
        if (readScope && list) problems.push(`${at}: seznam s oprávněním selhal: ${String(list)}`);
        const one = await failsWith(getRecord(person.ctx, f.registry, resolved, id));
        if (!readScope && !(one instanceof PermissionError))
          problems.push(`${at}: detail bez oprávnění`);
        if (readScope === "all" && one)
          problems.push(`${at}: detail s rozsahem „vše“ selhal: ${String(one)}`);

        // zápis (inline úprava), vytvoření, smazání se vrací zpět
        const patch = { [def.titleKey]: "Změněno" };
        const upd = await failsWith(
          rolledBack(person, (c) => updateRecord(c, f.registry, resolved, id, patch)),
        );
        if (!writeScope && !denied(upd))
          problems.push(`${at}: úprava bez oprávnění (${String(upd)})`);
        const cre = await failsWith(
          rolledBack(person, (c) => createRecord(c, f.registry, resolved, {})),
        );
        if (!createScope && !(cre instanceof PermissionError))
          problems.push(`${at}: vytvoření bez oprávnění (${String(cre)})`);
        if (createScope && !cre) problems.push(`${at}: prázdné vytvoření prošlo`);
        const del = await failsWith(rolledBack(person, (c) => deleteRecord(c, resolved, id)));
        if (!deleteScope && !denied(del) && !(del instanceof UserError))
          problems.push(`${at}: smazání bez oprávnění (${String(del)})`);
        if (!deleteScope && !del) problems.push(`${at}: smazání bez oprávnění prošlo`);
        const res = await failsWith(rolledBack(person, (c) => restoreRecord(c, resolved, id)));
        if (writeScope !== "all" && !res) problems.push(`${at}: obnovení bez rozsahu „vše“ prošlo`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("mistr vidí jen své zakázky: seznam, detail, úprava i smazání cizí zakázky selže", async () => {
    const me = f.people.foremanA;
    const job = await resolveEntity(
      db,
      f.collected.entities.find((e) => e.key === "job")!,
    );
    const list = await queryRecords(me.ctx, f.registry, job, {});
    expect(list.rows.map((r) => r.id)).toEqual([f.jobA.id]);
    expect(findForeign(list, [f.jobB.id, f.jobB.number, f.jobB.title])).toEqual([]);
    expect(await failsWith(getRecord(me.ctx, f.registry, job, f.jobB.id))).toBeInstanceOf(
      NotFoundError,
    );
    expect(
      await failsWith(updateRecord(me.ctx, f.registry, job, f.jobB.id, { title: "Hacknuto" })),
    ).toBeInstanceOf(NotFoundError);
    expect(await failsWith(deleteRecord(me.ctx, job, f.jobB.id))).toBeInstanceOf(NotFoundError);
    // hledání (Cmd+K) cizí zakázku neukáže
    const hits = await searchAll(me.ctx, f.registry.all(), "Zakázka");
    expect(hits.map((h) => h.id)).toContain(f.jobA.id);
    expect(hits.map((h) => h.id)).not.toContain(f.jobB.id);
  });

  it("mistr a montér nedostanou v seznamu zakázek peněžní atributy (ani v popisu entity, součtech a řazení)", async () => {
    const job = await resolveEntity(
      db,
      f.collected.entities.find((e) => e.key === "job")!,
    );
    for (const person of [f.people.foremanA, f.people.workerA]) {
      const desc = await describeEntity(person.ctx, db, job, f.registry);
      const keys = desc.attributes.map((a) => a.key);
      for (const hiddenKey of [
        "value",
        "sumContract",
        "sumCost",
        "sumInvoiced",
        "sumPaid",
        "sumMarginPct",
        "sumDrawdownPct",
        "retentionBp",
      ])
        expect(keys, `${person.ctx.actor.roleKey}: ${hiddenKey}`).not.toContain(hiddenKey);
      const list = await queryRecords(person.ctx, f.registry, job, {});
      expect(findMoney(list)).toEqual([]);
      expect(Object.keys(list.totals)).toEqual([]);
      await expect(
        queryRecords(person.ctx, f.registry, job, { sort: [{ attr: "sumCost", dir: "desc" }] }),
      ).rejects.toThrow(/nejde řadit/);
      await expect(
        queryRecords(person.ctx, f.registry, job, {
          filters: {
            op: "and",
            conditions: [{ attr: "value", op: "gt", value: 1 }],
          } as never,
        }),
      ).rejects.toThrow(/value/);
      await expect(
        updateRecord(person.ctx, f.registry, job, f.jobA.id, { value: 1 }),
      ).rejects.toThrow(/Neznámý atribut|oprávnění/);
    }
    // kontrola, že skener není slepý: majitel a kancelář peníze vidí
    for (const person of [f.people.owner, f.people.office]) {
      const list = await queryRecords(person.ctx, f.registry, job, {});
      expect(findMoney(list).length).toBeGreaterThan(0);
      // kontrola, že odmítnutí výše je opravdu kvůli oprávnění: majiteli stejný filtr i řazení projdou
      await expect(
        queryRecords(person.ctx, f.registry, job, {
          filters: { op: "and", conditions: [{ attr: "value", op: "gt", value: 1 }] } as never,
          sort: [{ attr: "sumCost", dir: "desc" }],
        }),
      ).resolves.toBeDefined();
    }
  });

  it("montér nevidí faktury ani přijaté faktury, mistr také ne (seznam, detail, PDF příkaz, hledání)", async () => {
    for (const person of [f.people.workerA, f.people.foremanA]) {
      for (const key of ["invoice", "received_invoice"]) {
        const e = await resolveEntity(
          db,
          f.collected.entities.find((x) => x.key === key)!,
        );
        await expect(queryRecords(person.ctx, f.registry, e, {})).rejects.toBeInstanceOf(
          PermissionError,
        );
        await expect(
          getRecord(
            person.ctx,
            f.registry,
            e,
            key === "invoice" ? f.jobA.invoiceId : f.jobA.receivedId,
          ),
        ).rejects.toBeInstanceOf(PermissionError);
      }
      await expect(
        runCmd(person, "fakturace.get", { id: f.jobA.invoiceId }),
      ).rejects.toBeInstanceOf(PermissionError);
      await expect(runCmd(person, "fakturace.received.list", {})).rejects.toBeInstanceOf(
        PermissionError,
      );
      const hits = await searchAll(person.ctx, f.registry.all(), "Faktura");
      expect(
        hits.filter((h) => h.entityType === "invoice" || h.entityType === "received_invoice"),
      ).toEqual([]);
    }
  });

  it("montér nevidí cizí výkazy ani svůj tým; mistr jen svůj tým a bez sazeb", async () => {
    const te = await resolveEntity(
      db,
      f.collected.entities.find((e) => e.key === "time_entry")!,
    );
    await expect(queryRecords(f.people.workerA.ctx, f.registry, te, {})).rejects.toBeInstanceOf(
      PermissionError,
    );
    for (const target of [f.people.workerB, f.people.foremanB]) {
      await expect(
        runCmd(f.people.workerA, "dochazka.week", { weekStart: "2026-09-14", userId: target.id }),
      ).rejects.toBeInstanceOf(PermissionError);
      await expect(
        runCmd(f.people.workerA, "dochazka.month", { month: "2026-09", userId: target.id }),
      ).rejects.toBeInstanceOf(PermissionError);
      await expect(
        runCmd(f.people.workerA, "dochazka.save", {
          userId: target.id,
          date: "2026-09-21",
          kind: "work",
          hours: 1,
        }),
      ).rejects.toBeInstanceOf(PermissionError);
      await expect(
        runCmd(f.people.foremanA, "dochazka.week", { weekStart: "2026-09-14", userId: target.id }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        runCmd(f.people.foremanA, "dochazka.month", { month: "2026-09", userId: target.id }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        runCmd(f.people.foremanA, "dochazka.save", {
          userId: target.id,
          date: "2026-09-21",
          kind: "work",
          hours: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        runCmd(f.people.foremanA, "dochazka.reviewWeek", {
          userId: target.id,
          weekStart: "2026-09-14",
          decision: "approve",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
    // mistr vidí svůj tým (montér A pracuje na jeho zakázce) a report neobsahuje cizí lidi ani sazby
    const week = await runCmd(f.people.foremanA, "dochazka.week", {
      weekStart: "2026-09-14",
      userId: f.people.workerA.id,
    });
    expect((week as { entries: unknown[] }).entries.length).toBeGreaterThan(0);
    const report = (await runCmd(f.people.foremanA, "dochazka.report", { month: "2026-09" })) as {
      users: { userId: string; costMinor: number | null }[];
    };
    expect(report.users.map((u) => u.userId).sort()).toEqual(
      [f.people.foremanA.id, f.people.workerA.id].sort(),
    );
    expect(report.users.every((u) => u.costMinor === null)).toBe(true);
    const approvals = (await runCmd(f.people.foremanA, "dochazka.approvals", {})) as {
      userId: string;
    }[];
    expect(approvals.map((a) => a.userId)).not.toContain(f.people.foremanB.id);
    // kancelář vidí všechny a náklady
    const all = (await runCmd(f.people.office, "dochazka.report", { month: "2026-09" })) as {
      users: { userId: string; costMinor: number | null }[];
    };
    expect(all.users.length).toBeGreaterThanOrEqual(4);
    expect(all.users.some((u) => (u.costMinor ?? 0) > 0)).toBe(true);
  });
});

describe("matice oprávnění: časová osa, přehled, soubory, komentáře, export", () => {
  it("časová osa zakázky neukáže montérovi a mistrovi peníze (změny skrytých atributů ani částky v textu)", async () => {
    const jobDef = f.collected.entities.find((e) => e.key === "job")!;
    const valueLabel = jobDef.attributes.find((a) => a.key === "value")!.label;
    await db.insert(schema.auditLog).values([
      {
        actorKind: "system",
        action: "update",
        entityType: "job",
        entityId: f.jobA.id,
        summary: "Zakázka upravena",
        changes: [{ field: valueLabel, old: 100, new: MONEY.contract }],
      },
      {
        actorKind: "system",
        action: "update",
        entityType: "job",
        entityId: f.jobA.id,
        summary: "Fáze: Příprava → Realizace",
        changes: [],
      },
      {
        actorKind: "system",
        action: "create",
        entityType: "job",
        entityId: f.jobA.id,
        summary: `Náklad: Kabely ${(MONEY.cost / 100).toLocaleString("cs-CZ")} Kč`,
        changes: [],
      },
      {
        actorKind: "system",
        action: "update",
        entityType: "job",
        entityId: f.jobA.id,
        summary: "Termín",
        changes: [{ field: "Konec", old: "2026-11-01", new: "2026-12-01" }],
      },
    ]);
    for (const person of [f.people.foremanA, f.people.workerA]) {
      const act = await getRecordActivity(person.ctx, "job", f.jobA.id, jobDef);
      expect(findMoney(act), `${person.ctx.actor.roleKey}`).toEqual([]);
      const summaries = act.timeline.map((t) => (t.kind === "audit" ? t.summary : null));
      expect(summaries).toContain("Fáze: Příprava → Realizace");
      expect(summaries).toContain("Termín");
    }
    const office = await getRecordActivity(f.people.office.ctx, "job", f.jobA.id, jobDef);
    expect(findMoney(office).length).toBeGreaterThan(0);
  });

  it("přehled (pozornost a dlaždice) neukáže mistrovi a montérovi peníze ani cizí zakázky", async () => {
    for (const person of [f.people.foremanA, f.people.workerA]) {
      const items = (
        await Promise.all([
          ...f.collected.attention.map((a) => a(person.ctx, f.deps)),
          ...f.collected.widgets.map((w) => w(person.ctx, f.deps)),
        ])
      ).flat();
      expect(findMoney(items), person.ctx.actor.roleKey ?? "").toEqual([]);
      expect(findForeign(items, [f.jobB.title, f.jobB.number, f.jobB.id])).toEqual([]);
    }
  });

  it("soubory, komentáře a úkoly se řídí oprávněním k záznamu: u cizí zakázky nelze číst ani zapisovat", async () => {
    for (const person of [f.people.foremanA, f.people.workerA]) {
      await expect(listAttachments(person.ctx, "job", f.jobB.id)).rejects.toThrow();
      await expect(
        addComment(person.ctx, { entityType: "job", entityId: f.jobB.id, body: "x" }),
      ).rejects.toThrow();
      await expect(listAttachments(person.ctx, "invoice", f.jobA.invoiceId)).rejects.toThrow();
      await expect(listAttachments(person.ctx, "neznamy_typ", f.jobA.id)).rejects.toThrow();
    }
  });

  it("export seznamu respektuje skryté atributy a rozsah: mistr nevyexportuje ceny ani cizí zakázky", async () => {
    const job = await resolveEntity(
      db,
      f.collected.entities.find((e) => e.key === "job")!,
    );
    const me = f.people.foremanA;
    await expect(
      prepareEntityExport(me.ctx, f.registry, job, { format: "csv", columns: ["title", "value"] }),
    ).rejects.toThrow();
    const prepared = await prepareEntityExport(me.ctx, f.registry, job, { format: "csv" });
    let text = "";
    for await (const chunk of prepared.chunks) text += chunk.toString("utf8");
    expect(findForeign(text, [f.jobB.title, f.jobB.number])).toEqual([]);
    expect(findMoney(text)).toEqual([]);
    expect(prepared.count).toBe(1);
  });

  it("kontrola, že skener peněz není slepý: kancelář a majitel dostanou z příkazů ekonomiku", async () => {
    for (const person of [f.people.office, f.people.owner]) {
      const sum = await runCmd(person, "zakazky.summary", { jobId: f.jobA.id });
      expect(findMoney(sum).length).toBeGreaterThan(0);
      const tree = await runCmd(person, "zakazky.budget.tree", { jobId: f.jobA.id });
      expect(findMoney(tree).length).toBeGreaterThan(0);
      const stock = await runCmd(person, "sklad.overview", {});
      expect(findMoney(stock).length).toBeGreaterThan(0);
    }
  });

  it("příkaz bez zařazení v NOT_PROBED neexistuje: každý příkaz s ekonomikou vyžaduje oprávnění", () => {
    const money =
      /^(zakazky\.(summary|costs|orders|budget\.(tree|version\.list|calc\.list))|fakturace\.(get|received\.(get|list)|jobSummary|finalSettlement))/;
    for (const [name, cmd] of f.collected.commands)
      if (money.test(name)) expect(cmd.permission, name).toBeTruthy();
  });
});

it("kalendář: cizí import nejde smazat (příkaz tiše nic nezmění)", async () => {
  for (const person of [f.people.foremanA, f.people.workerA]) {
    await runCmd(person, "kalendar.import.delete", { id: f.ids.importB }).catch(() => {});
  }
  const rows = await db.select().from((await import("@rebar/kalendar/schema")).calendarImport);
  expect(rows.some((r) => r.id === f.ids.importB)).toBe(true);
});
