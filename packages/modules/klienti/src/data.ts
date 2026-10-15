/*
  Čtení a zápis karty klienta a seznamu klientů. Klient je řádek `company` (modul `kontakty`); počty, souhrny a metriky
  dodávají ostatní moduly přes `ClientTabProvider` (`deps.services.all("clientCard")`, D §2.5). Každý ruční dotaz nad
  `company` jde přes `privateScope`: soukromý klient je pro Patrika neviditelný (seznam, karta, počty, souhrny).
*/
import { and, asc, eq, ilike, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { CLIENT_TABS, type ClientListMetrics, type ClientTabId } from "@rebar/core/contracts";
import { schema } from "@rebar/core/db";
import { privateScope, resolveEntity, updateRecord } from "@rebar/core/entities";
import { recordAudit } from "@rebar/core/audit";
import type { ModuleDeps } from "@rebar/core/module-server";
import { can, canSeePrivate, inTx, NotFoundError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { company } from "@rebar/kontakty/schema";
import {
  CONTEXT_FIELDS,
  emptySummary,
  type ClientCardSummary,
  type ClientContextDto,
  type ClientListResult,
  type ClientRow,
  type ClientTabsResult,
  type ListInput,
  type SaveContextInput,
} from "./contract";
import { hiddenTabs, isClientStatus, SERVICES } from "./shared";
import type { ServiceType } from "@rebar/core/contracts";

const { user } = schema;

/** Řádek klienta, který aktér smí vidět (soukromí, smazání, rozsah „jen moje“); `null`, když ne. */
export async function loadVisibleCompany(ctx: Ctx, companyId: string) {
  const [row] = await ctx.db
    .select()
    .from(company)
    .where(and(eq(company.id, companyId), isNull(company.deletedAt), privateScope(ctx, company)));
  if (!row) return null;
  if (!can(ctx, "klienti.read", { ownerIds: [row.ownerId] })) return null;
  return row;
}

/** Jako `loadVisibleCompany`, ale neviditelný nebo neexistující klient je `NotFoundError`. */
export async function requireCompany(ctx: Ctx, companyId: string) {
  const row = await loadVisibleCompany(ctx, companyId);
  if (!row) throw new NotFoundError();
  return row;
}

/** Je klient i klientem (má stav)? Karta organizace bez stavu je jen organizace. */
const clientsOnly = isNotNull(company.clientStatus);

const maxIso = (a: string | null, b: string | null): string | null =>
  a && b ? (a > b ? a : b) : (a ?? b);

/** Metriky seznamu klientů od všech zapnutých modulů (každý se sám postará o soukromí a rozsah). */
async function collectMetrics(
  ctx: Ctx,
  deps: ModuleDeps,
  ids: string[],
): Promise<Record<string, Partial<ClientListMetrics>>> {
  const out: Record<string, Partial<ClientListMetrics>> = {};
  if (!ids.length) return out;
  const parts: Record<string, Partial<ClientListMetrics>>[] = await Promise.all(
    deps.services
      .all("clientCard")
      .map((p) => p.listMetrics?.(ctx, ids) ?? Promise.resolve({} as Record<string, never>)),
  );
  for (const part of parts)
    for (const [id, m] of Object.entries(part)) {
      const cur = (out[id] ??= {});
      if (m.activeJobs !== undefined) cur.activeJobs = (cur.activeJobs ?? 0) + m.activeJobs;
      if (m.income12mMinor !== undefined)
        cur.income12mMinor = (cur.income12mMinor ?? 0) + m.income12mMinor;
      if (m.lastActivityAt !== undefined)
        cur.lastActivityAt = maxIso(cur.lastActivityAt ?? null, m.lastActivityAt);
      if (m.driveState !== undefined) cur.driveState = m.driveState;
    }
  return out;
}

/** `klienti.list`: tabulka klientů se sloupci z příspěvků modulů. */
export async function listClients(
  ctx: Ctx,
  deps: ModuleDeps,
  input: ListInput,
): Promise<ClientListResult> {
  const conds: (SQL | undefined)[] = [
    isNull(company.deletedAt),
    clientsOnly,
    privateScope(ctx, company),
    input.includeFormer ? undefined : ne(company.clientStatus, "former"),
  ];
  if (scopeOf(ctx, "klienti.read") === "own")
    conds.push(eq(company.ownerId, ctx.actor.userId ?? "00000000-0000-0000-0000-000000000000"));
  const q = input.search?.trim();
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(company.name, like), ilike(company.ico, like), ilike(company.city, like)));
  }
  const rows = await ctx.db
    .select({
      id: company.id,
      name: company.name,
      status: company.clientStatus,
      services: company.services,
      ownerId: company.ownerId,
      ownerName: user.name,
      tags: company.tags,
      isPrivate: company.isPrivate,
      clientSince: company.clientSince,
      lastActivityAt: company.lastActivityAt,
      web: company.web,
    })
    .from(company)
    .leftJoin(user, eq(user.id, company.ownerId))
    .where(and(...conds))
    .orderBy(asc(sql`lower(${company.name})`));
  const metrics = await collectMetrics(
    ctx,
    deps,
    rows.map((r) => r.id),
  );
  const canSeeIncome = can(ctx, "finance.read");
  const out: ClientRow[] = rows.flatMap((r) => {
    if (!isClientStatus(r.status)) return [];
    const m = metrics[r.id] ?? {};
    return [
      {
        id: r.id,
        name: r.name,
        status: r.status,
        services: r.services.filter((s): s is ServiceType =>
          (SERVICES as readonly string[]).includes(s),
        ),
        ownerId: r.ownerId,
        ownerName: r.ownerName ?? null,
        tags: r.tags,
        isPrivate: r.isPrivate,
        activeJobs: m.activeJobs ?? 0,
        income12mMinor: canSeeIncome ? (m.income12mMinor ?? 0) : null,
        clientSince: r.clientSince,
        lastActivityAt: maxIso(r.lastActivityAt?.toISOString() ?? null, m.lastActivityAt ?? null),
        driveState: m.driveState ?? "none",
        web: r.web,
      },
    ];
  });
  return {
    rows: out,
    canSeeIncome,
    canWrite: can(ctx, "klienti.write"),
    canSeePrivate: canSeePrivate(ctx),
  };
}

