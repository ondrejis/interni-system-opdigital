import type { Probe, ProbeEnv } from "../security-probes";

export const WEEK = "2026-09-14";
export const NONE = "00000000-0000-4000-8000-000000000000";

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
