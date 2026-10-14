import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { recordAudit } from "../audit/audit";
import { createNotifications } from "../collab/notifications";
import { schema } from "../db/client";
import { queryRecords, resolveEntity, type ResolvedEntity } from "../entities/engine";
import { contentDisposition } from "../files/validate";
import { defineJob, type JobDef } from "../jobs/jobs";
import { enqueueDocumentMail, logDocumentMail } from "../mail/service";
import { createCtx, inTx } from "../rbac/context";
import { loadActor } from "../rbac/actor";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { can, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { localParts } from "../time/dates";
import { prepareEntityExport, exportColumns, type PreparedExport } from "./entity-export";
import { PDF_MAX_ROWS } from "./pdf-table";
import { csvFormatOf, exportHeaderOf, type ExportRuntime } from "./runtime";
import {
  exportFileStem,
  exportSpecSchema,
  specQuery,
  type ExportSpec,
  type ExportSpecInput,
} from "./spec";

export type ExportSource = "manual" | "schedule" | "dashboard";

/** Oprávnění potřebné k exportu entity: vlastní `permissions.export`, jinak čtení. */
const permissionOf = (e: ResolvedEntity) => e.def.permissions.export ?? e.def.permissions.read;

/** Nejvíc bajtů hotového souboru, který se drží v paměti při zpracování na pozadí. */
const MAX_FILE_BYTES = 150 * 1024 * 1024;
/** Největší soubor, který se pošle e-mailem jako příloha; větší jde jen odkazem na „Moje exporty“. */
export const MAIL_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
/** PDF se z velkých výběrů nedělá hned při stažení (skládá se v paměti). */
const PDF_SYNC_MAX_ROWS = 1_500;

const MIME: Record<string, string> = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export type StartedExport =
  | { mode: "stream"; runId: string; prepared: PreparedExport }
  | { mode: "queued"; runId: string; rows: number };

async function entityFor(ctx: Ctx, rt: ExportRuntime, key: string): Promise<ResolvedEntity> {
  const def = rt.registry.get(key);
  if (!def) throw new NotFoundError("Neznámý typ záznamu.");
  return resolveEntity(ctx.db, def);
}

const userIdOf = (ctx: Ctx): string => {
  if (!ctx.actor.userId) throw new PermissionError("Export vyžaduje přihlášeného uživatele.");
  return ctx.actor.userId;
};

export function parseSpec(raw: ExportSpecInput | unknown): ExportSpec {
  const r = exportSpecSchema.safeParse(raw);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Neplatné nastavení exportu.");
  return r.data;
}

/**
 * Zahájí export seznamu. Malý export se vrací hned jako stream; velký (nad `syncMaxRows`, u PDF nad 1 500 řádků) nebo
 * výslovně vyžádaný na pozadí se zařadí do fronty a hotový soubor čeká v „Moje exporty“. V obou případech vzniká záznam
 * o exportu (kdo, co, kolik řádků, filtry) a audit.
 */
export async function startExport(
  ctx: Ctx,
  rt: ExportRuntime,
  raw: ExportSpecInput,
  opts: {
    source?: ExportSource;
    templateId?: string | null;
    background?: boolean;
    label?: string;
  } = {},
): Promise<StartedExport> {
  const userId = userIdOf(ctx);
  const spec = parseSpec(raw);
  const entity = await entityFor(ctx, rt, spec.entity);
  if (!scopeOf(ctx, permissionOf(entity))) throw new PermissionError();
  // dotaz na počet ověří i filtr a oprávnění a hlídá, že export nemá víc než strop
  const query = specQuery(spec);
  const probe = await queryRecords(ctx, rt.registry, entity, { ...(query ?? {}), limit: 1 });
  await exportColumns(ctx, rt.registry, entity, spec.columns);
  const total = probe.total;
  const syncMax =
    spec.format === "pdf"
      ? Math.min(PDF_SYNC_MAX_ROWS, rt.config.syncMaxRows)
      : rt.config.syncMaxRows;
  const label = opts.label ?? entity.def.label.many;
  const stem = exportFileStem(spec.fileName, `${label.toLowerCase()}`);
  const background = !!opts.background || total > syncMax;

  if (!background) {
    const prepared = await prepareEntityExport(ctx, rt.registry, entity, {
      format: spec.format,
      ...(query ? { query } : {}),
      ...(spec.columns?.length ? { columns: spec.columns } : {}),
      ...(spec.maxRows ? { maxRows: spec.maxRows } : {}),
      fileName: spec.fileName,
      csv: await csvFormatOf(rt),
      ...(spec.format === "pdf" ? { header: await exportHeaderOf(rt) } : {}),
    });
    const [run] = await ctx.db
      .insert(schema.exportRun)
      .values({
        userId,
        source: opts.source ?? "manual",
        templateId: opts.templateId ?? null,
        entityType: entity.def.key,
        label,
        format: spec.format,
        fileName: prepared.filename,
        status: "done",
        rowCount: prepared.count,
        spec,
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning({ id: schema.exportRun.id });
    return { mode: "stream", runId: run!.id, prepared };
  }

  if (total > 50_000)
    throw new UserError(
      `Export má ${total.toLocaleString("cs-CZ")} záznamů, nejvýš jich lze exportovat 50 000. Zúžte filtr nebo období.`,
    );
  if (spec.format === "pdf" && total > PDF_MAX_ROWS)
    throw new UserError(
      `PDF jde vytvořit nejvýš z ${PDF_MAX_ROWS.toLocaleString("cs-CZ")} záznamů (tento výběr má ${total.toLocaleString("cs-CZ")}). Zúžte filtr, nebo zvolte Excel či CSV.`,
    );
  const run = await createQueuedRun(ctx, rt, {
    userId,
    source: opts.source ?? "manual",
    templateId: opts.templateId ?? null,
    entityType: entity.def.key,
    label,
    spec,
    fileName: `${stem}.${spec.format}`,
    deliverEmail: false,
  });
  return { mode: "queued", runId: run, rows: total };
}

export type QueuedRunValues = {
  userId: string;
  source: ExportSource;
  templateId: string | null;
  scheduleId?: string | null;
  periodKey?: string | null;
  entityType: string;
  label: string;
  spec: ExportSpec;
  fileName: string;
  deliverEmail: boolean;
};

/**
 * Vloží záznam o exportu na pozadí (bez odeslání do fronty, aby šlo volat v transakci). Export téže periody plánu pro
 * téhož uživatele už existuje = `null` (idempotence plánovače).
 */
export async function insertQueuedRun(ctx: Ctx, v: QueuedRunValues): Promise<string | null> {
  const [run] = await ctx.db
    .insert(schema.exportRun)
    .values({
      userId: v.userId,
      source: v.source,
      templateId: v.templateId,
      scheduleId: v.scheduleId ?? null,
      periodKey: v.periodKey ?? null,
      entityType: v.entityType,
      label: v.label,
      format: v.spec.format,
      fileName: v.fileName,
      status: "queued",
      spec: v.spec,
      deliverEmail: v.deliverEmail,
    })
    .onConflictDoNothing()
    .returning({ id: schema.exportRun.id });
  return run?.id ?? null;
}

/** Založí záznam o exportu na pozadí a pošle úlohu do fronty. */
export async function createQueuedRun(
  ctx: Ctx,
  rt: Pick<ExportRuntime, "queue">,
  v: QueuedRunValues,
): Promise<string> {
  const id = await insertQueuedRun(ctx, v);
  if (!id) throw new UserError("Tento export už byl pro dané období vytvořen.");
  await rt.queue.send(exportRunJob, { runId: id });
  return id;
}

/* ---------- úloha na pozadí ---------- */

export const exportRunJob: JobDef<z.ZodObject<{ runId: z.ZodUUID }>, ExportRuntime> = defineJob({
  name: "export.run",
  schema: z.object({ runId: z.uuid() }),
  retryLimit: 1,
  keepCompletedSeconds: 600,
  async handler(rt, { runId }) {
    await executeRun(rt, runId);
  },
});

async function collect(chunks: AsyncIterable<Buffer>): Promise<Buffer> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const c of chunks) {
    size += c.length;
    if (size > MAX_FILE_BYTES)
      throw new UserError("Export je příliš velký. Zúžte filtr nebo období.");
    parts.push(c);
  }
  return Buffer.concat(parts);
}

const dayText = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
};

