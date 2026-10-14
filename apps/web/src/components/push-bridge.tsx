"use client";

import { useNav } from "@rebar/ui";
import { useEffect } from "react";

/**
 * Spojka mezi service workerem a stránkou: ťuknutí na push otevře cílovou stránku v už otevřeném okně bez načtení
 * znovu (rozepsaná práce se nezahodí). Stránka odpoví na zprávu; bez odpovědi se okno přesměruje samo.
 * Je-li povolení k upozorněním udělené, zaregistruje se i service worker, aby se po aktualizaci aplikace aktualizoval.
 */
export function PushBridge() {
  const nav = useNav();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: unknown } | null;
      if (data?.type !== "notification-open") return;
      const url = data.url;
      if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return;
      nav.push(url);
      e.ports[0]?.postMessage("ok");
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    if ("Notification" in window && Notification.permission === "granted")
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [nav]);
  return null;
}
