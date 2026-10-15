import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import { clientCardProvider } from "./contributions";
import { entities } from "./entities";
import { eventHandlers } from "./handlers";
import { driveIngest } from "./ingest";
import { jobs } from "./jobs";
import { privatePaths } from "./private-paths";
import { services } from "./service";

/**
 * Serverová část modulu „disk“: příkazy (`disk.*`), služba `disk`, příspěvek ke kartě klienta, obsluha událostí
 * `client.*`, `project.created` a `visibility.changed`, příchozí zdroj `drive` (callback z n8n) a úloha `disk.timeout`.
 */
export const server = defineModuleServer({
  entities,
  commands,
  services,
  contributions: { clientCard: [clientCardProvider] },
  eventHandlers,
  ingests: [driveIngest],
  jobs,
  privatePaths,
});

export { driveFolder, driveRequest } from "./schema";
export { driveIngest, handleDriveCallback } from "./ingest";
export { eventHandlers as diskEventHandlers } from "./handlers";
export { maintainRequests } from "./jobs";
export { folderInfo, requestFolder, retryFolder } from "./service";
