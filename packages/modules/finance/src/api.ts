/*
  Veřejné funkce modulu „finance“ pro jiné moduly (`@rebar/finance/api`; smí je importovat jen modul, který má „finance“
  v `dependsOn`; dnes žádný). Moduly se k financím normálně dostanou přes službu `finance` (`deps.services.optional`),
  tady jsou totéž jako funkce a typy kontraktu příkazů.
*/
export type {
  BalanceView,
  ClientFinanceOverview,
  JobFinanceOverview,
  PaymentRow,
  People,
  PersonRef,
  RetainerView,
} from "./contract";
export { createFinanceService as financeService } from "./service";
