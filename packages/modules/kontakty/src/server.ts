import { defineModuleServer } from "@rebar/core/module-server";
import { contactCommands } from "./commands";
import { deleteBlockers, entities } from "./entities";

export { companyEntity, personEntity, entities, TAG_LOOKUP } from "./entities";
export {
  aresCache,
  company,
  person,
  personCompany,
  personContactPoint,
  CLIENT_STATUSES,
  SERVICE_TYPES,
} from "./schema";
export * as kontaktyApi from "./api";
export { normalizeEmail, normalizeIco, normalizePhone } from "./duplicates";
export type { ContactQuery, MatchedBy } from "./duplicates";

/** Serverová část modulu „kontakty“: entity `company` a `person` a příkazy (KON je rozšíří). */
export const server = defineModuleServer({ entities, deleteBlockers, commands: contactCommands });
