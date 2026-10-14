import { z } from "zod";

const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.url().optional());
const optionalText = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const schema = z.object({
  /** Připojení pod uživatelem s minimálními právy (bez DDL). */
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "Musí začínat postgres://"),
  /** Veřejná adresa aplikace (odkazy v e-mailech, kontrola původu požadavků). */
  APP_URL: z.url("Musí být úplná adresa, např. https://system.klient.cz"),
  AUTH_SECRET: z.string().min(32, "Alespoň 32 znaků (openssl rand -base64 32)"),
  APP_ENCRYPTION_KEY: optionalText,
  APP_ENCRYPTION_KEYS: optionalText,
  FILES_DIR: z.string().default("./.data/files"),
  HEALTH_TOKEN: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(16, "Alespoň 16 znaků").optional(),
  ),
  HEARTBEAT_URL: optionalUrl,
  SENTRY_DSN: optionalUrl,
  BACKUP_STATUS_FILE: optionalText,
  /** Klíče pro push upozornění (`pnpm vapid:generate`). Bez nich se push nenabízí. */
  VAPID_PUBLIC_KEY: optionalText,
  VAPID_PRIVATE_KEY: optionalText,
  VAPID_SUBJECT: optionalText,
  APP_VERSION: z.string().default("0.0.0-dev"),
  /** Jen pro automatické testy: povolí http:// v produkčním režimu. V provozu se nikdy nenastavuje. */
  APP_ALLOW_HTTP: z.preprocess((v) => v === "1" || v === "true", z.boolean()),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

/** Validační schéma proměnných prostředí aplikace (čte ho i generátor dokumentace `pnpm docs:generate`). */
export const envSchema = schema;

/** Zástupné řetězce ze vzorů a návodů, které nikdy nesmí být skutečným tajemstvím. */
const PLACEHOLDER_SECRET = /zmen-me|change-?me|replace-?me|your[-_ ]?secret/i;

export type Env = z.output<typeof schema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Neplatné nastavení prostředí:\n - ${problems.join("\n - ")}`);
    this.name = "EnvError";
  }
}

/** Načte a ověří proměnné prostředí. Špatné nastavení = aplikace nenastartuje a vypíše všechny chyby. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  const problems = parsed.success
    ? []
    : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  if (!parsed.success) throw new EnvError(problems);
  const env = parsed.data;
  if (!env.APP_ENCRYPTION_KEY && !env.APP_ENCRYPTION_KEYS)
    throw new EnvError(["APP_ENCRYPTION_KEY: chybí (openssl rand -base64 32)"]);
  if (env.NODE_ENV === "production" && !env.APP_ALLOW_HTTP && !env.APP_URL.startsWith("https://")) {
    throw new EnvError(["APP_URL: v produkci musí být https://"]);
  }
  // ukázkové hodnoty z dokumentace nebo ze vzoru nesmí v provozu podepisovat relace
  if (env.NODE_ENV === "production" && PLACEHOLDER_SECRET.test(env.AUTH_SECRET))
    throw new EnvError([
      "AUTH_SECRET: je to ukázková hodnota, vygenerujte vlastní (openssl rand -base64 32)",
    ]);
  return env;
}
