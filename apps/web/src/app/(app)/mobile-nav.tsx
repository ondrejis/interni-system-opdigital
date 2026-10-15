"use client";

import {
  BottomNav,
  OfflineBridge,
  shouldOpenStartSearch,
  useVisualViewportVar,
  type BottomItem,
} from "@rebar/ui";
import { useEffect } from "react";
import type { ShellData } from "@/server/shell";

/**
 * Spodní navigace na telefonu: Hledat (otevře paletu), položky modulů označené v manifestu `bottom: true` (už
 * vyfiltrované podle oprávnění a zapnutých modulů; v OPSYS Klienti, Obchody, Úkoly) a Více. Aplikace nezná
 * konkrétní moduly.
 */
export function bottomItems(shell: Pick<ShellData, "bottom">): BottomItem[] {
  return shell.bottom.map((n) => ({ id: n.href, label: n.label, icon: n.icon, href: n.href }));
}

const START_KEY = "opsys.mobile.start";

export function MobileBottomNav({
  shell,
  pathname,
  openMenu,
  openSearch,
  userId,
}: {
  shell: Pick<ShellData, "bottom">;
  pathname: string;
  openMenu: () => void;
  openSearch: () => void;
  userId: string;
}) {
  useVisualViewportVar();

  // MOB-01: po otevření aplikace na telefonu se ukáže Hledat s posledními záznamy a klávesnicí (jednou za spuštění)
  useEffect(() => {
    let started = false;
    try {
      started = sessionStorage.getItem(START_KEY) === "1";
    } catch {
      /* bez úložiště se otevře při každém načtení úvodní stránky */
    }
    const phone =
      window.matchMedia("(max-width: 767px)").matches &&
      window.matchMedia("(pointer: coarse)").matches;
    const suppressed = new URLSearchParams(window.location.search).has("bez-hledani");
    if (!shouldOpenStartSearch({ pathname, phone, alreadyStarted: started, suppressed })) return;
    try {
      sessionStorage.setItem(START_KEY, "1");
    } catch {
      /* viz výše */
    }
    openSearch();
    // jen první vykreslení; později se Hledat otevírá tlačítkem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items: BottomItem[] = [
    { id: "search", label: "Hledat", icon: "search", onSelect: openSearch },
    ...bottomItems(shell),
    { id: "more", label: "Více", icon: "more", onSelect: openMenu },
  ];
  return (
    <>
      <OfflineBridge userId={userId} />
      <BottomNav items={items} pathname={pathname} />
    </>
  );
}
