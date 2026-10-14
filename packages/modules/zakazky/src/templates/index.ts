import type { ModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";

/** Oblast „templates“ modulu Zakázky (ADR 015): šablony zakázek: úkoly a role týmu. */
export const area: ModuleServer = { commands };
