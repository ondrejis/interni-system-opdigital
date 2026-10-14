"use client";

import { errorToast, useCommandMutation } from "@rebar/ui";
import { useCallback } from "react";

/**
 * Spuštění příkazu s českou chybou v toastu. `run` vrací výsledek, nebo `null`, když příkaz selhal
 * (chyba je už ohlášená). `attempt` chybu neohlašuje, vrací ji volajícímu (např. do bubliny u buňky).
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
  const attempt = useCallback(
    async (input: I): Promise<{ data: O } | { error: string }> => {
      try {
        return { data: await mutateAsync(input) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Akce se nepovedla." };
      }
    },
    [mutateAsync],
  );
  return { run, attempt, pending: m.isPending };
}