/**
 * Provede export na pozadí s právy uživatele, který ho zadal (jeho aktuální role a oprávnění, ne systému): kdo mezitím
 * přišel o právo, dostane chybu. Soubor se uloží do úložiště do konce doby uchování, uživatel dostane upozornění
 * a případně e-mail. Opakované spuštění téhož exportu nic nezdvojí.
 */
export async function executeRun(rt: ExportRuntime, runId: string): Promise<void> {
  const [run] = await rt.db.select().from(schema.exportRun).where(eq(schema.exportRun.id, runId));
  if (!run) return;
  if (run.status === "done" || run.status === "expired") return;
  // běžící export neberou dva procesy najednou; po pádu workeru (déle než 15 minut) se převezme
  const claimed = await rt.db
    .update(schema.exportRun)
    .set({ status: "running", startedAt: new Date(), error: null })
    .where(
      and(
        eq(schema.exportRun.id, runId),
        sql`(${schema.exportRun.status} in ('queued', 'failed') or (${schema.exportRun.status} = 'running' and ${schema.exportRun.startedAt} < now() - interval '15 minutes'))`,
      ),
    )
    .returning({ id: schema.exportRun.id });
  if (!claimed.length) return;

  const fail = async (message: string) => {
    await rt.db
      .update(schema.exportRun)
      .set({ status: "failed", error: message.slice(0, 500), finishedAt: new Date() })
      .where(eq(schema.exportRun.id, runId));
    await createNotifications(rt.db, [
      {
        userId: run.userId,
        kind: "export_failed",
        title: `Export „${run.label}“ se nepodařil`,
        body: message.slice(0, 300),
        url: "/nastaveni/exporty",
      },
    ]);
  };

  try {
    const actor = await loadActor(rt.db, run.userId, { catalog: rt.catalog });
    if (!actor) return fail("Uživatel už není aktivní, export nebyl proveden.");
    const ctx = createCtx(rt.db, { ...actor, restriction: null });
    const spec = parseSpec(run.spec);
    const entity = await entityFor(ctx, rt, spec.entity);
    const query = specQuery(spec);
    const prepared = await prepareEntityExport(ctx, rt.registry, entity, {
      format: spec.format,
      ...(query ? { query } : {}),
      ...(spec.columns?.length ? { columns: spec.columns } : {}),
      ...(spec.maxRows ? { maxRows: spec.maxRows } : {}),
      fileName: spec.fileName,
      csv: await csvFormatOf(rt),
      ...(spec.format === "pdf" ? { header: await exportHeaderOf(rt) } : {}),
    });
    const buffer = await collect(prepared.chunks);
    const key = `exports/${run.id}.${spec.format}`;
    if (await rt.storage.exists(key)) await rt.storage.delete(key);
    await rt.storage.put(key, buffer);
    const expiresAt = new Date(Date.now() + rt.config.retentionDays * 86_400_000);
    await rt.db
      .update(schema.exportRun)
      .set({
        status: "done",
        rowCount: prepared.count,
        sizeBytes: buffer.length,
        fileKey: key,
        fileName: prepared.filename,
        finishedAt: new Date(),
        expiresAt,
      })
      .where(eq(schema.exportRun.id, runId));
    const until = dayText(localParts(expiresAt).date);
    // doručení e-mailem je samo upozornění; jinak dostane uživatel upozornění v aplikaci
    if (run.deliverEmail) await mailRun(rt, run, prepared.filename, buffer, until);
    else
      await createNotifications(rt.db, [
        {
          userId: run.userId,
          kind: "export_ready",
          title: `Export „${run.label}“ je připraven`,
          body: `${prepared.count.toLocaleString("cs-CZ")} záznamů, ke stažení do ${until}.`,
          url: "/nastaveni/exporty",
        },
      ]);
  } catch (err) {
    const user =
      err instanceof UserError || err instanceof PermissionError || err instanceof NotFoundError;
    await fail(user ? (err as Error).message : "Export se nepodařilo dokončit, zkuste to znovu.");
    if (!user) throw err;
  }
}

