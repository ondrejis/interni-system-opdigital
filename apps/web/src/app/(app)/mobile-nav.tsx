"use client";

import { BottomNav, type BottomItem } from "@rebar/ui";
import type { ShellData } from "@/server/shell";

/**
 * Spodní navigace na telefonu: Dnes, položky modulů označené v manifestu `bottom: true` (už vyfiltrované podle
 * oprávnění a zapnutých modulů) a Více. Aplikace nezná konkrétní moduly.
 */
export function bottomItems(shell: Pick<ShellData, "bottom">): BottomItem[] {
  return shell.bottom.map((n) => ({ id: n.href, label: n.label, icon: n.icon, href: n.href }));
}

export function MobileBottomNav({
  shell,
  pathname,
  openMenu,
}: {
  shell: Pick<ShellData, "bottom">;
  pathname: string;
  openMenu: () => void;
}) {
  const items: BottomItem[] = [
    { id: "today", label: "Dnes", icon: "house", href: "/" },
    ...bottomItems(shell),
    { id: "more", label: "Více", icon: "more", onSelect: openMenu },
  ];
  return <BottomNav items={items} pathname={pathname} />;
}
