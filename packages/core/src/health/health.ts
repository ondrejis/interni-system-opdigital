import fs from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";

export type HealthStatus = "ok" | "degraded" | "fail";

export type HealthReport = {
  status: HealthStatus;
  version: string;
  checkedAt: string;
  db: { ok: boolean; latencyMs: number | null };
  disk: { freeBytes: number; totalBytes: number; freePercent: number } | null;
  backup: {
    lastSuccessAt: string | null;
    ageHours: number | null;
    /** Poslední měsíční zkouška obnovy (jen když už nějaká proběhla). */
    restoreTest?: { at: string; ok: boolean; detail: string | null };
  } | null;
  queue: { oldestReadySeconds: number | null; failedLast24h: number | null } | null;
  problems: string[];
};

export type HealthDeps = {
  db: Db;
  /** Složka, jejíž disk se hlídá (úložiště souborů). */
  dataDir: string;
  version: string;
  /**
   * Soubor JSON `{"lastSuccessAt": "<ISO>", "restoreTest": {"at": "<ISO>", "ok": true, "detail": "…"}}`, který zálohovací
   * skript zapisuje po úspěšné záloze a po zkoušce obnovy.
   */
  backupStatusFile?: string | undefined;
  now?: () => Date;
};

const DISK_WARN_PERCENT = 15;
const DISK_FAIL_PERCENT = 5;
const BACKUP_STALE_HOURS = 36;
const QUEUE_LAG_WARN_SECONDS = 15 * 60;
/** Zkouška obnovy běží měsíčně; po 45 dnech bez ní se ozveme. */
const RESTORE_TEST_STALE_DAYS = 45;

async function checkDb(db: Db) {
  const t0 = performance.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, latencyMs: Math.round(performance.now() - t0) };
  } catch {
    return { ok: false, latencyMs: null };
  }
}

async function checkDisk(dir: string) {
  try {
    const s = await fs.statfs(dir);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return {
      freeBytes: free,
      totalBytes: total,
      freePercent: total ? Math.round((free / total) * 1000) / 10 : 0,
    };
  } catch {
    return null;
  }
}

async function checkBackup(file: string | undefined, now: Date): Promise<HealthReport["backup"]> {
  if (!file) return null;
  try {
    const { lastSuccessAt, restoreTest } = JSON.parse(await fs.readFile(file, "utf8")) as {
      lastSuccessAt?: string;
      restoreTest?: { at?: string; ok?: boolean; detail?: string | null };
    };
    const at = lastSuccessAt ? new Date(lastSuccessAt) : null;
    if (!at || Number.isNaN(at.getTime())) return { lastSuccessAt: null, ageHours: null };
    const testAt = restoreTest?.at ? new Date(restoreTest.at) : null;
    return {
      lastSuccessAt: at.toISOString(),
      ageHours: Math.round(((now.getTime() - at.getTime()) / 3_600_000) * 10) / 10,
      ...(testAt && !Number.isNaN(testAt.getTime())
        ? {
            restoreTest: {
              at: testAt.toISOString(),
              ok: restoreTest?.ok === true,
              detail: restoreTest?.detail ?? null,
            },
          }
        : {}),
    };
  } catch {
    return { lastSuccessAt: null, ageHours: null };
  }
}

async function checkQueue(db: Db) {
  try {
    const rows = await db.execute<{ lag: number | null; failed: number }>(sql`
      select extract(epoch from now() - (min(created_on) filter (where state in ('created', 'retry') and start_after <= now()))) as lag,
             count(*) filter (where state = 'failed' and completed_on > now() - interval '24 hours')::int as failed
        from pgboss.job`);
    const r = rows[0];
    return {
      oldestReadySeconds: r?.lag == null ? 0 : Math.round(Number(r.lag)),
      failedLast24h: r?.failed ?? 0,
    };
  } catch {
    return null;
  }
}

/** Stav systému pro `GET /api/health` a heartbeat: databáze, volné místo, záloha, zpoždění fronty. */
export async function getHealth(deps: HealthDeps): Promise<HealthReport> {
  const now = deps.now?.() ?? new Date();
  const [dbRes, disk, backup] = await Promise.all([
    checkDb(deps.db),
    checkDisk(deps.dataDir),
    checkBackup(deps.backupStatusFile, now),
  ]);
  const queue = dbRes.ok ? await checkQueue(deps.db) : null;

  const problems: string[] = [];
  let status: HealthStatus = "ok";
  const worsen = (to: HealthStatus, msg: string) => {
    problems.push(msg);
    if (to === "fail" || status === "ok")
      status = to === "fail" ? "fail" : status === "fail" ? "fail" : "degraded";
  };

  if (!dbRes.ok) worsen("fail", "Databáze neodpovídá.");
  if (!disk) worsen("degraded", "Nejde zjistit volné místo na disku.");
  else if (disk.freePercent < DISK_FAIL_PERCENT)
    worsen("fail", `Na disku zbývá jen ${disk.freePercent} %.`);
  else if (disk.freePercent < DISK_WARN_PERCENT)
    worsen("degraded", `Na disku zbývá ${disk.freePercent} %.`);
  if (backup && (backup.ageHours === null || backup.ageHours > BACKUP_STALE_HOURS)) {
    worsen(
      "degraded",
      backup.ageHours === null
        ? "Není záznam o úspěšné záloze."
        : `Poslední záloha je stará ${backup.ageHours} h.`,
    );
  }
  if (backup?.restoreTest) {
    const ageDays = (now.getTime() - new Date(backup.restoreTest.at).getTime()) / 86_400_000;
    if (!backup.restoreTest.ok)
      worsen(
        "degraded",
        `Zkouška obnovy ze zálohy selhala${backup.restoreTest.detail ? `: ${backup.restoreTest.detail}` : "."}`,
      );
    else if (ageDays > RESTORE_TEST_STALE_DAYS)
      worsen("degraded", `Poslední zkouška obnovy ze zálohy je stará ${Math.round(ageDays)} dní.`);
  }
  if (
    queue &&
    queue.oldestReadySeconds !== null &&
    queue.oldestReadySeconds > QUEUE_LAG_WARN_SECONDS
  ) {
    worsen("degraded", `Fronta úloh zaostává (${Math.round(queue.oldestReadySeconds / 60)} min).`);
  }
  if (queue && (queue.failedLast24h ?? 0) > 0)
    worsen("degraded", `Selhalo ${queue.failedLast24h} úloh za posledních 24 h.`);

  return {
    status,
    version: deps.version,
    checkedAt: now.toISOString(),
    db: dbRes,
    disk,
    backup,
    queue,
    problems,
  };
}

/**
 * Heartbeat pro agenturu: jen identifikátor instance, verze a stav — žádné osobní údaje ani obsah dat.
 * Vyhodí chybu při síťové chybě nebo odpovědi mimo 2xx (úloha se zopakuje).
 */
export async function sendHeartbeat(
  url: string,
  report: Pick<HealthReport, "status" | "version" | "problems">,
  instance: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      instance,
      version: report.version,
      status: report.status,
      problemCount: report.problems.length,
      at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Heartbeat: odpověď ${res.status}`);
}
