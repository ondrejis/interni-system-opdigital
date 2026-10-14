import type { ModuleServer } from "@rebar/core/module-server";
import { attention, commands } from "./commands";
import { registerStatementHandler } from "./service";

registerStatementHandler();

/**
 * Oblast „statements“ modulu Zakázky (ADR 015): Soupisy provedených prací za období.
 * Do této složky píše jen její vlastník; ostatní oblasti volají jen to, co odsud exportuje `api.ts`.
 */
export const area: ModuleServer = { commands, attention: [attention] };
