"use client";

import type { ActionResult } from "@rebar/core/actions";
import { errorToast, successToast } from "@rebar/ui";

/** Spustí server action; chybu ukáže jako oznámení. Vrací výsledek, nebo `undefined`, když akce selhala. */
export async function runAction<T>(
  action: Promise<ActionResult<T>>,
  success?: string,
): Promise<{ data: T } | undefined> {
  const r = await action;
  if (!r.ok) {
    errorToast(r.error);
    return undefined;
  }
  if (success) successToast(success);
  return { data: r.data };
}
