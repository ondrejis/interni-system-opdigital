import type { ModuleServer } from "@rebar/core/module-server";
import { attention, commands } from "./commands";
import { registerChangeHandler } from "./service";

registerChangeHandler();

/**
 * Oblast „changes“ modulu Zakázky (ADR 015): Změny během výstavby (ZBV): řádky, schválení, propsání do rozpočtu.
 * Do této složky píše jen její vlastník; ostatní oblasti volají jen to, co odsud exportuje `api.ts`.
 */
export const area: ModuleServer = { commands, attention: [attention] };
