import {
  resolveModules,
  type ClientConfig,
  type ClientExtension,
  type ModuleManifest,
} from "@rebar/core";
import { collectPermissions } from "@rebar/core";
import { validateTerminalSetup } from "@rebar/core/terminal";
import { collectNotificationEvents, configureNotifications } from "@rebar/core/notifications";
import config from "@client/config";
import { extensions } from "@client/extensions";
import { ALL_MODULES } from "@/modules";

export type Runtime = {
  config: ClientConfig;
  modules: ModuleManifest[];
  extensions: ClientExtension[];
};

let cached: Runtime | undefined;

/**
 * Sestaví běhové prostředí klienta a při chybě vyhodí srozumitelnou výjimku.
 * Volá se při startu serveru (`instrumentation.ts`), takže špatná konfigurace
 * aplikaci vůbec nenastartuje.
 */
export function getRuntime(): Runtime {
  if (cached) return cached;

  const requested = process.env.CLIENT;
  if (requested && requested !== config.slug) {
    throw new Error(
      `Tato aplikace byla sestavena pro klienta „${config.slug}“, ale proměnná CLIENT je „${requested}“. ` +
        `Image se staví zvlášť pro každého klienta.`,
    );
  }

  const modules = resolveModules(config.modules, ALL_MODULES);
  const terminalProblems = validateTerminalSetup(
    config.terminal,
    ALL_MODULES,
    new Set(collectPermissions(ALL_MODULES).map((p) => p.key)),
  );
  if (terminalProblems.length)
    throw new Error(`Neplatná sestava terminálu:\n - ${terminalProblems.join("\n - ")}`);
  const ids = new Set<string>();
  for (const ext of extensions) {
    if (ids.has(ext.id))
      throw new Error(`Rozšíření „${ext.id}“ je v klientovi „${config.slug}“ dvakrát.`);
    ids.add(ext.id);
  }
  // katalog upozornění ověříme při startu: překlep v klíči události v konfiguraci klienta nesmí být objeven až za provozu
  configureNotifications({
    events: collectNotificationEvents(modules),
    config: config.notifications,
    timezone: config.locale.timezone,
  });
  cached = { config, modules, extensions };
  return cached;
}
