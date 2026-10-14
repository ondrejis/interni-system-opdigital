"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Sazba DPH z Nastavení; `rateBp` v setinách procenta (21 % = 2100). */
export type VatChoice = { code: string; label: string; rateBp: number };
export type VatRates = { rates: VatChoice[]; defaultBp: number };

/** Záloha, když aplikace sazby nedodá (testy, samostatné použití UI): sazby v ČR od roku 2024. */
const FALLBACK: VatRates = {
  rates: [
    { code: "standard", label: "Základní 21 %", rateBp: 2100 },
    { code: "reduced", label: "Snížená 12 %", rateBp: 1200 },
    { code: "zero", label: "Nulová 0 %", rateBp: 0 },
  ],
  defaultBp: 2100,
};

const Ctx = createContext<VatRates>(FALLBACK);

/** Aplikace dodá sazby DPH platné dnes (z Nastavení); moduly je nabízejí u položek dokladů a rozpočtu. */
export function VatRatesProvider({ value, children }: { value: VatRates; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useVatRates = (): VatRates => useContext(Ctx);

/**
 * Sazby (v setinách procenta) k nabídnutí ve výběru, od nejvyšší. K nabízeným se přidají `extra`
 * (sazby, které už doklad obsahuje, i když dnes neplatí), aby se hodnota řádku neztratila.
 */
export function vatBpChoices(vat: VatRates, extra: readonly number[] = []): number[] {
  return [...new Set([...vat.rates.map((r) => r.rateBp), ...extra])].sort((a, b) => b - a);
}
