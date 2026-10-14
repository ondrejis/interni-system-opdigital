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
} from "@rebar/core/entities";
import { prepareEntityExport } from "@rebar/core/export";
import { addComment } from "@rebar/core/collab";
import { listAttachments } from "@rebar/core/files";
import type { Db } from "@rebar/core/db";
import { connectAppDb } from "@rebar/core/testing";
import { assertCommandPermission } from "../apps/web/src/server/command-gate";
import {
  buildFixture,
  isolatedDb,
  ROLE_KEYS,
  type Fixture,
  type RoleKey,
} from "./support/security-fixture";
import { findForeign } from "./support/scan";
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
    partner: f.people.partner,
    externista: f.people.externistaA,
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

describe("matice oprávnění: příkazy modulů × role OPSYS", () => {
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

  it("majitel smí vše; externista nedostane příkazy správy (sloučení kontaktů, nastavení)", () => {
    const owner = roleCtx("owner");
    for (const [n, cmd] of f.collected.commands)
      expect(() => assertCommandPermission(owner, cmd), n).not.toThrow();
    const restricted = /^kontakty\.merge\.|\.settings\./;
    const ctx = roleCtx("externista");
    for (const [n, cmd] of f.collected.commands) {
      if (!restricted.test(n)) continue;
      expect(() => assertCommandPermission(ctx, cmd), `externista → ${n}`).toThrow(PermissionError);
    }
  });
});

describe("matice oprávnění: externista nevidí cizí zakázky (spuštění příkazů)", () => {
  const leaks: string[] = [];

  it("externista: žádný příkaz nevrátí data cizí zakázky a zápis cizí zakázky selže", async () => {
    const me = f.people.externistaA;
    const other = f.people.externistaB;
    const foreignMarkers = [f.jobB.title, f.jobB.number];
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
              `${name} (cizí záznam): povoleno, vrátil ${JSON.stringify(res)?.slice(0, 80)}`,
            );
        } catch (e) {
          if (!denied(e))
            leaks.push(
              `${name} (cizí záznam): chyba ${(e as Error).constructor.name}: ${(e as Error).message}`,
            );
        }
        continue;
      }
      // vlastní zakázka: odpověď nesmí obsahovat data cizí zakázky
      const own: ProbeEnv = { f, job: f.jobA, otherUserId: other.id };
      try {
        const res = await runCmd(me, name, probe.input(own));
        for (const m of findForeign(res, foreignMarkers))
          leaks.push(`${name} (vlastní): cizí data ${m}`);
      } catch {
        // chyba vstupu u vlastní zakázky nevadí; únik se hlídá u odpovědí a u cizí zakázky
      }
      // cizí zakázka: musí selhat s PermissionError/NotFoundError, nikdy data
      if (!probe.global) {
        const foreign: ProbeEnv = { f, job: f.jobB, otherUserId: other.id };
        try {
          const res = await runCmd(me, name, probe.input(foreign));
          leaks.push(`${name} (cizí zakázka): vrátil data ${JSON.stringify(res)?.slice(0, 80)}`);
        } catch (e) {
          if (!denied(e))
            leaks.push(
              `${name} (cizí zakázka): chyba ${(e as Error).constructor.name}: ${(e as Error).message}`,
            );
        }
      }
    }
  }, 120_000);

  it("souhrn nálezů", () => {
    expect(leaks).toEqual([]);
  });
});

/* ================================================================== */

/** Cizí záznam (z pohledu externisty A) každé entity; společné entity (kontakty…) patří všem. */
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
    time_entry: ids.timeEntryB,
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
    ["partner", f.people.partner],
    ["externista", f.people.externistaA],
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

  it("externista vidí jen své zakázky: seznam, detail, úprava i smazání cizí zakázky selže", async () => {
    const me = f.people.externistaA;
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
});

describe("matice oprávnění: soubory, komentáře, přehled, export", () => {
  it("přehled (pozornost a dlaždice) neukáže externistovi cizí zakázky", async () => {
    const person = f.people.externistaA;
    const items = (
      await Promise.all([
        ...f.collected.attention.map((a) => a(person.ctx, f.deps)),
        ...f.collected.widgets.map((w) => w(person.ctx, f.deps)),
      ])
    ).flat();
    expect(findForeign(items, [f.jobB.title, f.jobB.number, f.jobB.id])).toEqual([]);
  });

  it("soubory, komentáře a úkoly se řídí oprávněním k záznamu: u cizí zakázky nelze číst ani zapisovat", async () => {
    const person = f.people.externistaA;
    await expect(listAttachments(person.ctx, "job", f.jobB.id)).rejects.toThrow();
    await expect(
      addComment(person.ctx, { entityType: "job", entityId: f.jobB.id, body: "x" }),
    ).rejects.toThrow();
    await expect(listAttachments(person.ctx, "neznamy_typ", f.jobA.id)).rejects.toThrow();
  });

  it("export seznamu respektuje rozsah: externista nevyexportuje cizí zakázky", async () => {
    const job = await resolveEntity(
      db,
      f.collected.entities.find((e) => e.key === "job")!,
    );
    const me = f.people.externistaA;
    const prepared = await prepareEntityExport(me.ctx, f.registry, job, { format: "csv" });
    let text = "";
    for await (const chunk of prepared.chunks) text += chunk.toString("utf8");
    expect(findForeign(text, [f.jobB.title, f.jobB.number])).toEqual([]);
    expect(prepared.count).toBe(1);
  });
});

it("kalendář: cizí import nejde smazat (příkaz tiše nic nezmění)", async () => {
  await runCmd(f.people.externistaA, "kalendar.import.delete", { id: f.ids.importB }).catch(
    () => {},
  );
  const rows = await db.select().from((await import("@rebar/kalendar/schema")).calendarImport);
  expect(rows.some((r) => r.id === f.ids.importB)).toBe(true);
});
