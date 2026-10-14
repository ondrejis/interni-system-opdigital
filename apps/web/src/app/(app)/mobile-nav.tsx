"use client";

import { BottomNav, PhotoDialog, usePendingUploads, type BottomItem } from "@rebar/ui";
import { useState } from "react";
import type { ShellData } from "@/server/shell";

/**
 * Spodní navigace pro práci v terénu (jen na telefonu): Dnes, nejdůležitější moduly podle oprávnění, Foto a Více.
 * Co uživatel nesmí nebo co není zapnuté, se nezobrazí.
 */
export function bottomItems(shell: Pick<ShellData, "enabledModules" | "permissions">) {
  const has = (m: string) => shell.enabledModules.includes(m);
  const can = (...k: string[]) => k.some((x) => shell.permissions.includes(x));
  const middle: { id: string; label: string; icon: string; href: string }[] = [];
  if (has("dochazka") && can("dochazka.own", "dochazka.read"))
    middle.push({ id: "time", label: "Docházka", icon: "clock", href: "/dochazka" });
  if (has("zakazky") && can("zakazky.read"))
    middle.push({ id: "jobs", label: "Zakázky", icon: "briefcase", href: "/zakazky" });
  if (has("sklad") && can("sklad.issue", "sklad.read"))
    middle.push({ id: "stock", label: "Sklad", icon: "package", href: "/sklad" });
  if (has("stroje") && can("stroje.log", "stroje.read"))
    middle.push({ id: "fleet", label: "Stroje", icon: "truck", href: "/stroje" });
  const photo = has("zakazky") && can("zakazky.read");
  return { middle: middle.slice(0, photo ? 2 : 3), photo };
}

export function MobileBottomNav({
  shell,
  pathname,
  openMenu,
}: {
  shell: Pick<ShellData, "enabledModules" | "permissions">;
  pathname: string;
  openMenu: () => void;
}) {
  const [photos, setPhotos] = useState(false);
  const pending = usePendingUploads();
  const { middle, photo } = bottomItems(shell);
  const items: BottomItem[] = [
    { id: "today", label: "Dnes", icon: "house", href: "/" },
    ...middle,
    ...(photo
      ? [
          {
            id: "photo",
            label: "Foto",
            icon: "camera",
            onSelect: () => setPhotos(true),
            badge: pending,
          },
        ]
      : []),
    { id: "more", label: "Více", icon: "more", onSelect: openMenu },
  ];
  return (
    <>
      <BottomNav items={items} pathname={pathname} />
      {photo && <PhotoDialog open={photos} onOpenChange={setPhotos} />}
    </>
  );
}
