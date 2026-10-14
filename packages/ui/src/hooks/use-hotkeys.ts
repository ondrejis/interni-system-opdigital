"use client";

import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    el.closest("[role=combobox],[role=dialog] input") !== null
  );
};

/**
 * Globální klávesové zkratky. Klíče: `mod+k` (Cmd na Macu, Ctrl jinde), `?`, `c`, dvoutlačítkové sekvence `g z`
 * (do 900 ms po sobě). Jednoznakové zkratky se při psaní do pole nespouští; `mod+…` a `Escape` fungují vždy.
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const mod = e.metaKey || e.ctrlKey;
      const name = mod ? `mod+${key}` : key;
      const handlers = ref.current;
      if (mod || key === "Escape") {
        const h = handlers[name];
        if (h) {
          e.preventDefault();
          h(e);
        }
        return;
      }
      if (e.altKey || isTyping(e.target)) return;
      if (pending) {
        const seq = `${pending} ${key}`;
        pending = null;
        clearTimeout(timer);
        const h = handlers[seq];
        if (h) {
          e.preventDefault();
          h(e);
          return;
        }
      }
      if (Object.keys(handlers).some((k) => k.startsWith(`${key} `))) {
        pending = key;
        timer = setTimeout(() => (pending = null), 900);
        return;
      }
      const h = handlers[name];
      if (h) {
        e.preventDefault();
        h(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [enabled]);
}

export const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = () => (isMac() ? "⌘" : "Ctrl");
