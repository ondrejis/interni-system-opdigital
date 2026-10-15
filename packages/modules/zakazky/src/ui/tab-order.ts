/**
 * Pořadí záložek detailu zakázky v liště (spec: Úkoly, Finance, Hodiny, Poznámky, Obchod, Reklama, Historie). Záložky
 * jiných modulů (`recordTabs.job`) mají použít tato čísla v `order`, aby lišta měla stejné pořadí bez ohledu na moduly.
 */
export const JOB_TAB_ORDER = {
  ukoly: 10,
  finance: 20,
  hodiny: 30,
  poznamky: 40,
  obchod: 50,
  reklama: 60,
  historie: 700,
} as const;
