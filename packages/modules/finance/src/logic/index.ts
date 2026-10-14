/*
  Oblast „logic“ modulu „finance“ — ČISTÁ doménová logika financí, bez databáze a bez Reactu (FIN-A). Nic odtud neimportuje
  ze `../schema`; FIN-B mapuje řádky z DB na tyto typy a volá funkce, FIN-C je používá v UI (náhled rozdělení, formát částek).

  Přehled (podrobnosti a rozhodnutí jsou v hlavičkách souborů):
  - `allocate.ts`  — `allocate`, `allocateJob`, `manualAllocation`, `validateSplitRules`, `effectiveSplitRules`, …
  - `preview.ts`   — `previewSplit` (živý náhled „Z platby 10 000 Kč dostane Ondřej 6 000 Kč, Patrik 4 000 Kč.“)
  - `balance.ts`   — `balance` (saldo, rozpis po měsících), `format.ts` — `describeBalance`, `dativeOf`
  - `retainer.ts`  — `retainerSchedule`, `retainerEndImpact`, `retainerLabel`
  - `overdue.ts`   — `isOverdue`, `paymentDueState`, `countOverdue`, `summarizePayments`
  - `money.ts` / `dates.ts` — haléře, formát částky, měsíce a data jako řetězce (bez časových pásem)

  Zásady: peníze jsou celá čísla v haléřích (žádná plovoucí čárka), data `YYYY-MM-DD`, měsíce `YYYY-MM`, „dnešek“ se vždy
  předává zvenku (`today`), výpočty jsou deterministické. Neplatný vstup vyhodí `FinanceLogicError`.
*/
export * from "./allocate";
export * from "./balance";
export * from "./dates";
export * from "./format";
export * from "./money";
export * from "./overdue";
export * from "./preview";
export * from "./retainer";
export * from "./types";
