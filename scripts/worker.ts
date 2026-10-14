import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectPermissions, resolveModules, type ClientConfig } from "@rebar/core";
import { createDb } from "@rebar/core/db";
import { LocalDiskStorage } from "@rebar/core/files";
import {
  coreJobs,
  createQueueClient,
  dispatchJob,
  registerWorkers,
  type CoreJobDeps,
} from "@rebar/core/jobs";
import { setDomainEvents } from "@rebar/core/events";
import { createModuleDeps, type ModuleJobDeps } from "@rebar/core/module-server";
import { queueNotificationMail, smtpTransport, type MailTransport } from "@rebar/core/mail";
import {
  EmailNotConfiguredError,
  NOTIFY_CHANNEL,
  collectNotificationEvents,
  configureNotifications,
} from "@rebar/core/notifications";
import { captureError, initErrorTracking } from "@rebar/core/observability";
import { createWebPushSender } from "@rebar/core/push";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import {
  brandingSetting,
  createSettings,
  resolveBranding,
  smtpSetting,
} from "@rebar/core/settings";
import { loadEnv } from "../apps/web/src/server/env";
import { buildRegistry, collectServers } from "../apps/web/src/server/modules-server";
import { ALL_MODULES } from "../apps/web/src/modules";

/**
 * Worker: zpracovává úlohy na pozadí (e-maily, náhledy fotek, úklid, heartbeat). Běží jako samostatný proces
 * téže instalace; fronta je v Postgresu. Lokálně `pnpm worker`.
 */
const slug = process.env.CLIENT ?? "opsys";
const root = path.resolve(import.meta.dirname, "..");
const config = (
  (await import(pathToFileURL(path.join(root, "clients", slug, "config.ts")).href)) as {
    default: ClientConfig;
  }
).default;

const env = loadEnv();
initErrorTracking({ dsn: env.SENTRY_DSN, release: env.APP_VERSION, environment: env.NODE_ENV });
const { db, sql: pg, close } = createDb(env.DATABASE_URL, { max: 5 });
const cipher = createCipher(parseKeyRing(env));
const settings = createSettings(cipher);

/**
 * Bez nastaveného SMTP se e-mail nikam neodesílá. Ve vývoji se vypíše do konzole (včetně odkazu); v provozu se do logu
 * nikdy nedostane obsah (odkaz na obnovu hesla nebo pozvánka je tajemství), jen příjemce a předmět.
 */
const devTransport: MailTransport = {
  async send(m) {
    const body = env.NODE_ENV === "production" ? "" : `\n${m.text}\n`;
    console.log(`[mail:dev] Komu: ${m.to}\n[mail:dev] Předmět: ${m.subject}${body}`);
  },
};

const queue = createQueueClient({
  connectionString: env.DATABASE_URL,
  supervise: true,
  schedule: true,
});
queue.boss.on("error", (err) => captureError(err, { where: "pg-boss" }));

// katalog upozornění zapnutých modulů a pravidla klienta (stejné jako ve webu; upozornění vznikají i v úlohách workeru)
const modules = resolveModules(config.modules, ALL_MODULES);
configureNotifications({
  events: collectNotificationEvents(modules),
  config: config.notifications,
  timezone: config.locale.timezone,
});

const deps: CoreJobDeps = {
  db,
  cipher,
  storage: new LocalDiskStorage(env.FILES_DIR),
  instance: config.slug,
  version: env.APP_VERSION,
  dataDir: path.resolve(env.FILES_DIR),
  backupStatusFile: env.BACKUP_STATUS_FILE,
  heartbeatUrl: env.HEARTBEAT_URL,
  push:
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? await createWebPushSender({
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
          subject: env.VAPID_SUBJECT ?? `mailto:info@${new URL(env.APP_URL).hostname}`,
        })
      : null,
  /** E-mail s upozorněním: bez nastaveného SMTP se doručení přeskočí (ne opakuje). */
  async notifyEmail(mail) {
    const smtp = await settings.get(db, smtpSetting);
    if (!(smtp.enabled && smtp.host) && env.NODE_ENV === "production")
      throw new EmailNotConfiguredError();
    await queueNotificationMail({ db, queue, cipher, baseURL: env.APP_URL }, mail);
  },
  brand: async () => resolveBranding(config.branding, await settings.get(db, brandingSetting)).name,
  async resolveTransport() {
    const smtp = await settings.get(db, smtpSetting);
    if (smtp.enabled && smtp.host)
      return { transport: smtpTransport(smtp), from: smtp.from || smtp.user };
    return env.NODE_ENV === "production"
      ? null
      : { transport: devTransport, from: "vyvoj@localhost" };
  },
};

await queue.start();
// dřívější odesílač push (jednou za minutu) nahradil `notification.dispatch`
await queue.boss.unschedule("push.deliver").catch(() => {});
await registerWorkers(queue, coreJobs, deps);

/**
 * Upozornění se odesílají hned po potvrzení transakce, která je vytvořila: databáze pošle NOTIFY, worker po krátkém
 * sloučení (víc upozornění naráz = jedno spuštění) zařadí odeslání do fronty. Minutový plán je záloha pro případ
 * výpadku spojení nebo restartu.
 */
let kick: NodeJS.Timeout | undefined;
const wake = () => {
  kick ??= setTimeout(() => {
    kick = undefined;
    queue.send(dispatchJob, {}).catch((err) => captureError(err, { where: "notification.kick" }));
  }, 1500);
};
const listener = await pg.listen(NOTIFY_CHANNEL, wake, wake);

// úlohy zapnutých modulů (připomínky, uzávěrky…) běží s právy systému a mají k dispozici registr entit
const collected = collectServers(modules);
const registry = buildRegistry(collected.entities);
// služby a doménové události stejně jako ve webu (úlohy volají služby ostatních modulů a vysílají události)
const fullDeps = createModuleDeps(
  {
    registry,
    queue,
    storage: deps.storage,
    settings,
    cipher,
    baseURL: env.APP_URL,
    emit: async () => {},
    calendarLayers: collected.calendarLayers,
  },
  collected,
);
setDomainEvents(collected.eventHandlers, () => fullDeps);
const moduleDeps: ModuleJobDeps = {
  db,
  registry,
  queue,
  settings,
  cipher,
  baseURL: env.APP_URL,
  services: fullDeps.services,
};
await registerWorkers(queue, collected.jobs, moduleDeps);
// exporty (na pozadí, plány, úklid souborů) běží s právy uživatele, který export zadal (ne systému); úlohy čtou `deps.exports`
deps.exports = {
  db,
  registry: moduleDeps.registry,
  storage: deps.storage,
  catalog: new Set(collectPermissions(modules).map((p) => p.key)),
  settings,
  queue,
  cipher,
  baseURL: env.APP_URL,
  config: config.exports,
  brand: deps.brand,
};
console.log(
  `[worker] push: ${deps.push ? "zapnuto" : "vypnuto (chybí VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)"}`,
);
console.log(
  `[worker] klient „${config.slug}“, úlohy: ${[...coreJobs, ...collected.jobs].map((j) => j.name).join(", ")}`,
);

async function shutdown() {
  console.log("[worker] ukončuji…");
  if (kick) clearTimeout(kick);
  await listener.unlisten().catch(() => {});
  await queue.stop().catch(() => {});
  await close().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