async function mailRun(
  rt: ExportRuntime,
  run: typeof schema.exportRun.$inferSelect,
  fileName: string,
  buffer: Buffer,
  until: string,
) {
  const [u] = await rt.db
    .select({ email: schema.user.email, name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, run.userId));
  if (!u?.email) return;
  const attach = buffer.length <= MAIL_ATTACHMENT_MAX_BYTES;
  const stop = run.scheduleId ? `${rt.baseURL}/nastaveni/exporty?plan=${run.scheduleId}` : null;
  const body = [
    `Dobrý den, ${u.name.split(" ")[0]},`,
    "",
    attach
      ? `v příloze je export „${run.label}“ (${(run.rowCount ?? 0).toLocaleString("cs-CZ")} záznamů).`
      : `export „${run.label}“ je velký, proto nepřikládáme soubor. Stáhnout ho můžete do ${until} v Nastavení → Exporty: ${rt.baseURL}/nastaveni/exporty`,
    "",
    "Obsah exportu odpovídá vašim oprávnění v systému.",
    ...(stop ? ["", `Odhlásit se z tohoto plánovaného exportu: ${stop}`] : []),
  ].join("\n");
  const mail = {
    to: u.email,
    subject: `Export: ${run.label}`,
    body,
    ...(attach
      ? {
          attachments: [
            { name: fileName, mime: MIME[run.format] ?? "application/octet-stream", data: buffer },
          ],
        }
      : {}),
  };
  const logId = await logDocumentMail(rt.db, mail);
  await enqueueDocumentMail(
    { db: rt.db, queue: rt.queue, cipher: rt.cipher, storage: rt.storage },
    logId,
    mail,
  );
}

