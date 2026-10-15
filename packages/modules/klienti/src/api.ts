/*
  Veřejné funkce modulu „klienti“ pro jiné moduly (`@rebar/klienti/api`; smí je importovat jen modul, který má „klienti“
  v `dependsOn`) a pro testy. Moduly Klienty běžně nevolají napřímo: stav a služby mění přes službu `clients`
  (`deps.services.optional("clients")`, `@rebar/core/contracts`) a kartu klienta skládají z příspěvků `clientCard`.
*/
export {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  SERVICES,
  SERVICE_LABELS,
  planStatusChange,
  hiddenTabs,
  groupClients,
} from "./shared";
export type { ClientGroupBy, ClientState, StatusPlan } from "./shared";
export type {
  ClientRow,
  ClientListResult,
  ClientCardSummary,
  ClientContextDto,
  ClientTabsResult,
} from "./contract";

/** Adresa karty klienta (detail organizace, KLI: karta klienta je detail `company`). */
export const clientUrl = (companyId: string): string => `/kontakty/firmy/${companyId}`;
