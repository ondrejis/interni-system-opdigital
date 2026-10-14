import { defineModuleServer } from "@rebar/core/module-server";
import { contactCommands } from "./commands";
import { deleteBlockers, entities } from "./entities";

export {
  companyEntity,
  personEntity,
  entities,
  COMPANY_TYPE_LOOKUP,
  PERSON_ROLE_LOOKUP,
  POINT_TYPE_LOOKUP,
  TAG_LOOKUP,
} from "./entities";
export { company, person, personContactPoint } from "./schema";
export * as kontaktyApi from "./api";

export const server = defineModuleServer({ entities, deleteBlockers, commands: contactCommands });
