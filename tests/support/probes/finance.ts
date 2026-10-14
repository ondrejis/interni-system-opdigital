import type { Probe } from "./shared";

/** Vstupy příkazů: modul „finance“. Každý příkaz modulu potřebuje záznam (`finance.<akce>`: `P(() => ({…}), true)`). */
export const financeProbes: Record<string, Probe> = {};
