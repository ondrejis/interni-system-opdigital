import { defineModuleServer, mergeServers } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { area as hosting } from "./hosting";
import { area as domains } from "./domains";
import { area as library } from "./library";
import { area as invoices } from "./invoices";
import { area as privateOverview } from "./private";

/** Serverová část modulu „muj-prostor“: společné entity a příkazy plus oblasti. */
export const server = mergeServers(
  defineModuleServer({ entities, commands }),
  hosting,
  domains,
  library,
  invoices,
  privateOverview,
);

export {
  recurringServiceEntity,
  webDomainEntity,
  emailLibraryItemEntity,
  recurringInvoiceEntity,
  entities,
} from "./entities";
export { emailLibraryItem, recurringInvoice, recurringService, webDomain } from "./schema";
