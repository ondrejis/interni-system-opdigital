import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "@rebar/core/db";
import { getHealth, type HealthReport } from "@rebar/core/health";
import { getIntegrationStatus, type IntegrationStatus } from "@rebar/core/integrations";
import { listInboundEvents, type InboundEventRow } from "@rebar/core/ingest";
import { assertCan, type Ctx } from "@rebar/core/rbac";
import type { Cipher } from "@rebar/core/security";
import { listDeliveries, type DeliveryRow } from "@rebar/core/webhooks";

/*
  Data stránky Nastavení → Systém (NAS-11, NFR-12, NFR-13): stav systému, zálohy a zkouška obnovy, velikost databáze,
  fronty úloh, chyby integrací a chybná doručení webhooků. Čte jen počty, časy a texty chyb; nikdy tajemství ani těla
  zpráv. Funkce nezná Next (dostává závislosti parametrem), takže jde testovat proti databázi bez webu.
*/

/** Podrobnosti poslední zálohy ze stavového souboru, který zapisuje kontejner `backup` (`backup-tool.sh`). */
export type BackupDetail = {
  /** Je nastavená cesta ke stavovému souboru (`BACKUP_STATUS_FILE`)? Bez ní zálohy neběží. */
  configured: boolean;
  /** Soubor existuje a jde přečíst? (Před první zálohou ne.) */
  readable: boolean;
  lastSuccessAt: string | null;
  lastSnapshot: string | null;
  dumpBytes: number | null;
  /** Počet uložených denních snapshotů v repozitáři (po retenci 30 denních + 12 měsíčních). */
  snapshots: number | null;
  lastFailureAt: string | null;
  lastError: string | null;
  restoreTest: { at: string; ok: boolean; detail: string | null } | null;
};

/** Souhrn fronty úloh (pg-boss) pro Systém. */
export type QueueDetail = {
  available: boolean;
  ready: number;
  active: number;
  retry: number;
  failed24h: number;
  oldestReadySeconds: number | null;
  /** Selhané úlohy za 24 h podle názvu fronty (bez dat úlohy). */
  failedByName: { name: string; count: number; lastAt: string | null }[];
};

/** Velikost databáze a největší tabulky. */
export type DatabaseDetail = {
  available: boolean;
  sizeBytes: number | null;
  tables: { name: string; bytes: number; rows: number }[];
};

/** Heartbeat (hodinový hlas instance agentuře): kdy naposledy proběhl, a je-li vůbec nastavený. */
export type HeartbeatDetail = {
  configured: boolean;
  lastRunAt: string | null;
  lastFailedAt: string | null;
};

/** Všechno, co stránka Systém zobrazuje. */
export type SystemStatus = {
  generatedAt: string;
  version: string;
  health: HealthReport;
  heartbeat: HeartbeatDetail;
  backup: BackupDetail;
  database: DatabaseDetail;
  queue: QueueDetail;
  integrations: IntegrationStatus;
  failedDeliveries: DeliveryRow[];
  failedInbound: InboundEventRow[];
  /** Kolik věcí vyžaduje zásah (zdraví, záloha, zkouška obnovy, integrace). */
  attention: number;
};

/** Závislosti načtení stavu (z prostředí aplikace). */
export type SystemStatusDeps = {
  cipher: Cipher;
  dataDir: string;
  version: string;
  backupStatusFile?: string | undefined;
  heartbeatUrl?: string | undefined;
  now?: () => Date;
};

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Přečte stavový soubor záloh. Chybějící nebo poškozený soubor není chyba (před první zálohou neexistuje). */
export async function readBackupDetail(file: string | undefined): Promise<BackupDetail> {
  const empty: BackupDetail = {
    configured: !!file,
    readable: false,
    lastSuccessAt: null,
    lastSnapshot: null,
    dumpBytes: null,
    snapshots: null,
    lastFailureAt: null,
    lastError: null,
    restoreTest: null,
  };
  if (!file) return empty;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(await fs.readFile(path.resolve(file), "utf8")) as Record<string, unknown>;
  } catch {
    return empty;
  }
  const rt = raw.restoreTest as { at?: unknown; ok?: unknown; detail?: unknown } | undefined;
  const testAt = iso(rt?.at);
  const bytes = Number(raw.dumpBytes);
  return {
    configured: true,
    readable: true,
    lastSuccessAt: iso(raw.lastSuccessAt),
    lastSnapshot: typeof raw.lastSnapshot === "string" ? raw.lastSnapshot : null,
    dumpBytes: Number.isFinite(bytes) && bytes > 0 ? bytes : null,
    snapshots: Number.isInteger(raw.snapshots) ? (raw.snapshots as number) : null,
    lastFailureAt: iso(raw.lastFailureAt),
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    restoreTest: testAt
      ? {
          at: testAt,
          ok: rt?.ok === true,
          detail: typeof rt?.detail === "string" ? rt.detail : null,
        }
      : null,
  };
}

