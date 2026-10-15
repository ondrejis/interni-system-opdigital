"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { startRealtimeClient } from "./client";

/**
 * Připojí prohlížeč na `/api/realtime` a při změně u druhého uživatele zneplatní dotazy dotčených entit
 * (`["entity", <klíč>]`), příkazové dotazy modulů (`["command", …]`), koš a historii. Změna je vidět do 2 s bez
 * obnovení stránky. `onChange` slouží k obnově serverově vykreslených stránek (např. `router.refresh()`).
 */
export function RealtimeBridge({
  url = "/api/realtime",
  onChange,
}: {
  url?: string;
  /** Zavolá se (sloučeně) po každé dávce změn. */
  onChange?: () => void;
}) {
  const qc = useQueryClient();
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(
    () =>
      startRealtimeClient({
        url,
        invalidate: (entities) => {
          for (const e of entities) void qc.invalidateQueries({ queryKey: ["entity", e] });
          void qc.invalidateQueries({ queryKey: ["command"] });
          void qc.invalidateQueries({ queryKey: ["trash"] });
          void qc.invalidateQueries({ queryKey: ["history"] });
          void qc.invalidateQueries({ queryKey: ["palette"] });
          cb.current?.();
        },
        invalidateAll: () => {
          void qc.invalidateQueries();
          cb.current?.();
        },
      }),
    [qc, url],
  );
  return null;
}
