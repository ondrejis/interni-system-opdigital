"use client";

import { BottomNav, type BottomItem } from "@rebar/ui";
import type { ShellData } from "@/server/shell";

/**
 * Spodní navigace na telefonu: Hledat (otevře paletu), položky modulů označené v manifestu `bottom: true` (už
 * vyfiltrované podle oprávnění a zapnutých modulů; v OPSYS Klienti, Obchody, Úkoly) a Více. Aplikace nezná
 * konkrétní moduly.
 */
export function bottomItems(shell: Pick<ShellData, "bottom">): BottomItem[] {
  return shell.bottom.map((n) => ({ id: n.href, label: n.label, icon: n.icon, href: n.href }));
}

export function MobileBottomNav({
  shell,
  pathname,
  openMenu,
  openSearch,
}: {
  shell: Pick<ShellData, "bottom">;
  pathname: string;
  openMenu: () => void;
  openSearch: () => void;
}) {
  const items: BottomItem[] = [
    { id: "search", label: "Hledat", icon: "search", onSelect: openSearch },
    ...bottomItems(shell),
    { id: "more", label: "Více", icon: "more", onSelect: openMenu },
  ];
  return <BottomNav items={items} pathname={pathname} />;
}
