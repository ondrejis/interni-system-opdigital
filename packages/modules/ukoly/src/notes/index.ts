import { defineModuleServer } from "@rebar/core/module-server";
import { noteCommands } from "./commands";
import { noteClientCard, notePrivatePaths } from "./providers";

/**
 * Serverová oblast „notes“ modulu „ukoly“ (UKO-11): příkazy `ukoly.note.*`, příspěvek ke kartě klienta (počet poznámek)
 * a čtecí cesty pro test soukromí. Entitu `note` definuje `entity.ts`; službu `tasks.createPrivateNote` skládá `service.ts`
 * modulu z `./service`. Zapojuje ji `server.ts` přes `mergeServers`.
 */
export const area = defineModuleServer({
  commands: noteCommands,
  contributions: { clientCard: [noteClientCard] },
  privatePaths: notePrivatePaths,
});

export { createPrivateNote } from "./service";
