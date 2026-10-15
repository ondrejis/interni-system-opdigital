/*
  Stav napojení na n8n a test napojení pro Nastavení → Google Disk (NAS-10, NFR-13). Test nic neposílá do n8n a
  nezakládá složky: ověřuje nastavení OPSYS a poslední výsledky. Doručení webhooku zkouší „Test webhooku“ v
  Nastavení → Integrace.
*/
import { desc } from "drizzle-orm";
import type { Ctx } from "@rebar/core/rbac";
import { driveEndpoints } from "./endpoints";
import { readTitles } from "./entity-reader";
import { countByState } from "./facts";
import { callbackUrlOf, type DiskEnv } from "./payload";
import { visibleEntityIds } from "./privacy";
import { driveRequest } from "./schema";
import { isDriveEnabled, loadStructure } from "./settings";
import { validateStructure } from "./tree";
import {
  DRIVE_TIMEOUT_MINUTES,
  type DiskCheck,
  type DiskStatus,
  type DiskTestResult,
  type DriveRequestKind,
  type DriveRequestState,
} from "./types";
import { kindOfEvent } from "./facts";

const DAY = 24 * 3_600_000;

/** Napojení a poslední požadavky (jen pro `disk.manage`). */
export async function diskStatus(
  ctx: Ctx,
  env: DiskEnv,
  now: Date = new Date(),
): Promise<DiskStatus> {
  const [enabled, endpoints, counts7d, rows] = await Promise.all([
    isDriveEnabled(env.settings, ctx.db),
    driveEndpoints(ctx.db),
    countByState(ctx.db, new Date(now.getTime() - 7 * DAY)),
    ctx.db.select().from(driveRequest).orderBy(desc(driveRequest.id)).limit(25),
  ]);
  const lastDone = rows.find((r) => r.state === "done");
  const labels = new Map<string, string>();
  for (const type of ["company", "job"] as const) {
    const ids = rows.filter((r) => r.entityType === type).map((r) => r.entityId);
    const visible = await visibleEntityIds(ctx, env.registry, type, ids);
    const titles = await readTitles(ctx.db, env.registry, type, [...visible]);
    for (const [id, t] of titles) labels.set(`${type}:${id}`, t);
  }
  return {
    enabled,
    callbackUrl: callbackUrlOf(env.baseURL),
    endpoints,
    counts7d,
    lastDoneAt: lastDone?.doneAt?.toISOString() ?? null,
    recent: rows.map((r) => ({
      id: r.id,
      event: kindOfEvent(r.event) as DriveRequestKind,
      entityType: r.entityType as "company" | "job",
      entityId: r.entityId,
      label: labels.get(`${r.entityType}:${r.entityId}`) ?? null,
      state: r.state as DriveRequestState,
      error: r.error,
      attempts: r.attempts,
      isPrivate: r.isPrivate,
      requestedAt: r.requestedAt.toISOString(),
      doneAt: r.doneAt?.toISOString() ?? null,
    })),
  };
}

/** Test napojení: sada kontrol s výsledkem OK / upozornění / chyba a větou, co s tím. */
export async function diskTest(
  ctx: Ctx,
  env: DiskEnv,
  now: Date = new Date(),
): Promise<DiskTestResult> {
  const status = await diskStatus(ctx, env, now);
  const checks: DiskCheck[] = [];
  const add = (c: DiskCheck) => checks.push(c);

  add(
    status.enabled
      ? { key: "enabled", label: "Zakládání složek", status: "ok", detail: "Zapnuto." }
      : {
          key: "enabled",
          label: "Zakládání složek",
          status: "warn",
          detail: "Vypnuto: OPSYS neposílá n8n žádné události a nové složky nevznikají.",
        },
  );

  add(
    status.endpoints.length
      ? {
          key: "endpoint",
          label: "Webhook pro n8n",
          status: "ok",
          detail: `Událost Disku odebírá: ${status.endpoints.map((e) => e.name).join(", ")}.`,
        }
      : {
          key: "endpoint",
          label: "Webhook pro n8n",
          status: "error",
          detail:
            "Žádný aktivní webhook neodebírá události Google Disku. V Nastavení → Integrace přidejte webhook na adresu workflow v n8n a zvolte skupinu „Google Disk (složky)“.",
        },
  );

  if (status.endpoints.length)
    add(
      status.endpoints.some((e) => e.includePrivate)
        ? {
            key: "private",
            label: "Soukromé záznamy",
            status: "ok",
            detail: "Alespoň jeden webhook dostává i události soukromých záznamů.",
          }
        : {
            key: "private",
            label: "Soukromé záznamy",
            status: "warn",
            detail:
              "Žádný webhook nemá zapnuté „Doručovat i soukromé“: ručně založená složka soukromého klienta nebo zakázky se nevytvoří.",
          },
    );

  const secure = status.callbackUrl.startsWith("https://");
  const local = /\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(status.callbackUrl);
  add(
    secure && !local
      ? {
          key: "callback",
          label: "Adresa pro odpověď n8n",
          status: "ok",
          detail: status.callbackUrl,
        }
      : {
          key: "callback",
          label: "Adresa pro odpověď n8n",
          status: "warn",
          detail: `${status.callbackUrl}: n8n ji z internetu nedosáhne, dokud aplikace neběží na veřejné adrese přes HTTPS.`,
        },
  );

  const { structure } = await loadStructure(env.settings, ctx.db);
  const problems = validateStructure(structure);
  add(
    problems.length
      ? { key: "structure", label: "Strom složek", status: "error", detail: problems[0]! }
      : { key: "structure", label: "Strom složek", status: "ok", detail: "Platný." },
  );

  const failed = status.counts7d.error + status.counts7d.timeout;
  add(
    failed
      ? {
          key: "failures",
          label: "Poslední požadavky",
          status: "warn",
          detail: `${failed} požadavků za 7 dní skončilo chybou nebo vypršelo (lhůta ${DRIVE_TIMEOUT_MINUTES} minut). Detail je ve výpisu níže.`,
        }
      : {
          key: "failures",
          label: "Poslední požadavky",
          status: "ok",
          detail: `Bez chyb za 7 dní (hotovo ${status.counts7d.done}, čeká ${status.counts7d.pending + status.counts7d.sent}).`,
        },
  );

  add({
    key: "lastDone",
    label: "Poslední odpověď n8n",
    status: status.lastDoneAt ? "ok" : "warn",
    detail: status.lastDoneAt
      ? `Naposledy ${new Date(status.lastDoneAt).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}.`
      : "n8n zatím nevrátilo žádnou odpověď. Založte zkušebního klienta se stavem Lead a zkontrolujte, že se složka vytvoří.",
  });

  return { ok: checks.every((c) => c.status !== "error"), checks };
}
