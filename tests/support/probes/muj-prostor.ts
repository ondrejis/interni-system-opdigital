import type { Probe } from "./shared";

/** Vstupy příkazů: modul „muj-prostor“. Každý příkaz modulu potřebuje záznam (`muj-prostor.<akce>`: `P(() => ({…}), true)`). */
export const mujProstorProbes: Record<string, Probe> = {};
