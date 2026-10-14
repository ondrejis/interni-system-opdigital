import { z } from "zod";
import "../zod-locale";
import { AUDIENCE_TOKEN } from "./types";

/*
  Pravidla upozornění klienta. Stejný tvar mají výchozí hodnoty v `clients/<klient>/config.ts` (`notifications`)
  i úpravy správce v Nastavení (uložené v nastavení `notification_rules`); správce má přednost.
  Tento soubor nesmí importovat nic těžšího než zod: čte ho validace konfigurace.
*/

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Čas zadejte ve tvaru HH:MM.");

export const channelFlagsSchema = z.strictObject({
  push: z.boolean().optional(),
  bell: z.boolean().optional(),
  email: z.boolean().optional(),
});

/** Úprava jedné události; vynechané položky zůstávají podle katalogu. */
export const eventRuleSchema = z.strictObject({
  /** Vypnutá událost se nikomu nedoručí (ani do zvonku). */
  enabled: z.boolean().optional(),
  /** Povinná událost: uživatel ji nemůže vypnout. */
  mandatory: z.boolean().optional(),
  severity: z.enum(["normal", "urgent"]).optional(),
  channels: channelFlagsSchema.optional(),
  /** Skupiny příjemců: název skupiny události, `perm:<oprávnění>` nebo `role:<klíč role>`. */
  recipients: z.array(z.string().regex(AUDIENCE_TOKEN, "Neplatný příjemce.")).max(20).optional(),
  /** Vlastní text titulku s `{parametry}`. */
  title: z.string().trim().min(1).max(160).optional(),
  /** Vlastní text podtitulku; prázdný řetězec podtitulek vypne. */
  body: z.string().trim().max(400).optional(),
});
export type EventRule = z.output<typeof eventRuleSchema>;

export const quietHoursSchema = z.strictObject({ enabled: z.boolean(), start: hhmm, end: hhmm });
export type QuietHours = z.output<typeof quietHoursSchema>;

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: true, start: "20:00", end: "06:00" };
export const DEFAULT_DIGEST_TIMES: readonly string[] = ["07:00", "16:00"];

/** Úpravy správce v Nastavení (všechno volitelné, doplňuje se do konfigurace klienta). */
export const notificationRulesSchema = z.strictObject({
  events: z.record(z.string(), eventRuleSchema).default({}),
  quietHours: quietHoursSchema.optional(),
  digestTimes: z.array(hhmm).min(1).max(4).optional(),
});
export type NotificationRules = z.output<typeof notificationRulesSchema>;

/** Sekce `notifications` v konfiguraci klienta. */
export const notificationsConfigSchema = z.strictObject({
  events: z.record(z.string(), eventRuleSchema).default({}),
  quietHours: quietHoursSchema.default(DEFAULT_QUIET_HOURS),
  /** Časy, kdy se doručují shrnutí (kdo si zvolil „shrnutí“ místo okamžitých upozornění). */
  digestTimes: z
    .array(hhmm)
    .min(1)
    .max(4)
    .default([...DEFAULT_DIGEST_TIMES]),
});
export type NotificationsConfig = z.output<typeof notificationsConfigSchema>;
export type NotificationsConfigInput = z.input<typeof notificationsConfigSchema>;

/** Předvolby jednoho uživatele. */
export const pushModeSchema = z.enum(["instant", "digest", "off"]);
export type PushMode = z.output<typeof pushModeSchema>;

export const userEventPrefSchema = z.strictObject({
  push: pushModeSchema.optional(),
  bell: z.boolean().optional(),
  email: z.boolean().optional(),
});
export type UserEventPref = z.output<typeof userEventPrefSchema>;

export const userPrefsSchema = z.strictObject({
  events: z.record(z.string(), userEventPrefSchema).default({}),
  /** Vlastní tiché hodiny; bez hodnoty platí výchozí klienta. */
  quiet: quietHoursSchema.optional(),
  digestTimes: z.array(hhmm).min(1).max(4).optional(),
});
export type UserPrefs = z.output<typeof userPrefsSchema>;
