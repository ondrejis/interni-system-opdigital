import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import { clientLifecycle } from "./lifecycle";
import { privatePaths } from "./private-paths";
import { services } from "./service";

export { clientLifecycle, emitClientChanges, clientSnap } from "./lifecycle";
export { setClientStatus, addClientServices } from "./service";
export { clientSummary, clientTabs, listClients, saveContext, setServices } from "./data";

/**
 * Serverová část modulu „klienti“: příkazy `klienti.*`, služba `clients` (stav a služby klienta pro Obchody a
 * Zakázky) a rozšíření entity `company` o pravidla stavů a události `client.*` (Disk na ně reaguje). Modul nemá
 * vlastní tabulky ani entity: klient je organizace se `client_status`.
 */
export const server = defineModuleServer({
  entities: [clientLifecycle],
  commands,
  services,
  privatePaths,
});
