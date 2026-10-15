"use client";

import { useEffect } from "react";

/**
 * Výška viditelné části okna (bez klávesnice) jako CSS proměnná `--vvh`. iOS Safari při otevřené klávesnici
 * nezmenšuje `100dvh`, takže celoobrazovkové Hledat by schovalo seznam pod klávesnici; styly používají
 * `height: var(--vvh, 100dvh)`.
 */
export function useVisualViewportVar(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    set();
    vv.addEventListener("resize", set);
    return () => {
      vv.removeEventListener("resize", set);
      root.style.removeProperty("--vvh");
    };
  }, []);
}