async function queueDetail(ctx: Ctx): Promise<QueueDetail> {
  const none: QueueDetail = {
    available: false,
    ready: 0,
    active: 0,
    retry: 0,
    failed24h: 0,
    oldestReadySeconds: null,
    failedByName: [],
  };
  try {
    const [totals] = await ctx.db.execute<{
      ready: number;
      active: number;
      retry: number;
      failed: number;
      lag: number | null;
    }>(sql`
      select count(*) filter (where state = 'created' and start_after <= now())::int as ready,
             count(*) filter (where state = 'active')::int as active,
             count(*) filter (where state = 'retry')::int as retry,
             count(*) filter (where state = 'failed' and completed_on > now() - interval '24 hours')::int as failed,
             extract(epoch from now() - min(created_on) filter (where state in ('created', 'retry') and start_after <= now())) as lag
        from pgboss.job`);
    const failed = await ctx.db.execute<{ name: string; n: number; last: Date | null }>(sql`
      select name, count(*)::int as n, max(completed_on) as last
        from pgboss.job
       where state = 'failed' and completed_on > now() - interval '24 hours'
       group by name order by n desc, name limit 20`);
    return {
      available: true,
      ready: totals?.ready ?? 0,
      active: totals?.active ?? 0,
      retry: totals?.retry ?? 0,
      failed24h: totals?.failed ?? 0,
      oldestReadySeconds: totals?.lag == null ? null : Math.round(Number(totals.lag)),
      failedByName: failed.map((r) => ({ name: r.name, count: r.n, lastAt: iso(r.last) })),
    };
  } catch {
    return none;
  }
}

async function databaseDetail(ctx: Ctx): Promise<DatabaseDetail> {
  try {
    const [size] = await ctx.db.execute<{ bytes: string }>(
      sql`select pg_database_size(current_database())::text as bytes`,
    );
    const tables = await ctx.db.execute<{ name: string; bytes: string; rows: string }>(sql`
      select c.relname as name, pg_total_relation_size(c.oid)::text as bytes, greatest(c.reltuples, 0)::bigint::text as rows
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       order by pg_total_relation_size(c.oid) desc limit 8`);
    return {
      available: true,
      sizeBytes: Number(size?.bytes ?? 0),
      tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes), rows: Number(t.rows) })),
    };
  } catch {
    return { available: false, sizeBytes: null, tables: [] };
  }
}

async function heartbeatDetail(ctx: Ctx, url: string | undefined): Promise<HeartbeatDetail> {
  try {
    const [r] = await ctx.db.execute<{ ok: Date | null; failed: Date | null }>(sql`
      select max(completed_on) filter (where state = 'completed') as ok,
             max(completed_on) filter (where state = 'failed') as failed
        from pgboss.job where name = 'health.heartbeat'`);
    return { configured: !!url, lastRunAt: iso(r?.ok), lastFailedAt: iso(r?.failed) };
  } catch {
    return { configured: !!url, lastRunAt: null, lastFailedAt: null };
  }
}

/**
 * Načte stav systému. Smí jen vlastník (`settings.manage`); `getIntegrationStatus` a seznamy doručení a příchozích
 * událostí vyžadují `settings.integrations`, které má vlastník také.
 */
export async function loadSystemStatus(ctx: Ctx, deps: SystemStatusDeps): Promise<SystemStatus> {
  assertCan(ctx, "settings.manage");
  const now = deps.now?.() ?? new Date();
  const [
    health,
    backup,
    queue,
    database,
    heartbeat,
    integrations,
    failedDeliveries,
    failedInbound,
  ] = await Promise.all([
    getHealth({
      db: ctx.db as Db,
      dataDir: deps.dataDir,
      version: deps.version,
      backupStatusFile: deps.backupStatusFile,
      now: () => now,
    }),
    readBackupDetail(deps.backupStatusFile),
    queueDetail(ctx),
    databaseDetail(ctx),
    heartbeatDetail(ctx, deps.heartbeatUrl),
    getIntegrationStatus(ctx, deps.cipher),
    listDeliveries(ctx, { status: "failed", limit: 50 }),
    listInboundEvents(ctx, { status: "failed", limit: 50 }),
  ]);
  const attention =
    health.problems.length +
    integrations.problems +
    (backup.lastError ? 1 : 0) +
    (backup.configured && !backup.readable ? 1 : 0);
  return {
    generatedAt: now.toISOString(),
    version: deps.version,
    health,
    heartbeat,
    backup,
    database,
    queue,
    integrations,
    failedDeliveries,
    failedInbound,
    attention,
  };
}
