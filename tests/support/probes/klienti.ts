import type { Probe } from "./shared";

/** Vstupy příkazů: modul „klienti“. Každý příkaz modulu potřebuje záznam (`klienti.<akce>`: `P(() => ({…}), true)`). */
export const klientiProbes: Record<string, Probe> = {};
