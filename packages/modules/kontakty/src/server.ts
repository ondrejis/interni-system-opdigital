import { defineModuleServer } from "@rebar/core/module-server";
import { contactCommands } from "./commands";
import {
  clientCardProvider,
  companyEmailVars,
  personEmailVars,
  privatePaths,
} from "./contributions";
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
export { normalizeEmail, normalizeIco, normalizePhone, matchContactDuplicates } from "./duplicates";
export type { ContactQuery, MatchedBy } from "./duplicates";
export { setAresClient } from "./ares";
export { mergeContacts, previewMerge, planMerge, discoverReferences } from "./merge";

/**
 * Serverová část modulu „kontakty“: entity `company` a `person`, příkazy (hledání, ARES, duplicity, rychlé založení,
 * kontaktní údaje, sloučení) a příspěvky pro ostatní moduly (karta klienta, proměnné e-mailů).
 */
export const server = defineModuleServer({
  entities,
  deleteBlockers,
  commands: contactCommands,
  contributions: {
    clientCard: [clientCardProvider],
    emailVars: [companyEmailVars, personEmailVars],
  },
  privatePaths,
});
