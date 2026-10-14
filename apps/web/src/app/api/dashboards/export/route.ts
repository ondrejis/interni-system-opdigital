import { z } from "zod";
import {
  describeFilters,
  evaluateWidget,
  filtersFromSearch,
  getBoard,
  periodOf,
  recordDashboardExport,
  renderDashboardPdf,
  resultToTable,
  dashboardFileStem,
  tableToCsv,
  tableToXlsx,
} from "@rebar/core/dashboards";
import { PERIOD_LABELS, PERIOD_PRESETS } from "@rebar/core/dashboards-shared";
import { visibleRecordTitles } from "@rebar/core/entities";
import { csvFormatOf, exportHeaderOf, toWebStream, XLSX_MIME } from "@rebar/core/export";
import { schema } from "@rebar/core/db";
import { contentDisposition } from "@rebar/core/files";
import { UserError } from "@rebar/core/rbac";
import { todayIso, localParts } from "@rebar/core/time";
import { eq } from "drizzle-orm";
import { ctxFromRequest, errorResponse, sameOriginOrFail } from "@/server/http";
import { dashboardsEnabled, getDashboardEnv } from "@/server/dashboards";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

const filters = z
  .object({
    period: z.enum(PERIOD_PRESETS).default("all"),
    from: z.string().max(10).optional(),
    to: z.string().max(10).optional(),
    jobId: z.string().max(40).optional(),
    userId: z.string().max(40).optional(),
  })
  .default({ period: "all" });

const body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("widget"),
    widget: z.unknown(),
    filters,
    format: z.enum(["csv", "xlsx"]),
  }),
  z.object({ kind: z.literal("board"), boardId: z.uuid(), filters, format: z.literal("pdf") }),
]);

function cleanFilters(f: z.output<typeof filters>) {
  return filtersFromSearch((k) => {
    const m: Record<string, string | undefined> = {
      obdobi: f.period,
      od: f.from,
      do: f.to,
      zakazka: f.jobId,
      osoba: f.userId,
    };
    return m[k];
  });
}

const file = (name: string, mime: string, chunks: AsyncGenerator<Buffer>, rows: number) =>
  new Response(toWebStream(chunks), {
    headers: {
      "content-type": mime,
      "content-disposition": contentDisposition(name, false),
      "x-export-count": String(rows),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });

/**
 * Export z nástěnky: data jednoho widgetu do CSV / XLSX nebo snímek celé nástěnky do PDF. Obsah se vždy počítá znovu
 * s oprávněními přihlášeného, takže export neobsahuje nic, co by uživatel na nástěnce neviděl.
 */
export async function POST(req: Request) {
  const bad = sameOriginOrFail(req);
  if (bad) return bad;
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    if (!dashboardsEnabled()) throw new UserError("Nástěnky jsou vypnuté.");
    const input = body.parse(await req.json());
    const s = getServices();
    const env = getDashboardEnv();
    const f = cleanFilters(input.filters);

    if (input.kind === "widget") {
      const outcome = await evaluateWidget(ctx, env, input.widget, f, { fresh: true });
      if (!outcome.ok) throw new UserError(outcome.error);
      const title = String((input.widget as { title?: unknown }).title ?? "widget");
      const table = resultToTable(outcome.result, title);
      const stem = dashboardFileStem(title);
      const name = `${stem}.${input.format}`;
      await recordDashboardExport(ctx, {
        label: title,
        format: input.format,
        rows: table.rows.length,
        fileName: name,
        spec: { kind: "widget", filters: f },
      });
      return input.format === "csv"
        ? file(
            name,
            "text/csv;charset=utf-8",
            tableToCsv(table, await csvFormatOf(s.exportRuntime)),
            table.rows.length,
          )
        : file(
            name,
            XLSX_MIME,
            tableToXlsx(
              table,
              title.slice(0, 31),
              `${title} · export ${localParts(new Date()).date}`,
            ),
            table.rows.length,
          );
    }

    const board = await getBoard(ctx, input.boardId);
    const outcomes = await Promise.all(
      board.definition.widgets.map((w) => evaluateWidget(ctx, env, w, f, { fresh: true })),
    );
    const today = todayIso();
    const range = periodOf(f, today);
    const job = f.jobId
      ? (await visibleRecordTitles(ctx, s.registry, "job", [f.jobId]))[f.jobId]
      : undefined;
    const [user] = f.userId
      ? await ctx.db
          .select({ name: schema.user.name })
          .from(schema.user)
          .where(eq(schema.user.id, f.userId))
      : [];
    const pdf = await renderDashboardPdf({
      title: board.summary.name,
      header: await exportHeaderOf(s.exportRuntime),
      filterText: describeFilters(
        { period: f.period, from: f.from, to: f.to },
        { range, job, user: user?.name },
      ),
      widgets: board.definition.widgets.map((w, i) => ({
        id: w.id,
        title: w.title,
        w: w.w,
        outcome: outcomes[i]!,
      })),
      generatedAt: `Vytvořeno ${localParts(new Date()).date} ${localParts(new Date()).time} · ${PERIOD_LABELS[f.period]}`,
    });
    const name = `${dashboardFileStem(board.summary.name)}.pdf`;
    await recordDashboardExport(ctx, {
      label: board.summary.name,
      format: "pdf",
      rows: board.definition.widgets.length,
      fileName: name,
      spec: { kind: "board", filters: f },
      boardId: input.boardId,
    });
    return file(
      name,
      "application/pdf",
      (async function* () {
        yield pdf;
      })(),
      board.definition.widgets.length,
    );
  } catch (err) {
    return errorResponse(err);
  }
}
