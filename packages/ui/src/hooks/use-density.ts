"use client";

import { useEffect, useState } from "react";

export type Density = "comfortable" | "compact";

/** Výška řádku tabulky podle hustoty (NAS-05): pohodlná 36 px, kompaktní 28 px. */
export const ROW_HEIGHTS: Record<Density, number> = { comfortable: 36, compact: 28 };

export function densityOf(value: string | null | undefined): Density {
  return value === "compact" ? "compact" : "comfortable";
}

/**
 * Aktuální hustota řádků: čte `data-density` na `<html>` (nastaví ji `themeScript` při načtení a Nastavení → Vzhled
 * při změně) a sleduje jeho změny, takže se tabulka přepočítá hned po přepnutí.
 */
export function useDensity(): Density {
  const [density, setDensity] = useState<Density>("comfortable");
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDensity(densityOf(root.getAttribute("data-density")));
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ["data-density"] });
    return () => mo.disconnect();
  }, []);
  return density;
}
