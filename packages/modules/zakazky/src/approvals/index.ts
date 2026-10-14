import type { ModuleServer } from "@rebar/core/module-server";
import { attention, commands } from "./commands";

/**
 * Oblast „approvals“ modulu Zakázky (ADR 015): Schvalování s limitem částky a zamykání dokladů.
 * Do této složky píše jen její vlastník; ostatní oblasti volají jen to, co odsud exportuje `api.ts`.
 */
export const area: ModuleServer = { commands, attention: [attention] };
