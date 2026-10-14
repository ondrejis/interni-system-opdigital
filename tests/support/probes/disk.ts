import type { Probe } from "./shared";

/** Vstupy příkazů: modul „disk“. Každý příkaz modulu potřebuje záznam (`disk.<akce>`: `P(() => ({…}), true)`). */
export const diskProbes: Record<string, Probe> = {};
