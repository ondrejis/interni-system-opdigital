import { eq } from "drizzle-orm";
import type { ZodType } from "zod";
import "../zod-locale";
import { auditChange } from "../audit/audit";
import { schema, type Executor } from "../db/client";
import { inTx } from "../rbac/context";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import type { Cipher } from "../security/crypto";

/**
 * Definice jednoho nastavení. `secret` jsou názvy polí (nejvyšší úroveň), která se ukládají
 * zašifrovaná a do auditu ani do administrace se nedostanou v čitelné podobě.
 */
export type SettingDef<T extends Record<string, unknown>> = {
  key: string;
  schema: ZodType<T>;
  default: T;
  secret?: readonly (keyof T & string)[];
};

export function defineSetting<T extends Record<string, unknown>>(
  def: SettingDef<T>,
): SettingDef<T> {
  return def;
}

export type SettingsService = ReturnType<typeof createSettings>;

export function createSettings(cipher: Cipher) {
  const secretsOf = (def: SettingDef<never>) => (def.secret ?? []) as readonly string[];

  async function raw(db: Executor, key: string): Promise<Record<string, unknown> | null> {
    const [row] = await db.select().from(schema.setting).where(eq(schema.setting.key, key));
    return (row?.value as Record<string, unknown> | undefined) ?? null;
  }

  return {
    /** Hodnota nastavení se zadanými výchozími hodnotami, tajná pole dešifrovaná (jen pro server). */
    async get<T extends Record<string, unknown>>(db: Executor, def: SettingDef<T>): Promise<T> {
      const stored = (await raw(db, def.key)) ?? {};
      const merged: Record<string, unknown> = { ...def.default, ...stored };
      for (const f of secretsOf(def as never)) {
        const v = merged[f];
        merged[f] = typeof v === "string" && v ? cipher.decrypt(v) : null;
      }
      return merged as T;
    },

    /** Totéž pro administraci: tajná pole se nevrací, jen informace, která jsou nastavená. */
    async getForAdmin<T extends Record<string, unknown>>(ctx: Ctx, def: SettingDef<T>) {
      assertCan(ctx, "settings.manage");
      const stored = (await raw(ctx.db, def.key)) ?? {};
      const value: Record<string, unknown> = { ...def.default, ...stored };
      const secretsSet: string[] = [];
      for (const f of secretsOf(def as never)) {
        if (typeof value[f] === "string" && value[f]) secretsSet.push(f);
        value[f] = null;
      }
      return { value: value as Partial<T>, secretsSet };
    },

    /**
     * Uloží nastavení. U tajných polí `undefined` nebo prázdný řetězec znamená „ponechat uložené“.
     * Změna se zapíše do auditu s maskovanými tajnými poli.
     */
    async set<T extends Record<string, unknown>>(
      ctx: Ctx,
      def: SettingDef<T>,
      input: Partial<T>,
    ): Promise<void> {
      assertCan(ctx, "settings.manage");
      await inTx(ctx, async (c) => {
        const stored = (await raw(c.db, def.key)) ?? {};
        const next: Record<string, unknown> = { ...def.default, ...stored, ...input };
        const parsed = def.schema.parse({
          ...next,
          ...Object.fromEntries(secretsOf(def as never).map((f) => [f, next[f] ?? null])),
        }) as Record<string, unknown>;

        const toStore: Record<string, unknown> = { ...parsed };
        for (const f of secretsOf(def as never)) {
          const incoming = (input as Record<string, unknown>)[f];
          if (typeof incoming === "string" && incoming.length > 0)
            toStore[f] = cipher.encrypt(incoming);
          else toStore[f] = (stored[f] as string | undefined) ?? null; // ponechat
        }

        await c.db
          .insert(schema.setting)
          .values({ key: def.key, value: toStore, updatedBy: c.actor.userId })
          .onConflictDoUpdate({
            target: schema.setting.key,
            set: { value: toStore, updatedBy: c.actor.userId },
          });
        await auditChange(c, {
          entityType: "setting",
          entityId: def.key,
          before: { ...def.default, ...stored },
          after: toStore,
          summary: `Nastavení „${def.key}“ změněno`,
        });
      });
    },
  };
}
