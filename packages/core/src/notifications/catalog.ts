import { DEFAULT_QUIET_HOURS, notificationsConfigSchema, type NotificationsConfig } from "./config";
import type { AnyEventDef } from "./types";
import { defineNotificationEvent, EVENT_KEY } from "./types";
import { validateRule } from "./validate";

/*
  Katalog událostí: události jádra (komentáře) plus události zapnutých modulů z manifestů.
  Registr je na `globalThis`, protože Next.js bundluje route handlery a server actions zvlášť a každý by jinak
  měl vlastní prázdnou kopii.
*/

/** Události platformy. Moduly přidávají své přes `notifications` v manifestu (OPSYS žádné nemá, viz `clients/opsys/config.ts`). */
export const COMMENT_MENTION = defineNotificationEvent({
  key: "comment.mention",
  label: "Zmínka v komentáři",
  description: "Někdo vás v komentáři označil pomocí @.",
  group: "Komentáře",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { mentioned: "Označený uživatel" },
  recipients: ["mentioned"],
  params: {
    author: { label: "Kdo komentář napsal", example: "Jana Kancelář" },
    excerpt: { label: "Začátek komentáře", example: "@Petr můžeš to zkontrolovat?" },
  },
  template: { title: "{author} vás zmínil v komentáři", body: "{excerpt}", url: "/inbox" },
});

/** Zkušební upozornění z Nastavení: obchází tiché hodiny a shrnutí a nezobrazuje se v Inboxu. */
export const SYSTEM_TEST = defineNotificationEvent({
  key: "system.test",
  label: "Zkušební upozornění",
  description: "Zkouška, že upozornění v tomto zařízení funguje.",
  group: "Systém",
  severity: "urgent",
  channels: { push: true, bell: false },
  audiences: { self: "Ten, kdo zkoušku vyvolal" },
  recipients: ["self"],
  params: {},
  template: {
    title: "Zkušební upozornění",
    body: "Upozornění v tomto zařízení funguje.",
    url: "/nastaveni/upozorneni",
  },
  mandatory: true,
  internal: true,
  ttlSeconds: 300,
});

export const CORE_NOTIFICATION_EVENTS: readonly AnyEventDef[] = [
  COMMENT_MENTION,
  SYSTEM_TEST,
] as AnyEventDef[];

export type NotificationRuntime = {
  events: ReadonlyMap<string, AnyEventDef>;
  config: NotificationsConfig;
  timezone: string;
};

const g = globalThis as { __notificationRuntime?: NotificationRuntime };

/** Bez nastavení (testy, nástroje) platí jen události jádra a tiché hodiny jsou vypnuté, ať testy nezávisí na čase. */
const FALLBACK: NotificationRuntime = {
  events: new Map(CORE_NOTIFICATION_EVENTS.map((e) => [e.key, e])),
  config: notificationsConfigSchema.parse({
    quietHours: { ...DEFAULT_QUIET_HOURS, enabled: false },
  }),
  timezone: "Europe/Prague",
};

export class NotificationCatalogError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Neplatný katalog upozornění:\n - ${problems.join("\n - ")}`);
    this.name = "NotificationCatalogError";
  }
}

/** Zkontroluje definice událostí (klíče, parametry v šablonách, příjemci). Vrací seznam problémů. */
export function validateEventDefs(defs: readonly AnyEventDef[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const d of defs) {
    if (!EVENT_KEY.test(d.key)) problems.push(`Klíč události „${d.key}“ má neplatný tvar.`);
    if (seen.has(d.key)) problems.push(`Událost „${d.key}“ je v katalogu dvakrát.`);
    seen.add(d.key);
    const known = new Set([...Object.keys(d.params), "entityId", "count"]);
    for (const [where, text] of [
      ["titulek", d.template.title],
      ["podtitulek", d.template.body ?? ""],
      ["odkaz", d.template.url],
    ] as const)
      for (const m of text.matchAll(/\{([a-zA-Z0-9]+)\}/g))
        if (!known.has(m[1]!))
          problems.push(`Událost „${d.key}“: ${where} používá neznámý parametr {${m[1]}}.`);
    if (!d.template.url.startsWith("/") || d.template.url.startsWith("//"))
      problems.push(`Událost „${d.key}“: odkaz musí začínat „/“.`);
    for (const r of d.recipients)
      if (!/^(perm:|role:)/.test(r) && !(r in d.audiences))
        problems.push(`Událost „${d.key}“: příjemce „${r}“ není mezi skupinami (audiences).`);
  }
  return problems;
}

/** Zkontroluje sekci `notifications` v konfiguraci klienta proti katalogu (neznámá událost, příjemce, parametr v textu). */
export function validateNotificationsConfig(
  config: NotificationsConfig,
  events: readonly AnyEventDef[],
): string[] {
  const problems: string[] = [];
  for (const [key, rule] of Object.entries(config.events)) {
    const def = events.find((e) => e.key === key);
    if (!def) problems.push(`notifications.events: neznámá událost „${key}“.`);
    else problems.push(...validateRule(def, rule).map((p) => `notifications.events: ${p}`));
  }
  return problems;
}

/**
 * Nastaví katalog (události jádra + zapnutých modulů) a výchozí pravidla klienta. Volá se při startu webu a workeru.
 * Neplatná definice vyhodí chybu, aby špatně napsaná událost nenastartovala.
 */
export function configureNotifications(opts: {
  events: readonly AnyEventDef[];
  config?: NotificationsConfig | undefined;
  timezone?: string | undefined;
}): NotificationRuntime {
  const all = [...CORE_NOTIFICATION_EVENTS, ...opts.events];
  const problems = validateEventDefs(all);
  const config = opts.config ?? FALLBACK.config;
  problems.push(...validateNotificationsConfig(config, all));
  if (problems.length) throw new NotificationCatalogError(problems);
  const runtime: NotificationRuntime = {
    events: new Map(all.map((e) => [e.key, e])),
    config,
    timezone: opts.timezone ?? FALLBACK.timezone,
  };
  g.__notificationRuntime = runtime;
  return runtime;
}

export function getNotificationRuntime(): NotificationRuntime {
  return g.__notificationRuntime ?? FALLBACK;
}

/** Pro testy: vrátí výchozí stav. */
export function resetNotifications() {
  delete g.__notificationRuntime;
}

export const getEventDef = (key: string) => getNotificationRuntime().events.get(key);
export const listEventDefs = () => [...getNotificationRuntime().events.values()];

/** Události z manifestů zapnutých modulů. */
export function collectNotificationEvents(
  modules: readonly { notifications?: readonly AnyEventDef[] | undefined }[],
): AnyEventDef[] {
  return modules.flatMap((m) => [...(m.notifications ?? [])]);
}
