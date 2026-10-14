import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { assertEntityAccess } from "@rebar/core/entities";
import { defineCommand, defineModuleServer, type ModuleServer } from "@rebar/core/module-server";
import { inTx, NotFoundError, UserError } from "@rebar/core/rbac";
import { jobShare } from "../schema";
import { DEFAULT_SCOPE, normalizeScope, shareStatus } from "./model";
import { hashShareToken, newShareToken } from "./token";

/**
 * Oblast „share“ modulu Zakázky (ADR 015): odkaz pro investora jen ke čtení. V databázi je jen otisk tokenu,
 * token se ukáže jednou při vytvoření (jako odkaz na odběr kalendáře). Čtení odkazu bez přihlášení je v `api.ts`.
 */

const jobId = z.uuid();
const MAX_ACTIVE = 20;

const scopeInput = z.object({
  schedule: z.boolean().default(DEFAULT_SCOPE.schedule),
  diary: z.enum(["none", "flagged", "all"]).default(DEFAULT_SCOPE.diary),
  photos: z.boolean().default(false),
  documentIds: z.array(z.uuid()).max(100).default([]),
});

const publicPath = (token: string) => `/investor/${token}`;

export const shareList = defineCommand({
  name: "zakazky.share.list",
  permission: "zakazky.share",
  input: z.object({ jobId }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    const rows = await ctx.db
      .select()
      .from(jobShare)
      .where(and(eq(jobShare.jobId, i.jobId), isNull(jobShare.deletedAt)))
      .orderBy(desc(jobShare.createdAt));
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      scope: normalizeScope(r.scope),
      status: shareStatus(r),
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    }));
  },
});

export const shareCreate = defineCommand({
  name: "zakazky.share.create",
  permission: "zakazky.share",
  input: z.object({
    jobId,
    label: z.string().trim().min(1, "Napište, pro koho odkaz je.").max(80),
    scope: scopeInput,
    /** Platnost ve dnech; prázdné = bez omezení. */
    expiresInDays: z.number().int().min(1).max(730).nullish(),
  }),
  handler: async (ctx, i, deps) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    return inTx(ctx, async (c) => {
      const active = (
        await c.db
          .select({ revokedAt: jobShare.revokedAt, expiresAt: jobShare.expiresAt })
          .from(jobShare)
          .where(and(eq(jobShare.jobId, i.jobId), isNull(jobShare.deletedAt)))
      ).filter((r) => shareStatus(r) === "active");
      if (active.length >= MAX_ACTIVE)
        throw new UserError("Zakázka má příliš mnoho aktivních odkazů. Nepotřebné zrušte.");
      const token = newShareToken();
      const [row] = await c.db
        .insert(jobShare)
        .values({
          jobId: i.jobId,
          tokenHash: hashShareToken(token),
          label: i.label,
          scope: normalizeScope(i.scope),
          expiresAt: i.expiresInDays ? new Date(Date.now() + i.expiresInDays * 86_400_000) : null,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning({ id: jobShare.id });
      await recordAudit(c, {
        action: "create",
        entityType: "job",
        entityId: i.jobId,
        summary: `Vytvořen odkaz pro investora „${i.label}“`,
      });
      return {
        id: row!.id,
        token,
        path: publicPath(token),
        url: `${deps.baseURL}${publicPath(token)}`,
      };
    });
  },
});

export const shareUpdate = defineCommand({
  name: "zakazky.share.update",
  permission: "zakazky.share",
  input: z.object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(80),
    scope: scopeInput,
  }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const [row] = await c.db
        .select()
        .from(jobShare)
        .where(and(eq(jobShare.id, i.id), isNull(jobShare.deletedAt)));
      if (!row) throw new NotFoundError("Odkaz nenalezen.");
      await assertEntityAccess(c, "job", row.jobId, "read");
      if (row.revokedAt) throw new UserError("Zrušený odkaz už nejde upravit.");
      await c.db
        .update(jobShare)
        .set({ label: i.label, scope: normalizeScope(i.scope), updatedBy: c.actor.userId })
        .where(eq(jobShare.id, i.id));
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: row.jobId,
        summary: `Upraven odkaz pro investora „${i.label}“`,
      });
    });
  },
});

export const shareRevoke = defineCommand({
  name: "zakazky.share.revoke",
  permission: "zakazky.share",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const [row] = await c.db
        .select()
        .from(jobShare)
        .where(and(eq(jobShare.id, i.id), isNull(jobShare.deletedAt)));
      if (!row) throw new NotFoundError("Odkaz nenalezen.");
      await assertEntityAccess(c, "job", row.jobId, "read");
      if (row.revokedAt) return;
      await c.db
        .update(jobShare)
        .set({ revokedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(jobShare.id, i.id));
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: row.jobId,
        summary: `Zrušen odkaz pro investora „${row.label ?? ""}“`,
      });
    });
  },
});

export const area: ModuleServer = defineModuleServer({
  commands: [shareList, shareCreate, shareUpdate, shareRevoke],
});