/* ---------- Moje exporty ---------- */

export type RunSummary = {
  id: string;
  label: string;
  format: string;
  fileName: string;
  source: string;
  status: string;
  rowCount: number | null;
  sizeBytes: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  downloadable: boolean;
  userName: string;
  mine: boolean;
};

/** Moje exporty (nebo všechny, s `exports.manage`), nejnovější první. */
export async function listRuns(
  ctx: Ctx,
  opts: { all?: boolean; limit?: number } = {},
): Promise<RunSummary[]> {
  const userId = userIdOf(ctx);
  if (opts.all && !can(ctx, "exports.manage")) throw new PermissionError();
  const rows = await ctx.db
    .select({ r: schema.exportRun, userName: schema.user.name })
    .from(schema.exportRun)
    .innerJoin(schema.user, eq(schema.user.id, schema.exportRun.userId))
    .where(opts.all ? undefined : eq(schema.exportRun.userId, userId))
    .orderBy(desc(schema.exportRun.createdAt))
    .limit(Math.min(opts.limit ?? 100, 300));
  const now = Date.now();
  return rows.map(({ r, userName }) => ({
    id: r.id,
    label: r.label,
    format: r.format,
    fileName: r.fileName,
    source: r.source,
    status: r.status,
    rowCount: r.rowCount,
    sizeBytes: r.sizeBytes,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    downloadable:
      r.status === "done" &&
      !!r.fileKey &&
      (!r.expiresAt || r.expiresAt.getTime() > now) &&
      r.userId === userId,
    userName,
    mine: r.userId === userId,
  }));
}

