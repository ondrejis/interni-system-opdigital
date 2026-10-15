import { NotImplementedError, type ServiceMap } from "@rebar/core/contracts";
import type { ModuleDeps } from "@rebar/core/module-server";

/**
 * Služba `finance` pro ostatní moduly (D §2.3): zakázky (`initJobFinance`, `unpaidCount`), klienti (`incomeSince`),
 * hodiny (`allocatedByUser`), můj prostor (`createStandalonePayment`). M1: stub, těla doplní FIN-B.
 */
export function createFinanceService(_deps: ModuleDeps): ServiceMap["finance"] {
  return {
    initJobFinance: async () => {
      throw new NotImplementedError("finance.service.initJobFinance");
    },
    defaultSplit: async () => {
      throw new NotImplementedError("finance.service.defaultSplit");
    },
    createStandalonePayment: async () => {
      throw new NotImplementedError("finance.service.createStandalonePayment");
    },
    incomeSince: async () => {
      throw new NotImplementedError("finance.service.incomeSince");
    },
    unpaidCount: async () => {
      throw new NotImplementedError("finance.service.unpaidCount");
    },
    allocatedByUser: async () => {
      throw new NotImplementedError("finance.service.allocatedByUser");
    },
  };
}
