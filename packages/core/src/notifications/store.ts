import { eq, inArray } from "drizzle-orm";
import { schema, type Executor } from "../db/client";
import { defineSetting } from "../settings/settings";
import {
  notificationRulesSchema,
  userPrefsSchema,
  type NotificationRules,
  type UserPrefs,
} from "./config";

/** Úpravy správce klienta (Nastavení → Pravidla upozornění). Čte je jádro přímo z tabulky `setting`, bez šifrování. */
export const notificationRulesSetting = defineSetting({
  key: "notification_rules",
  schema: notificationRulesSchema,
  default: { events: {} } as NotificationRules,
});

const EMPTY_RULES: NotificationRules = { events: {} };

/** Neplatný uložený JSON (ruční zásah do databáze) nesmí zastavit doručování: bere se jako „bez úprav“. */
export async function loadRules(db: Executor): Promise<NotificationRules> {
  const [row] = await db
    .select({ value: schema.setting.value })
    .from(schema.setting)
    .where(eq(schema.setting.key, notificationRulesSetting.key));
  if (!row) return EMPTY_RULES;
  const parsed = notificationRulesSchema.safeParse(row.value);
  return parsed.success ? parsed.data : EMPTY_RULES;
}

export async function loadPrefs(
  db: Executor,
  userIds: readonly string[],
): Promise<Map<string, UserPrefs>> {
  const out = new Map<string, UserPrefs>();
  if (!userIds.length) return out;
  const rows = await db
    .select()
    .from(schema.notificationPref)
    .where(inArray(schema.notificationPref.userId, [...userIds]));
  for (const r of rows) {
    const parsed = userPrefsSchema.safeParse(r.prefs);
    if (parsed.success) out.set(r.userId, parsed.data);
  }
  return out;
}
