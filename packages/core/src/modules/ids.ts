/**
 * Identifikátory modulů. Jediný zdroj pravdy — konfigurace klienta se validuje proti tomuto seznamu.
 * Pořadí = pořadí závislostí = pořadí migrací (hard závislost vždy dřív než její konzument); hlídá ho test.
 */
export const MODULE_IDS = [
  "kontakty",
  "klienti",
  "disk",
  "zakazky",
  "obchody",
  "ukoly",
  "kalendar",
  "hodiny",
  "finance",
  "reklama",
  "sablony-emailu",
  "muj-prostor",
  "prehled",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];
