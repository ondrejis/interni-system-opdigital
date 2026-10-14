import type { Probe } from "./shared";

/** Vstupy příkazů: modul „reklama“. Každý příkaz modulu potřebuje záznam (`reklama.<akce>`: `P(() => ({…}), true)`). */
export const reklamaProbes: Record<string, Probe> = {};
