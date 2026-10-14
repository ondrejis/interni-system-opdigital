import * as Sentry from "@sentry/node";
import type { ErrorEvent } from "@sentry/node";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g;
const TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const PHONE = /(?<![\w.])\+?\d[\d ]{8,}\d(?![\w.])/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Hodnoty parametrů dotazu v chybě ORM („params: …“): hesla, otisky, tokeny i osobní údaje. */
const QUERY_PARAMS = /(\bparams:\s*)[^\n]*/gi;
/** Přihlašovací údaje v adrese (`postgres://uživatel:heslo@server`). */
const URL_CREDENTIALS = /(:\/\/)[^/\s:@]+:[^/\s@]+@/g;
/** Tajemství zapsaná jako `klíč=hodnota` nebo `Bearer …`. */
const SECRET_PAIR =
  /\b(password|passwd|heslo|secret|token|api[_-]?key|authorization|cookie)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi;
const BEARER = /\bBearer\s+\S+/gi;

/**
 * Z textu odstraní e-maily, telefonní čísla, dlouhé tokeny a UUID (mohou identifikovat osobu nebo záznam),
 * parametry SQL dotazů, přihlašovací údaje v adresách a tajemství zapsaná jako `klíč=hodnota`.
 */
export function scrubText(text: string): string {
  return text
    .replace(QUERY_PARAMS, "$1[skryto]")
    .replace(URL_CREDENTIALS, "$1[skryto]@")
    .replace(BEARER, "Bearer [skryto]")
    .replace(SECRET_PAIR, "$1$2[skryto]")
    .replace(EMAIL, "[e-mail]")
    .replace(UUID, "[id]")
    .replace(TOKEN, "[token]")
    .replace(PHONE, "[číslo]");
}

function scrubDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value);
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubDeep(v, depth + 1)]),
  );
}

/**
 * Očištění události před odesláním do error trackingu (GlitchTip/Sentry): žádný uživatel, IP, cookies,
 * hlavičky, těla požadavků ani query string; texty bez e-mailů, telefonů a tokenů.
 */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  delete event.user;
  delete event.server_name;
  if (event.request) {
    const url = event.request.url ? event.request.url.split("?")[0] : undefined;
    event.request = { ...(url ? { url } : {}), method: event.request.method };
  }
  if (event.exception?.values) {
    for (const v of event.exception.values) if (v.value) v.value = scrubText(v.value);
  }
  if (event.message) event.message = scrubText(event.message);
  if (event.extra) event.extra = scrubDeep(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = scrubDeep(event.contexts) as typeof event.contexts;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .filter((b) => b.category !== "console" && b.category !== "http" && b.category !== "fetch")
      .map((b) => ({
        ...b,
        message: b.message ? scrubText(b.message) : b.message,
        data: undefined,
      }));
  }
  event.tags = event.tags ? (scrubDeep(event.tags) as typeof event.tags) : event.tags;
  return event;
}

/** Chyba jako očištěný text pro log: název, zpráva, zásobník a příčiny (`cause`). */
export function scrubError(err: unknown, depth = 0): string {
  if (!(err instanceof Error)) return scrubText(String(err));
  const own = scrubText(
    `${err.name}: ${err.message}\n${err.stack?.split("\n").slice(1, 8).join("\n") ?? ""}`,
  );
  return err.cause && depth < 3 ? `${own}\ncaused by ${scrubError(err.cause, depth + 1)}` : own;
}

export type ErrorTrackingOptions = {
  dsn: string | undefined;
  release: string;
  environment: string;
};

let enabled = false;

/** Zapne hlášení chyb. Bez DSN nedělá nic. Osobní údaje se neposílají (`dataCollection` vypnuté + `scrubEvent`). */
export function initErrorTracking({ dsn, release, environment }: ErrorTrackingOptions): boolean {
  if (!dsn || enabled) return enabled;
  Sentry.init({
    dsn,
    release,
    environment,
    // Sentry 11: nic osobního se nesbírá (uživatel, cookies, hlavičky, těla, query string); scrubEvent je druhá pojistka.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (b) => (b.category === "console" || b.category === "http" ? null : b),
  });
  enabled = true;
  return true;
}

/** Nahlásí neočekávanou chybu (pokud je tracking zapnutý). Kontext smí obsahovat jen technická data. */
export function captureError(err: unknown, context?: Record<string, string>): void {
  if (!enabled) {
    // bez error trackingu aspoň do logu kontejneru (`docker logs`), ať se neočekávané chyby neztratí;
    // text chyby jde přes `scrubText`, protože chyby ORM nesou hodnoty parametrů dotazu (hesla, tokeny, údaje osob)
    console.error("[chyba]", context ?? {}, scrubError(err));
    return;
  }
  Sentry.withScope((scope) => {
    if (context) scope.setTags(context);
    Sentry.captureException(err);
  });
}
