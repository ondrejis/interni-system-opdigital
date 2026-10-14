/** Identifikátory modulů. Jediný zdroj pravdy — konfigurace klienta se validuje proti tomuto seznamu. */
export const MODULE_IDS = ["kontakty", "zakazky", "poptavky", "dochazka", "kalendar"] as const;

export type ModuleId = (typeof MODULE_IDS)[number];
