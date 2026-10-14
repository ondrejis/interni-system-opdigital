import type { Probe } from "./shared";

/** Vstupy příkazů: modul „zakazky“. Každý příkaz modulu potřebuje záznam (`zakazky.<akce>`: `P(job)`). */
export const zakazkyProbes: Record<string, Probe> = {};
