import path from "node:path";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";
import { SystemAdmin } from "./system-admin";
import { loadSystemStatus } from "./system-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Systém" };

/**
 * Nastavení → Systém (jen vlastník): stav systému (zdraví, heartbeat, verze), zálohy a zkouška obnovy, velikost databáze,
 * fronty úloh, chyby integrací a chybná doručení webhooků, odkaz do Koše. Žádné e-maily ani upozornění: stav se čte,
 * když stránku někdo otevře.
 */
export default async function Page() {
  const ctx = await requireCan("settings.manage");
  const { env, cipher } = getServices();
  const status = await loadSystemStatus(ctx, {
    cipher,
    dataDir: path.resolve(env.FILES_DIR),
    version: env.APP_VERSION,
    backupStatusFile: env.BACKUP_STATUS_FILE,
    heartbeatUrl: env.HEARTBEAT_URL,
  });
  return <SystemAdmin status={status} />;
}
