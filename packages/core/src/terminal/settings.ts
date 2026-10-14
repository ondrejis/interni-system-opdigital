import { and, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema, type Executor } from "../db/client";
import { UserError } from "../rbac/errors";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { defineSetting, type SettingsService } from "../settings";
import {
  DEFAULT_TERMINAL_SETTINGS,
  TERMINAL_SETTING_VERSION,
  migrateTerminalSettings,
  mergeTerminalConfig,
  terminalSettingsSchema,
  type TerminalConfig,
  type TerminalSettings,
} from "./config";

/**
 * Nastavení terminálu v tabulce `setting` (klíč `terminal`). Tvar hlídá `terminalSettingsSchema` a převod starších verzí
 * `migrateTerminalSettings`; samotná definice je volná, aby si čtení mohlo poradit i se starším tvarem.
 */
export const terminalSettingDef = defineSetting({
  key: "terminal",
  schema: z.record(z.string(), z.unknown()),
  default: {} as Record<string, unknown>,
});

/** Nastavení správce převedené na aktuální verzi (poškozené položky se zahodí, terminál kvůli tomu nespadne). */
export async function loadTerminalSettings(
  settings: SettingsService,
  db: Executor,
): Promise<{ value: TerminalSettings; problems: string[] }> {
  const raw = await settings.get(db, terminalSettingDef);
  return migrateTerminalSettings(Object.keys(raw).length ? raw : null);
}

/** Konfigurace, která platí: výchozí z `config.ts` přepsané nastavením správce. */
export async function loadEffectiveTerminalConfig(
  settings: SettingsService,
  db: Executor,
  base: TerminalConfig,
): Promise<TerminalConfig> {
  if (!base.enabled) return base;
  return mergeTerminalConfig(base, (await loadTerminalSettings(settings, db)).value);
}

/** Oprávnění, kvůli kterým by role jen pro terminál zamkla správce mimo Nastavení. */
const ADMIN_PERMISSIONS = ["settings.manage", "users.manage", "roles.manage"];

export type TerminalRoleChoice = {
  key: string;
  name: string;
  /** Roli nelze omezit jen na terminál (systémová, nebo spravuje systém). */
  locked: boolean;
};

/** Role k výběru v Nastavení terminálu. Vyžaduje `settings.manage`. */
export async function listTerminalRoleChoices(ctx: Ctx): Promise<TerminalRoleChoice[]> {
  assertCan(ctx, "settings.manage");
  const roles = await ctx.db
    .select({
      id: schema.role.id,
      key: schema.role.key,
      name: schema.role.name,
      isSystem: schema.role.isSystem,
    })
    .from(schema.role)
    .where(isNull(schema.role.deletedAt))
    .orderBy(schema.role.name);
  const admins = await ctx.db
    .select({ roleId: schema.rolePermission.roleId })
    .from(schema.rolePermission)
    .where(and(inArray(schema.rolePermission.permission, ADMIN_PERMISSIONS)));
  const adminIds = new Set(admins.map((a) => a.roleId));
  return roles.map((r) => ({
    key: r.key,
    name: r.name,
    locked: r.isSystem || adminIds.has(r.id),
  }));
}

/**
 * Uloží nastavení správce. Vyžaduje `settings.manage`. Role jen pro terminál nesmí být systémová ani smět spravovat
 * systém (zamkly by správce mimo Nastavení); klíče rolí se ověřují proti existujícím rolím.
 */
export async function saveTerminalSettings(
  ctx: Ctx,
  settings: SettingsService,
  input: unknown,
): Promise<TerminalSettings> {
  assertCan(ctx, "settings.manage");
  const parsed = terminalSettingsSchema.parse({
    ...DEFAULT_TERMINAL_SETTINGS,
    ...(input as object),
    version: TERMINAL_SETTING_VERSION,
  });
  if (parsed.roles?.length) {
    const choices = await listTerminalRoleChoices(ctx);
    for (const key of parsed.roles) {
      const role = choices.find((r) => r.key === key);
      if (!role) throw new UserError(`Role „${key}“ neexistuje.`);
      if (role.locked)
        throw new UserError(
          `Roli „${role.name}“ nelze omezit jen na terminál: spravuje systém a ztratila by přístup do Nastavení.`,
        );
    }
  }
  await settings.set(ctx, terminalSettingDef, parsed);
  return parsed;
}