/**
 * Soubor hotového exportu ke stažení. Jen autor exportu: obsah odpovídá jeho oprávněním, cizí (i správce) ho
 * nedostane, ať se data nedostanou k někomu s menšími právy (správce vidí jen záznam o exportu).
 */
export async function openRunFile(ctx: Ctx, rt: Pick<ExportRuntime, "storage" | "db">, id: string) {
  const userId = userIdOf(ctx);
  const [run] = await ctx.db
    .select()
    .from(schema.exportRun)
    .where(and(eq(schema.exportRun.id, id), eq(schema.exportRun.userId, userId)));
  if (!run) throw new NotFoundError("Export nenalezen.");
  if (run.status !== "done" || !run.fileKey) throw new UserError("Export ještě není hotový.");
  if (run.expiresAt && run.expiresAt.getTime() <= Date.now())
    throw new UserError("Platnost exportu vypršela, spusťte ho znovu.");
  const stream = await rt.storage.get(run.fileKey).catch(() => {
    throw new UserError("Soubor exportu už není k dispozici, spusťte export znovu.");
  });
  await inTx(ctx, (c) =>
    recordAudit(c, {
      action: "download",
      entityType: "export_run",
      entityId: run.id,
      summary: `Stažení exportu „${run.label}“`,
    }),
  );
  return {
    stream,
    filename: run.fileName,
    mime: MIME[run.format] ?? "application/octet-stream",
    size: run.sizeBytes,
    disposition: contentDisposition(run.fileName, false),
  };
}

/** Smaže soubor exportu (záznam o exportu zůstává jako doklad). */
export async function deleteRunFile(ctx: Ctx, rt: Pick<ExportRuntime, "storage">, id: string) {
  const userId = userIdOf(ctx);
  const [run] = await ctx.db.select().from(schema.exportRun).where(eq(schema.exportRun.id, id));
  if (!run || (run.userId !== userId && !can(ctx, "exports.manage")))
    throw new NotFoundError("Export nenalezen.");
  if (run.fileKey) await rt.storage.delete(run.fileKey).catch(() => {});
  await ctx.db
    .update(schema.exportRun)
    .set({ status: run.status === "done" ? "expired" : run.status, fileKey: null })
    .where(eq(schema.exportRun.id, id));
}

/** Denní úklid: soubory po uplynutí doby uchování se smažou, zaseknuté exporty se označí jako neúspěšné. */
export async function cleanupRuns(
  rt: Pick<ExportRuntime, "db" | "storage">,
): Promise<{ removed: number; stuck: number }> {
  const expired = await rt.db
    .select({ id: schema.exportRun.id, key: schema.exportRun.fileKey })
    .from(schema.exportRun)
    .where(and(isNotNull(schema.exportRun.fileKey), lt(schema.exportRun.expiresAt, new Date())))
    .limit(500);
  for (const r of expired) {
    if (r.key) await rt.storage.delete(r.key).catch(() => {});
    await rt.db
      .update(schema.exportRun)
      .set({ status: "expired", fileKey: null })
      .where(eq(schema.exportRun.id, r.id));
  }
  const stuck = await rt.db
    .update(schema.exportRun)
    .set({
      status: "failed",
      error: "Zpracování se přerušilo, spusťte export znovu.",
      finishedAt: new Date(),
    })
    .where(
      and(
        inArray(schema.exportRun.status, ["queued", "running"]),
        lt(schema.exportRun.createdAt, new Date(Date.now() - 2 * 3_600_000)),
      ),
    )
    .returning({ id: schema.exportRun.id });
  return { removed: expired.length, stuck: stuck.length };
}

export const exportCleanupJob: JobDef<
  z.ZodObject<Record<string, never>>,
  ExportRuntime
> = defineJob({
  name: "export.cleanup",
  schema: z.object({}),
  cron: "50 3 * * *",
  retryLimit: 1,
  keepCompletedSeconds: 600,
  async handler(rt) {
    await cleanupRuns(rt);
  },
});
