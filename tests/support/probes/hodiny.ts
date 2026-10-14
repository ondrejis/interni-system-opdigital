import type { Probe } from "./shared";

/** Vstupy příkazů: modul „hodiny“. Každý příkaz modulu potřebuje záznam (`hodiny.<akce>`: `P(() => ({…}), true)`). */
export const hodinyProbes: Record<string, Probe> = {};
