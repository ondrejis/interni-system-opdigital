import type { Probe } from "./shared";

/** Vstupy příkazů: modul „kalendar“. Každý příkaz modulu potřebuje záznam (`kalendar.<akce>`: `P(() => ({…}), true)`). */
export const kalendarProbes: Record<string, Probe> = {};
