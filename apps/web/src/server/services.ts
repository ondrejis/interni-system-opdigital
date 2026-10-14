import "server-only";
import { createAuth } from "@rebar/core/auth";
import { collectPermissions } from "@rebar/core";
import { createDb } from "@rebar/core/db";
import { LocalDiskStorage } from "@rebar/core/files";
import { createQueueClient } from "@rebar/core/jobs";
import { createQueuedMailer } from "@rebar/core/mail";
import { captureError, initErrorTracking } from "@rebar/core/observability";
import { brandingSetting, createSettings, resolveBranding } from "@rebar/core/settings";
import type { ExportRuntime } from "@rebar/core/export";
import { collectNotificationEvents, configureNotifications } from "@rebar/core/notifications";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { setDomainEvents } from "@rebar/core/events";
import {
  createEventEmitter,
  createModuleDeps,
  setEventEmitter,
  type ModuleDeps,
} from "@rebar/core/module-server";
import { getRuntime } from "./bootstrap";
import { buildRegistry, collectServers } from "./modules-server";
import { loadEnv } from "./env";

/**
 * Služby aplikace (databáze, autentizace, úložiště souborů, fronta…) vytvořené jednou na proces.
 * Konfigurace prostředí se ověřuje při prvním použití — chyba = srozumitelný výpis, ne záhadný pád.
 */
function build() {
  const env = loadEnv();
  const runtime = getRuntime();
  initErrorTracking({ dsn: env.SENTRY_DSN, release: env.APP_VERSION, environment: env.NODE_ENV });

  const dbh = createDb(env.DATABASE_URL, { max: 10 });
  const cipher = createCipher(parseKeyRing(env));
  const settings = createSettings(cipher);
  const storage = new LocalDiskStorage(env.FILES_DIR);

  const queue = createQueueClient({ connectionString: env.DATABASE_URL });
  let started: Promise<void> | undefined;
  const queueReady = () => (started ??= queue.start());
  const readyQueue: typeof queue = {
    ...queue,
    send: async (job, data, options) => (await queueReady(), queue.send(job, data, options)),
  };

  configureNotifications({
    events: collectNotificationEvents(runtime.modules),
    config: runtime.config.notifications,
    timezone: runtime.config.locale.timezone,
  });
  const collected = collectServers(runtime.modules);
  const registry = buildRegistry(collected.entities);
  const catalog = new Set(collectPermissions(runtime.modules).map((p) => p.key));

  const getBranding = async () =>
    resolveBranding(runtime.config.branding, await settings.get(dbh.db, brandingSetting));
  const brand = async () => (await getBranding()).name;

  const mailer = createQueuedMailer({ db: dbh.db, queue: readyQueue, cipher, brand });
  const auth = createAuth({
    db: dbh.db,
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    appName: runtime.config.branding.name,
    idleTimeoutMinutes: runtime.config.security.idleTimeoutMinutes,
    mailer,
  });

  const emit: ModuleDeps["emit"] = createEventEmitter(runtime.extensions, (err, where) =>
    captureError(err, { where }),
  );
  setEventEmitter(emit);
  const moduleDeps: ModuleDeps = createModuleDeps(
    {
      registry,
      queue: readyQueue,
      storage,
      settings,
      cipher,
      baseURL: env.APP_URL,
      emit,
      calendarLayers: collected.calendarLayers,
    },
    collected,
  );
  setDomainEvents(collected.eventHandlers, () => moduleDeps);

  const exportRuntime: ExportRuntime = {
    db: dbh.db,
    registry,
    storage,
    catalog,
    settings,
    queue: readyQueue,
    cipher,
    baseURL: env.APP_URL,
    config: runtime.config.exports,
    brand,
  };

  /** Veřejný klíč VAPID pro prohlížeč (bez něj se push nenabízí). Odesílá výhradně worker; web push nikdy neodesílá. */
  const vapidPublicKey =
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : null;

  return {
    env,
    runtime,
    vapidPublicKey,
    collected,
    moduleDeps,
    exportRuntime,
    db: dbh.db,
    dbh,
    cipher,
    settings,
    storage,
    queue: readyQueue,
    catalog,
    registry,
    getBranding,
    mailer,
    auth,
  };
}

export type Services = ReturnType<typeof build>;

const g = globalThis as unknown as { __appServices?: Services };

export function getServices(): Services {
  return (g.__appServices ??= build());
}
