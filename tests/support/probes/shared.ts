import type { Fixture } from "../security-fixture";

export const WEEK = "2026-09-14";
export const NONE = "00000000-0000-4000-8000-000000000000";

/**
 * Prostředí, ve kterém se probe vyhodnotí: sestava (`ids` záznamů), zakázka, na které se právě zkouší, a druhý člověk.
 * Do doby, než QA-SEC postaví novou sestavu, se probes jen kontrolují na úplnost (každý příkaz má probe).
 */
export type ProbeEnv = {
  f: Pick<Fixture, "ids">;
  job: { id: string };
  otherUserId: string;
};

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

/** Vstup příkazu s `jobId` zakázky, na které se probe právě zkouší. */
export const job = (e: ProbeEnv) => ({ jobId: e.job.id });
/** Probe: `global` = příkaz se zakázkou nesouvisí, cizí varianta se nezkouší. */
export const P = (input: (e: ProbeEnv) => unknown, global?: true): Probe => ({
  input,
  ...(global ? { global } : {}),
});
/** Probe se vstupem na záznam cizího člověka (B). */
export const F = (input: (e: ProbeEnv) => unknown): Probe => ({
  input,
  global: true,
  foreignOwned: true,
});
