"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import {
  OFFLINE_DATA_CACHE,
  OFFLINE_DATA_KEY,
  isPersistableKey,
  parseSnapshot,
  serializeSnapshot,
  type SavedQuery,
} from "./offline";

/** Je zařízení připojené? Na serveru a při prvním vykreslení „ano“ (bez bliknutí), pak se opraví. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const read = () => setOnline(navigator.onLine);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);
  return online;
}

/**
 * Nad spodní lištou ukáže „jste offline, jen ke čtení“, zapíše `data-offline` na `<html>` (CSS pak zablokuje odesílací
 * tlačítka), registruje service worker (jen v ostrém provozu) a drží kopii posledních načtených dat v mezipaměti
 * prohlížeče. Po otevření bez spojení se tato data vrátí do paměti dotazů, takže jdou číst. Zápisy se nefrontují.
 */
export function OfflineBridge({ userId, pathname }: { userId: string; pathname: string }) {
  const online = useOnline();
  const client = useQueryClient();

  useEffect(() => {
    document.documentElement.dataset.offline = online ? "false" : "true";
    return () => {
      delete document.documentElement.dataset.offline;
    };
  }, [online]);

  // service worker: jen v ostrém provozu (ve vývoji by kešoval nehašované části a bránil HMR)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  // navštívená stránka se uloží i jako dokument (klientská navigace stahuje jen RSC data), aby šla otevřít bez spojení;
  // jen když už service worker řídí stránku a ne častěji než jednou za 10 minut
  useEffect(() => {
    if (
      !online ||
      typeof navigator.serviceWorker === "undefined" ||
      !navigator.serviceWorker.controller
    )
      return;
    const t = setTimeout(() => {
      const k = `opsys.warm.${pathname}`;
      try {
        if (Date.now() - Number(sessionStorage.getItem(k) ?? 0) < 10 * 60_000) return;
        sessionStorage.setItem(k, String(Date.now()));
      } catch {
        /* bez úložiště se stránka uloží při každé návštěvě */
      }
      void fetch(`${pathname}${window.location.search}`, {
        credentials: "same-origin",
        headers: { accept: "text/html" },
      }).catch(() => undefined);
    }, 2500);
    return () => clearTimeout(t);
  }, [online, pathname]);

  // otevřeno bez spojení: vrátit poslední uložená data
  useEffect(() => {
    if (navigator.onLine || typeof caches === "undefined") return;
    let cancelled = false;
    void (async () => {
      try {
        const cache = await caches.open(OFFLINE_DATA_CACHE);
        const res = await cache.match(OFFLINE_DATA_KEY);
        const saved = parseSnapshot(res ? await res.text() : null, userId, Date.now());
        if (cancelled) return;
        for (const q of saved) {
          if (client.getQueryData(q.key as QueryKey) === undefined)
            client.setQueryData(q.key as QueryKey, q.data, { updatedAt: q.updatedAt });
        }
      } catch {
        /* bez uložených dat se ukáže prázdná obrazovka s hlášením */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, userId]);

  // online: průběžně ukládat poslední načtená data (se zpožděním, ať se nezapisuje při každém dotazu)
  useEffect(() => {
    if (typeof caches === "undefined" || !online) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      const queries: SavedQuery[] = client
        .getQueryCache()
        .getAll()
        .filter((q) => q.state.status === "success" && isPersistableKey(q.queryKey))
        .map((q) => ({ key: q.queryKey, data: q.state.data, updatedAt: q.state.dataUpdatedAt }));
      if (queries.length === 0) return;
      const body = serializeSnapshot(userId, queries, Date.now());
      void caches
        .open(OFFLINE_DATA_CACHE)
        .then((c) =>
          c.put(
            OFFLINE_DATA_KEY,
            new Response(body, { headers: { "content-type": "application/json" } }),
          ),
        )
        .catch(() => undefined);
    };
    const schedule = () => {
      if (!timer) timer = setTimeout(flush, 5000);
    };
    const unsub = client.getQueryCache().subscribe(schedule);
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    schedule();
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onHide);
      if (timer) clearTimeout(timer);
    };
  }, [client, online, userId]);

  if (online) return null;
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="flex shrink-0 items-center gap-2 border-t border-line bg-warning-soft px-3 py-2 text-sm text-warning"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>
        <strong>Bez spojení — jen ke čtení.</strong> Vidíte naposledy načtená data; změny se teď
        neuloží.
      </span>
    </div>
  );
}
