import type { ModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import { orderEntity } from "./entity";
import { registerOrderApproval } from "./service";

// schvalování objednávek: výsledek rozhodnutí zapíše stav a zámek (handler se registruje při sestavení modulu)
registerOrderApproval();

/**
 * Oblast „orders“ modulu Zakázky (ADR 015): Objednávky zakázky dodavatelům.
 * Do této složky píše jen její vlastník; ostatní oblasti volají jen to, co odsud exportuje `api.ts`.
 */
export const area: ModuleServer = {
  entities: [orderEntity],
  commands,
};

export { orderEntity };
