"use client";

import { useCallback, useEffect, useState, type KeyboardEvent, type RefObject } from "react";

/**
 * Společné ovládání prvků grafu (kategorie, body, výřezy): hover, focus a šipky.
 * Do tabulátoru patří jen jeden prvek (roving tabindex), mezi ostatními se chodí šipkami, Home a End.
 * Na dotyku tooltip nezmizí s prstem; zavře se klepnutím mimo graf.
 */
export function useChartCursor(count: number, containerRef: RefObject<HTMLElement | null>) {
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (hover === null) return;
    const close = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setHover(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [hover, containerRef]);

  const move = useCallback(
    (e: KeyboardEvent<Element>, i: number) => {
      let next: number;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(count - 1, i + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, i - 1);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = count - 1;
      else if (e.key === "Escape") {
        setHover(null);
        (e.currentTarget as HTMLElement).blur();
        return;
      } else return;
      e.preventDefault();
      const svg = (e.currentTarget as SVGElement).ownerSVGElement;
      svg?.querySelector<SVGElement>(`[data-hit="${next}"]`)?.focus();
    },
    [count],
  );

  const active = hover ?? focus;
  const tabIndex = Math.min(tab, Math.max(0, count - 1));

  /** Vlastnosti pro hit prvek kategorie `i`. */
  const hitProps = (i: number) => ({
    "data-hit": i,
    tabIndex: i === tabIndex ? 0 : -1,
    onFocus: () => {
      setFocus(i);
      setTab(i);
    },
    onBlur: () => setFocus((f) => (f === i ? null : f)),
    onPointerEnter: () => setHover(i),
    onPointerMove: () => setHover((h) => (h === i ? h : i)),
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") setHover(null);
    },
    onKeyDown: (e: KeyboardEvent<Element>) => move(e, i),
  });

  return { active: active !== null && active < count ? active : null, setHover, hitProps };
}
