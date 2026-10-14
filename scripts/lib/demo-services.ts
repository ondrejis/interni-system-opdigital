import path from "node:path";
import { collectPermissions, resolveModules, type ClientConfig } from "@rebar/core";
import { createAuth } from "@rebar/core/auth";
import { createDb } from "@rebar/core/db";
import { LocalDiskStorage } from "@rebar/core/files";
import type { ModuleDeps } from "@rebar/core/module-server";
import { collectNotificationEvents, configureNotifications } from "@rebar/core/notifications";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
import type { DemoServices } from "../../clients/demo/seed/kit";
import { ALL_MODULES } from "../../apps/web/src/modules";
import { buildRegistry, collectServers } from "../../apps/web/src/server/modules-server";

export type DemoServiceOptions = {
  config: ClientConfig;
  databaseUrl: string;
  appUrl: string;
  authSecret: string;
  encryption: { APP_ENCRYPTION_KEY?: string | undefined; APP_ENCRYPTION_KEYS?: string | undefined };
  filesDir: string;
};

/**
 * Služby pro demo seed: stejné moduly, registr entit a příkazy jako v běžící aplikaci, ale bez fronty úloh
 * (e-maily a push se při seedu neodesílají) a bez rozšíření klienta.
 */
export function createDemoServices(o: DemoServiceOptions) {
  const handle = createDb(o.databaseUrl, { max: 4 });
  const modules = resolveModules(o.config.modules, ALL_MODULES);
  configureNotifications({
    events: collectNotificationEvents(modules),
    config: o.config.notifications,
    timezone: o.config.locale.timezone,
  });
  const collected = collectServers(modules);
  const registry = buildRegistry(collected.entities);
  const cipher = createCipher(parseKeyRing(o.encryption));
  const settings = createSettings(cipher);
  const storage = new LocalDiskStorage(path.resolve(o.filesDir));
  const auth = createAuth({
    db: handle.db,
    baseURL: o.appUrl,
    secret: o.authSecret,
    appName: o.config.branding.name,
    idleTimeoutMinutes: o.config.security.idleTimeoutMinutes,
    mailer: { send: async () => {} },
  });
  const deps: ModuleDeps = {
    registry,
    queue: { send: async () => null } as unknown as ModuleDeps["queue"],
    storage,
    settings,
    cipher,
    baseURL: o.appUrl,
    emit: async () => {},
    costProviders: collected.costProviders,
    calendarLayers: collected.calendarLayers,
    diaryPrefill: collected.diaryPrefill,
  };
  const services: DemoServices = {
    db: handle.db,
    config: o.config,
    modules,
    registry,
    deps,
    commands: collected.commands,
    catalog: new Set(collectPermissions(modules).map((p) => p.key)),
    auth,
    settings,
    ensure: collected.ensure,
  };
  return { services, collected, close: handle.close };
}
