import { defineModuleServer } from "@rebar/core/module-server";
import { privateCommands } from "./commands";
import { loadPrivateOverview } from "./data";

/**
 * Serverová oblast „private“ modulu „muj-prostor“ (SOUK-01): přehled soukromých záznamů a zakládání samostatných
 * soukromých poznámek. Čtecí cesta pro test soukromí vrací pro aktéra bez `private.read` prázdný přehled.
 */
export const area = defineModuleServer({
  commands: privateCommands,
  privatePaths: [
    { name: "muj-prostor.private.overview", run: (ctx, deps) => loadPrivateOverview(ctx, deps) },
  ],
});
