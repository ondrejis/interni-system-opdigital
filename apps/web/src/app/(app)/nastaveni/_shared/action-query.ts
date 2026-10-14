import type { ActionResult } from "@rebar/core/actions";

/** Výsledek server action pro React Query: úspěch vrátí data, chyba se vyhodí s českou hláškou ze serveru. */
export async function unwrap<T>(result: Promise<ActionResult<T>>): Promise<T> {
  const r = await result;
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
