"use client";

import { useEffect, useRef } from "react";
import type { ClientTabId } from "@rebar/core/contracts";

/**
 * Skryje záložky karty klienta bez dat (KLI-07, ORG-08). Hostitel (detail záznamu) zatím nemá způsob, jak záložku skrýt
 * podle dat z příkazu (`RecordTab.visible` vidí jen řádek), proto je tlačítko záložky (Radix `-trigger-<id>`) schované
 * v DOM; záložka, na které uživatel právě stojí, se nikdy neskrývá. Žádost o podporu v jádru je v ZADOSTI.
 */
export function applyTabVisibility(root: ParentNode, hidden: readonly string[]): void {
  const hide = new Set(hidden);
  for (const el of root.querySelectorAll<HTMLElement>('[role="tab"]')) {
    const m = /-trigger-(.+)$/.exec(el.id);
    const key = m?.[1];
    if (!key) continue;
    const active = el.getAttribute("data-state") === "active";
    el.style.display = hide.has(key) && !active ? "none" : "";
  }
}

/** Neviditelná komponenta v hlavičce karty: po každé změně DOM hostitele znovu použije skrytí záložek. */
export function HideEmptyTabs({ hidden }: { hidden: readonly string[] }) {
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = anchor.current?.closest<HTMLElement>('[data-testid="record-view"]');
    if (!root) return;
    const run = () => applyTabVisibility(root, hidden);
    run();
    const mo = new MutationObserver(run);
    mo.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "id"],
    });
    return () => {
      mo.disconnect();
      applyTabVisibility(root, []);
    };
  }, [hidden]);
  return <span ref={anchor} hidden data-testid="hide-empty-tabs" data-hidden={hidden.join(",")} />;
}
/** Id záložek karty klienta, které se skryjí. */
export type HiddenTabs = readonly ClientTabId[];
