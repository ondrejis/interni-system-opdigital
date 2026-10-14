"use client";

import { useEffect, useRef, useState } from "react";

/** Šířka, kterou graf předpokládá na serveru a v prostředí bez ResizeObserveru. */
export const CHART_FALLBACK_WIDTH = 600;

/**
 * Šířka prvku sledovaná přes ResizeObserver. Vrací `[ref, šířka]`; ref patří na kontejner grafu.
 * Na serveru, při prvním vykreslení a bez ResizeObserveru je to `fallback` (600 px), takže SSR se shoduje s hydratací.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(
  fallback = CHART_FALLBACK_WIDTH,
) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      // Skrytý kontejner (šířka 0) nechá poslední známou šířku.
      if (w > 0) setWidth(w);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Dotyková obrazovka telefonu: popisky os se zvětší stejně jako ostatní text (zadání 7.10). */
export const COARSE_PHONE_QUERY = "(max-width: 768px) and (pointer: coarse)";
