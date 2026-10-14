import type { Probe } from "./shared";

/** Vstupy příkazů: modul „prehled“. Každý příkaz modulu potřebuje záznam (`prehled.<akce>`: `P(() => ({…}), true)`). */
export const prehledProbes: Record<string, Probe> = {};
