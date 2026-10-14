/**
 * Odkaz na schvalování (oblast approvals). Importuje se přímo z `../approvals/api`, ne přes `index.ts` modulu,
 * aby soubory oblasti nevytvářely kruh přes `server.ts`.
 */
import * as approvalsApi from "../approvals/api";

export { approvalsApi };
