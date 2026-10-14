"use client";

import { errorToast, useCommandMutation } from "@rebar/ui";
import { useCallback } from "react";

/**
 * Spuštění příkazu s českou chybou v toastu. `run` vrací výsledek, nebo `null`, když příkaz selhal
 * (chyba je už ohlášená).
 */
export function useCmd<I extends Record<string, unknown>, O = unknown>(name: string) {
  const m = useCommandMutation<I, O>(name);
  const { mutateAsync } = m;
  const run = useCallback(
    async (input: I): Promise<O | null> => {
      try {
        return await mutateAsync(input);
      } catch (e) {
        errorToast(e instanceof Error ? e.message : "Akce se nepovedla.");
        return null;
      }
    },
    [mutateAsync],
  );
  return { run, pending: m.isPending };
}

/** České skloňování podle počtu: 1 úkol, 2–4 úkoly, 5 úkolů. */
export const plural = (n: number, one: string, few: string, many: string) =>
  `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
