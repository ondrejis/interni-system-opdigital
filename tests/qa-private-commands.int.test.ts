import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@rebar/core/db";
import { setDomainEvents } from "@rebar/core/events";
import type { CommandDef, ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, PermissionError, UserError, type Ctx } from "@rebar/core/rbac";
import { connectAppDb } from "@rebar/core/testing";
import { assertCommandPermission } from "../apps/web/src/server/command-gate";
import { hasCanary, serialize } from "./support/canary";
import {
  buildPrivateFixture,
  buildRichData,
  fullDeps,
  type PrivateFixture,
  type RichData,
} from "./support/fixture";
import { privateIds } from "./support/probes-private";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Hádání ID (QA-SEC, NFR-08): každý příkaz, který partner smí spustit a který bere jen ID záznamů, se zavolá
  s ID SOUKROMÝCH záznamů všech druhů. Správná odpověď je odmítnutí (NotFound / Permission / srozumitelná chyba), nebo
  prázdný výsledek; nikdy canary a nikdy úspěšný zápis do soukromého záznamu. Zápisy běží v savepointu, který se vrací.
*/

const app = connectAppDb();
let f: Fixture;
let fx: PrivateFixture;
let rich: RichData;
let db: Db;
let deps: ModuleDeps;
let discard: () => Promise<void>;
let partner: Ctx;

class Rollback extends Error {}
async function savepoint<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  let out!: T;
  try {
    await db.transaction(async (tx) => {
      out = await fn(tx as unknown as Db);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out;
}

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  deps = fullDeps(f);
  setDomainEvents(f.collected.eventHandlers, () => deps);
  fx = await buildPrivateFixture(f, db);
  rich = await buildRichData(f, fx, db);
  partner = f.people.partner.ctx;
}, 240_000);
afterAll(async () => {
  setDomainEvents(undefined, undefined);
  await discard();
  await app.close();
});

type Kind = "company" | "person" | "job" | "deal" | "task" | "note" | "payment";
/** Název pole → druh záznamu, na který ukazuje. */
const KEY_KIND: Record<string, Kind> = {
  companyId: "company",
  clientId: "company",
  personId: "person",
  jobId: "job",
  dealId: "deal",
  taskId: "task",
  noteId: "note",
  paymentId: "payment",
};
/** Předpona příkazu → druh záznamu, který znamená holé `id`. */
const ID_KIND: [RegExp, Kind[]][] = [
  [/^zakazky\./, ["job"]],
  [/^obchody\./, ["deal"]],
  [/^ukoly\.note\./, ["note"]],
  [/^ukoly\./, ["task"]],
  [/^finance\.(payment|split)\./, ["payment", "job"]],
  [/^kontakty\.person\./, ["person"]],
  [/^(kontakty|klienti)\./, ["company", "person"]],
  [/^hodiny\./, ["job", "task"]],
];

type Shape = Record<
  string,
  { _zod?: { def?: { type?: string; innerType?: unknown; element?: unknown } } }
>;
const shapeOf = (cmd: CommandDef): Shape | null => {
  const s = cmd.input as unknown as { shape?: Shape };
  return s.shape ?? null;
};
/** Prázdná odpověď = jen struktura: nuly, prázdné řetězce a pole, případně zpětně vypsané ID ze vstupu a letopočet. */
function emptyish(v: unknown, input: Record<string, unknown>): boolean {
  const echoed = new Set(Object.values(input).flat().map(String));
  const walk = (x: unknown, key = ""): boolean => {
    if (x == null || x === false || x === 0 || x === "") return true;
    if (typeof x === "string") return echoed.has(x);
    if (typeof x === "number") return key === "year";
    if (Array.isArray(x)) return x.every((y) => walk(y, key));
    if (typeof x === "object") return Object.entries(x).every(([k, y]) => walk(y, k));
    return false;
  };
  return walk(v);
}

type Outcome = "rejected" | "empty" | "crash" | "leak" | "wrote-or-returned";
const results: { name: string; input: string; outcome: Outcome; detail?: string }[] = [];
const sweep = new Map<string, number>();

