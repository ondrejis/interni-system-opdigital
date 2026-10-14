"use client";

import { useEffect } from "react";

const KEY = "recent-records";
export type RecentRecord = { href: string; title: string; label: string };

export function readRecent(): RecentRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentRecord[];
  } catch {
    return [];
  }
}

/** Zapamatuje si otevřený záznam pro „Nedávné“ v paletě (jen v prohlížeči daného uživatele). */
export function TrackRecent({ href, title, label }: RecentRecord) {
  useEffect(() => {
    try {
      const next = [{ href, title, label }, ...readRecent().filter((r) => r.href !== href)].slice(
        0,
        8,
      );
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* bez uložení */
    }
  }, [href, title, label]);
  return null;
}
