/*
  Služba `finance` pro ostatní moduly (D §2.3): zakázky (`initJobFinance`, `unpaidCount`), klienti (`incomeSince`),
  hodiny (`allocatedByUser`), můj prostor (`createStandalonePayment`). Implementace je v `data/finance-service.ts`.
*/
export { createFinanceService } from "./data/finance-service";
