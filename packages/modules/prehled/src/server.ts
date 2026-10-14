import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";

/** Serverová část modulu „prehled“. */
export const server = defineModuleServer({ entities, commands });
