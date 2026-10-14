import type { Probe } from "./shared";

/** Vstupy příkazů: modul „sablony-emailu“. Každý příkaz modulu potřebuje záznam (`sablony-emailu.<akce>`: `P(() => ({…}), true)`). */
export const sablonyEmailuProbes: Record<string, Probe> = {};