const ctxDto = (raw: unknown, endReason: string | null): ClientContextDto => {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  return {
    decisionMaker: s("decisionMaker"),
    howToCommunicate: s("howToCommunicate"),
    history: s("history"),
    notes: s("notes"),
    endReason: endReason ?? "",
  };
};

/** `klienti.summary`: souhrn karty (Přehled): příspěvky modulů, finanční souhrn a kontext. */
export async function clientSummary(
  ctx: Ctx,
  deps: ModuleDeps,
  companyId: string,
): Promise<ClientCardSummary> {
  const row = await requireCompany(ctx, companyId);
  const summary = emptySummary();
  const parts = await Promise.all(
    deps.services.all("clientCard").map((p) => p.summary?.(ctx, companyId) ?? Promise.resolve({})),
  );
  for (const part of parts) {
    for (const [k, v] of Object.entries(part)) {
      const key = k as keyof typeof summary;
      if (key === "lastActivityAt") {
        summary.lastActivityAt = maxIso(summary.lastActivityAt, v as string | null);
      } else if (v && typeof v === "object") {
        Object.assign(summary[key] as object, v);
      }
    }
  }
  summary.lastActivityAt = maxIso(
    summary.lastActivityAt,
    row.lastActivityAt?.toISOString() ?? null,
  );
  const canSeeFinance = can(ctx, "finance.read");
  return {
    companyId,
    name: row.name,
    status: isClientStatus(row.clientStatus) ? row.clientStatus : null,
    since: row.clientSince,
    until: row.clientUntil,
    summary,
    canSeeFinance,
    financeSharedOnly: canSeeFinance && !canSeePrivate(ctx),
    context: ctxDto(row.clientContext, row.clientEndReason),
  };
}

