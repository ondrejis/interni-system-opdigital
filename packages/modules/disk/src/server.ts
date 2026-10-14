import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";

/** Serverová část modulu „disk“. */
export const server = defineModuleServer({ entities, commands });

export { driveFolder, driveRequest } from "./schema";
