import type { Probe } from "./shared";

/** Vstupy příkazů: modul „obchody“. Každý příkaz modulu potřebuje záznam (`obchody.<akce>`: `P(() => ({…}), true)`). */
export const obchodyProbes: Record<string, Probe> = {};
