import { inArray } from "drizzle-orm";
import { schema, type Executor } from "@rebar/core/db";
import { UserError } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { FinanceLogicError } from "../logic";
import type { People, PersonRef } from "../contract";

/** Dnešní datum v české zóně (`YYYY-MM-DD`). */
export const today = (): string => todayIso();
/** Aktuální měsíc v české zóně (`YYYY-MM`). */
export const thisMonth = (): string => todayIso().slice(0, 7);

/** Časové razítko jako ISO řetězec, nebo `null`. */
export const isoOf = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Číslo z hodnoty databáze (bigint v módu `number`, součet jako řetězec). */
export const num = (v: unknown): number => Number(v ?? 0);

/** Křestní jméno z celého jména (do vět „Z platby … dostane Ondřej …“). */
export const firstNameOf = (name: string): string => name.trim().split(/\s+/)[0] || name;

/** Seznam bez duplicit a prázdných hodnot. */
export const uniq = <T>(xs: Iterable<T | null | undefined>): T[] => [
  ...new Set([...xs].filter((x): x is T => x !== null && x !== undefined)),
];

/** Lidé podle id (jméno, křestní jméno, zkratka); neexistující se vynechají. */
export async function loadPeople(
  db: Executor,
  ids: Iterable<string | null | undefined>,
): Promise<People> {
  const list = uniq(ids);
  if (!list.length) return {};
  const rows = await db
    .select({ id: schema.user.id, name: schema.user.name, shortName: schema.user.shortName })
    .from(schema.user)
    .where(inArray(schema.user.id, list));
  const out: People = {};
  for (const r of rows) {
    const ref: PersonRef = {
      id: r.id,
      name: r.name,
      firstName: firstNameOf(r.name),
      shortName: r.shortName ?? null,
    };
    out[r.id] = ref;
  }
  return out;
}

/** Ověří, že všichni uvedení uživatelé existují a jsou aktivní (jinak `UserError`); vrací jejich popisky. */
export async function assertUsers(
  db: Executor,
  ids: Iterable<string | null | undefined>,
  what = "Osoba",
): Promise<People> {
  const list = uniq(ids);
  if (!list.length) return {};
  const rows = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      shortName: schema.user.shortName,
      active: schema.user.active,
    })
    .from(schema.user)
    .where(inArray(schema.user.id, list));
  const found = new Map(rows.map((r) => [r.id, r]));
  for (const id of list) {
    const r = found.get(id);
    if (!r) throw new UserError(`${what} neexistuje.`);
    if (!r.active) throw new UserError(`${what} „${r.name}“ je deaktivovaná.`);
  }
  return Object.fromEntries(
    rows.map((r) => [
      r.id,
      { id: r.id, name: r.name, firstName: firstNameOf(r.name), shortName: r.shortName ?? null },
    ]),
  );
}

/** Převede chybu čisté logiky financí na `UserError` s českou zprávou (ostatní chyby projdou beze změny). */
export async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof FinanceLogicError) throw new UserError(e.message);
    throw e;
  }
}
