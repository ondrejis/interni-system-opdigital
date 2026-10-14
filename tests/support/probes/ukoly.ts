import type { Probe } from "./shared";

/** Vstupy příkazů: modul „ukoly“. Každý příkaz modulu potřebuje záznam (`ukoly.<akce>`: `P(() => ({…}), true)`). */
export const ukolyProbes: Record<string, Probe> = {};
