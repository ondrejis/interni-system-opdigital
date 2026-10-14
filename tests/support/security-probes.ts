import type { Fixture } from "./security-fixture";
import { dochazkaProbes } from "./probes/dochazka";
import { kalendarProbes } from "./probes/kalendar";
import { kontaktyProbes } from "./probes/kontakty";
import { poptavkyProbes } from "./probes/poptavky";
import { zakazkyProbes } from "./probes/zakazky";

export type ProbeEnv = { f: Fixture; job: Fixture["jobA"]; otherUserId: string };

/**
 * Vstupy příkazů pro matici oprávnění. Každý probe dostane zakázku (vlastní, nebo cizí) a vrátí platný vstup příkazu.
 * Příkaz, který tu chybí, test shodí (nový příkaz se musí zařadit do souboru svého modulu v `probes/`).
 * `global: true` = příkaz se zakázkou nesouvisí, cizí varianta se netestuje.
 */
export type Probe = {
  input: (e: ProbeEnv) => unknown;
  /** Příkaz nesouvisí s konkrétní zakázkou (cizí varianta se nezkouší). */
  global?: true;
  /** Vstup míří na záznam cizího člověka (B): externista A ho nesmí číst ani měnit. */
  foreignOwned?: true;
};

/** Probes složené po modulech: odstranění modulu = smazání jeho souboru v `probes/` a jednoho řádku zde. */
export const PROBES: Record<string, Probe> = {
  ...kontaktyProbes,
  ...zakazkyProbes,
  ...poptavkyProbes,
  ...dochazkaProbes,
  ...kalendarProbes,
};