describe("hádání ID soukromých záznamů přes příkazy modulů (partner)", () => {
  it("žádný příkaz nevrátí partnerovi soukromá data ani nezmění soukromý záznam", async () => {
    const ids = privateIds(fx, rich);
    const byKind: Record<Kind, string[]> = {
      company: ids.companies,
      person: ids.persons,
      job: ids.jobs,
      deal: ids.deals,
      task: ids.tasks,
      note: ids.notes,
      payment: ids.payments,
    };
    let tried = 0;
    let skipped = 0;
    for (const [name, cmd] of f.collected.commands) {
      try {
        assertCommandPermission(partner, cmd);
      } catch {
        continue; // brána příkazů partnera odmítne (kryje security-matrix)
      }
      const shape = shapeOf(cmd);
      if (!shape) {
        skipped++;
        continue;
      }
      const candidates: Record<string, unknown>[] = [];
      const idKinds = ID_KIND.find(([re]) => re.test(name))?.[1] ?? (Object.keys(byKind) as Kind[]);
      const keys = Object.keys(shape);
      const kindKeys = keys.filter((k) => KEY_KIND[k]);
      const hasId = keys.includes("id") || keys.includes("ids");
      if (!hasId && !kindKeys.length) {
        skipped++;
        continue;
      }
      const base = (kind?: Kind, idv?: string) => {
        const input: Record<string, unknown> = {};
        for (const k of kindKeys) {
          const kk = KEY_KIND[k]!;
          input[k] = (kind === kk ? [idv] : byKind[kk])[0 + (kind === kk ? 0 : 0)] ?? byKind[kk][0];
          if (kind === kk) input[k] = idv;
        }
        return input;
      };
      if (hasId)
        for (const kind of idKinds)
          for (const idv of byKind[kind]) {
            const input = base();
            if (keys.includes("id")) input.id = idv;
            if (keys.includes("ids")) input.ids = [idv];
            candidates.push(input);
          }
      else
        for (const k of kindKeys) {
          const kind = KEY_KIND[k]!;
          for (const idv of byKind[kind]) candidates.push({ ...base(), [k]: idv });
        }
      for (const input of candidates) {
        // ostatní povinná pole neznáme: bez nich vstup neprojde validací a příkaz se nespustí (počítá se jako přeskočený)
        const parsed = cmd.input.safeParse(input);
        if (!parsed.success) {
          skipped++;
          break;
        }
        tried++;
        const r = await savepoint(async (tx) => {
          try {
            const v = await cmd.handler({ ...partner, db: tx }, parsed.data, deps);
            return { ok: true as const, v };
          } catch (e) {
            return { ok: false as const, e: e as Error };
          }
        });
        let outcome: Outcome;
        let detail: string | undefined;
        if (!r.ok) {
          const e = r.e;
          outcome =
            e instanceof PermissionError || e instanceof NotFoundError || e instanceof UserError
              ? "rejected"
              : "crash";
          detail = `${e.name}: ${e.message.slice(0, 100)}`;
        } else if (hasCanary(r.v)) {
          outcome = "leak";
          detail = serialize(r.v).slice(0, 200);
        } else {
          const text = serialize(r.v);
          outcome = emptyish(r.v, input) ? "empty" : "wrote-or-returned";
          detail = text.slice(0, 700);
        }
        results.push({ name, input: JSON.stringify(input), outcome, detail });
        sweep.set(name, (sweep.get(name) ?? 0) + 1);
      }
    }
    console.info(
      `QA-SEC sweep: ${sweep.size} příkazů, ${tried} volání, ${skipped} přeskočeno (vstup se nedal složit z ID)`,
    );
    expect(tried, "sweep má nad čím běžet").toBeGreaterThan(30);
    expect(skipped).toBeGreaterThanOrEqual(0);
    const leaks = results.filter((r) => r.outcome === "leak");
    expect(leaks, "příkazy, které prozradily soukromá data").toEqual([]);
  });

  it("příkazy, které na soukromé ID odpověděly „úspěchem“ s daty, jsou ve schváleném seznamu (jinak jde o únik)", () => {
    const ok = results.filter((r) => r.outcome === "wrote-or-returned");
    const unexpected = ok.filter((r) => !APPROVED.some((re) => re.test(r.name)));
    expect(
      unexpected.map((r) => `${r.name} ${r.input} → ${r.detail}`),
      "příkaz vrátil/provedl něco pro cizí soukromé ID",
    ).toEqual([]);
  });

  it("žádný příkaz nespadl neošetřenou chybou při hádání ID", () => {
    const crashes = results.filter((r) => r.outcome === "crash");
    expect(crashes.map((r) => `${r.name} ${r.input} → ${r.detail}`)).toEqual([]);
  });
});

/**
 * Příkazy, které na neexistující/soukromé ID legitimně vrací neprázdný výsledek bez soukromých dat (např. prázdný
 * objekt s pevnou strukturou, nastavení, ARES). Každá výjimka má vzor názvu; nový příkaz s nečekaným výsledkem
 * test shodí a musí být posouzen.
 */
const APPROVED: RegExp[] = [
  /^finance\.client\.overview$/, // vrací jen SDÍLENÉ platby sdílených zakázek pod soukromou firmou (R-31: firma nekaskáduje); NÁLEZ nízké závažnosti, viz ZADOSTI (FIN-B: NotFound pro neviditelnou firmu)
  /^ukoly\.type\.reorder$/, // pořadí číselníku typů úkolů: nejde o záznamy se zámkem, ID jiného druhu se ignorují
];
