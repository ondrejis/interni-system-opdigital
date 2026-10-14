import { kontaktyProbes } from "./kontakty";
import { klientiProbes } from "./klienti";
import { diskProbes } from "./disk";
import { zakazkyProbes } from "./zakazky";
import { obchodyProbes } from "./obchody";
import { ukolyProbes } from "./ukoly";
import { kalendarProbes } from "./kalendar";
import { hodinyProbes } from "./hodiny";
import { financeProbes } from "./finance";
import { reklamaProbes } from "./reklama";
import { sablonyEmailuProbes } from "./sablony-emailu";
import { mujProstorProbes } from "./muj-prostor";
import { prehledProbes } from "./prehled";

import type { Probe } from "./shared";

export type { Probe, ProbeEnv } from "./shared";

/** Probes složené po modulech (v pořadí `MODULE_IDS`): nový modul = jeden soubor v `probes/` a dva řádky zde. */
export const PROBES: Record<string, Probe> = {
  ...kontaktyProbes,
  ...klientiProbes,
  ...diskProbes,
  ...zakazkyProbes,
  ...obchodyProbes,
  ...ukolyProbes,
  ...kalendarProbes,
  ...hodinyProbes,
  ...financeProbes,
  ...reklamaProbes,
  ...sablonyEmailuProbes,
  ...mujProstorProbes,
  ...prehledProbes,
};
