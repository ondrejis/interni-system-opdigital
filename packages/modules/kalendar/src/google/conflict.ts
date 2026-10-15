/*
  Konflikt synchronizace: stejná událost se změnila v OPSYS (čeká ve frontě zápisu) i v Googlu. Vyhrává novější změna
  (KAL-10). Čistá funkce bez databáze.
*/

/** Kdo vyhrává: `remote` = přijmout změnu z Googlu a zahodit čekající zápis, `local` = zachovat změnu z OPSYS. */
export type Winner = "remote" | "local";

/**
 * `localQueuedAt` = kdy vznikla čekající změna v OPSYS (`null` = žádná nečeká), `remoteUpdatedAt` = `updated` události
 * v Googlu (`null` = neznámo). Bez čekající místní změny vyhrává vzdálená; při shodě času vyhrává místní (právě
 * zapsaný stav nemá být přepsán vlastním ozvěnou).
 */
export function resolveConflict(input: {
  localQueuedAt: Date | null;
  remoteUpdatedAt: Date | null;
}): Winner {
  if (!input.localQueuedAt) return "remote";
  if (!input.remoteUpdatedAt) return "local";
  return input.remoteUpdatedAt.getTime() > input.localQueuedAt.getTime() ? "remote" : "local";
}