/** `klienti.tabCounts`: počty záložek od modulů a záložky bez dat, které se na kartě skryjí. */
export async function clientTabs(
  ctx: Ctx,
  deps: ModuleDeps,
  companyId: string,
): Promise<ClientTabsResult> {
  await requireCompany(ctx, companyId);
  const parts = await Promise.all(
    deps.services
      .all("clientCard")
      .map((p) => p.tabCounts?.(ctx, companyId) ?? Promise.resolve({})),
  );
  const counts: Partial<Record<ClientTabId, number>> = {};
  for (const part of parts)
    for (const [k, v] of Object.entries(part))
      if (typeof v === "number") counts[k as ClientTabId] = (counts[k as ClientTabId] ?? 0) + v;
  return { counts, hidden: hiddenTabs(counts, Object.keys(CLIENT_TABS) as ClientTabId[]) };
}

/** `klienti.setServices`: úplný seznam služeb; nové spustí `client.service_added` (rozšíření entity `company`). */
export async function setServices(
  ctx: Ctx,
  deps: ModuleDeps,
  companyId: string,
  services: ServiceType[],
): Promise<{ services: ServiceType[] }> {
  return inTx(ctx, async (c) => {
    const row = await requireCompany(c, companyId);
    if (!can(c, "klienti.write", { ownerIds: [row.ownerId] })) throw new NotFoundError();
    const next = SERVICES.filter((s) => services.includes(s));
    const same = next.length === row.services.length && next.every((s) => row.services.includes(s));
    if (!same) {
      const def = deps.registry.get("company");
      if (!def) throw new UserError("Modul Kontakty není zapnutý.");
      await updateRecord(c, deps.registry, await resolveEntity(c.db, def), companyId, {
        services: next,
      });
    }
    return { services: next };
  });
}

/** `klienti.saveContext`: uloží předaná pole kontextu (po jednom poli, autosave) a důvod ukončení. */
export async function saveContext(
  ctx: Ctx,
  input: SaveContextInput,
): Promise<ClientContextDto & { savedAt: string }> {
  return inTx(ctx, async (c) => {
    const row = await requireCompany(c, input.companyId);
    if (!can(c, "klienti.write", { ownerIds: [row.ownerId] })) throw new NotFoundError();
    const old = ctxDto(row.clientContext, row.clientEndReason);
    const next: ClientContextDto = { ...old };
    const changes: { field: string; old: string; new: string }[] = [];
    const LABELS: Record<string, string> = {
      decisionMaker: "Kdo rozhoduje",
      howToCommunicate: "Jak komunikovat",
      history: "Historie spolupráce",
      notes: "Na co si dát pozor",
      endReason: "Proč spolupráce skončila",
    };
    for (const k of [...CONTEXT_FIELDS, "endReason"] as const) {
      const v = input[k];
      if (v === undefined || v === old[k]) continue;
      changes.push({ field: LABELS[k]!, old: old[k], new: v });
      next[k] = v;
    }
    const savedAt = new Date();
    if (changes.length) {
      const { endReason, ...fields } = next;
      const json = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== ""));
      await c.db
        .update(company)
        .set({
          clientContext: json,
          clientEndReason: endReason === "" ? null : endReason,
          updatedBy: c.actor.userId,
          updatedAt: savedAt,
        })
        .where(eq(company.id, row.id));
      await recordAudit(c, {
        action: "update",
        entityType: "company",
        entityId: row.id,
        summary: "Kontext klienta",
        entityTitle: row.name,
        isPrivate: row.isPrivate,
        changes,
      });
    }
    return { ...next, savedAt: savedAt.toISOString() };
  });
}
