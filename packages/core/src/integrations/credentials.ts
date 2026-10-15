import { and, eq, isNull } from "drizzle-orm";
import { recordAudit } from "../audit/audit";
import { schema, type Executor } from "../db/client";
import type { IntegrationProvider } from "../db/schema/integrations";
import { inTx } from "../rbac/context";
import { PermissionError } from "../rbac/errors";
import { can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import type { Cipher } from "../security/crypto";

/*
  Šifrovaná přihlašovací data poskytovatelů (OAuth tokeny Googlu, token Meta, klíč Fakturoidu): tabulka
  `integration_credential`, obsah je JSON zašifrovaný přes `cipher` (AES-256-GCM). Společný přístup agentury má
  `user_id` prázdné (spravuje `settings.integrations`), osobní patří uživateli (propojení vlastního Google účtu).
  Čitelná podoba existuje jen v paměti serveru v okamžiku použití: nikdy se nevrací do UI, nezapisuje do auditu
  ani do logu (audit nese jen poskytovatele a stav).
*/

/** Co o uloženém přístupu smí vědět UI (bez obsahu). */
export type CredentialInfo = {
  id: string;
  provider: IntegrationProvider;
  /** Prázdné = společný přístup agentury. */
  userId: string | null;
  status: "ok" | "reauth" | "error";
  updatedAt: string;
};

const userCond = (userId: string | null) =>
  userId
    ? eq(schema.integrationCredential.userId, userId)
    : isNull(schema.integrationCredential.userId);

/** Kdo smí s přístupem nakládat: společný jen `settings.integrations`, osobní jeho vlastník nebo správce integrací. */
function assertAccess(ctx: Ctx, userId: string | null): void {
  if (can(ctx, "settings.integrations")) return;
  if (userId && ctx.actor.userId === userId) return;
  throw new PermissionError();
}

/** Úložiště tajemství poskytovatelů nad zadaným šifrováním. */
export function createCredentialStore(cipher: Cipher) {
  const live = (provider: IntegrationProvider, userId: string | null) =>
    and(
      eq(schema.integrationCredential.provider, provider),
      userCond(userId),
      isNull(schema.integrationCredential.deletedAt),
    );

  return {
    /** Uloží (nebo přepíše) přístup poskytovatele. Obsah je libovolný JSON objekt (tokeny, klíče, časy vypršení). */
    async save(
      ctx: Ctx,
      input: {
        provider: IntegrationProvider;
        userId?: string | null;
        data: Record<string, unknown>;
        status?: CredentialInfo["status"];
      },
    ): Promise<{ id: string }> {
      const userId = input.userId ?? null;
      assertAccess(ctx, userId);
      const dataEnc = cipher.encrypt(JSON.stringify(input.data));
      const status = input.status ?? "ok";
      return inTx(ctx, async (c) => {
        const [existing] = await c.db
          .select({ id: schema.integrationCredential.id })
          .from(schema.integrationCredential)
          .where(live(input.provider, userId));
        let id: string;
        if (existing) {
          id = existing.id;
          await c.db
            .update(schema.integrationCredential)
            .set({ dataEnc, status, updatedBy: c.actor.userId })
            .where(eq(schema.integrationCredential.id, id));
        } else {
          const [row] = await c.db
            .insert(schema.integrationCredential)
            .values({
              provider: input.provider,
              userId,
              dataEnc,
              status,
              createdBy: c.actor.userId,
              updatedBy: c.actor.userId,
            })
            .returning({ id: schema.integrationCredential.id });
          id = row!.id;
        }
        await recordAudit(c, {
          action: existing ? "update" : "create",
          entityType: "integration_credential",
          entityId: id,
          entityTitle: input.provider,
          summary: `Uložen přístup k ${input.provider}${userId ? " (osobní)" : ""}`,
        });
        return { id };
      });
    },

    /** Dešifrovaný obsah pro použití na serveru (volání API poskytovatele); `null`, když přístup není nebo nejde dešifrovat. */
    async load<T extends Record<string, unknown> = Record<string, unknown>>(
      db: Executor,
      provider: IntegrationProvider,
      userId: string | null = null,
    ): Promise<{ data: T; status: CredentialInfo["status"] } | null> {
      const [row] = await db
        .select({
          dataEnc: schema.integrationCredential.dataEnc,
          status: schema.integrationCredential.status,
        })
        .from(schema.integrationCredential)
        .where(live(provider, userId));
      if (!row) return null;
      const plain = cipher.decrypt(row.dataEnc);
      if (!plain) return null;
      try {
        return { data: JSON.parse(plain) as T, status: row.status };
      } catch {
        return null;
      }
    },

    /** Změní stav přístupu (`reauth` = je třeba se znovu přihlásit, `error` = poslední volání selhalo); bez audit záznamu. */
    async setStatus(
      db: Executor,
      provider: IntegrationProvider,
      userId: string | null,
      status: CredentialInfo["status"],
    ): Promise<void> {
      await db.update(schema.integrationCredential).set({ status }).where(live(provider, userId));
    },

    /** Smaže přístup (odpojení integrace). */
    async remove(
      ctx: Ctx,
      provider: IntegrationProvider,
      userId: string | null = null,
    ): Promise<boolean> {
      assertAccess(ctx, userId);
      return inTx(ctx, async (c) => {
        const rows = await c.db
          .update(schema.integrationCredential)
          .set({ deletedAt: new Date(), deletedBy: c.actor.userId })
          .where(live(provider, userId))
          .returning({ id: schema.integrationCredential.id });
        for (const r of rows)
          await recordAudit(c, {
            action: "delete",
            entityType: "integration_credential",
            entityId: r.id,
            entityTitle: provider,
            summary: `Odpojen přístup k ${provider}${userId ? " (osobní)" : ""}`,
          });
        return rows.length > 0;
      });
    },

    /** Přehled uložených přístupů bez obsahu; správce integrací vidí všechny, ostatní jen své. */
    async list(ctx: Ctx): Promise<CredentialInfo[]> {
      const all = can(ctx, "settings.integrations");
      if (!all && !ctx.actor.userId) throw new PermissionError();
      const rows = await ctx.db
        .select({
          id: schema.integrationCredential.id,
          provider: schema.integrationCredential.provider,
          userId: schema.integrationCredential.userId,
          status: schema.integrationCredential.status,
          updatedAt: schema.integrationCredential.updatedAt,
        })
        .from(schema.integrationCredential)
        .where(
          and(
            isNull(schema.integrationCredential.deletedAt),
            all ? undefined : eq(schema.integrationCredential.userId, ctx.actor.userId!),
          ),
        );
      return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
    },
  };
}

/** Úložiště přístupů poskytovatelů. */
export type CredentialStore = ReturnType<typeof createCredentialStore>;
