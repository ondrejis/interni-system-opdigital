import { recordAudit } from "../audit/audit";
import { schema } from "../db/client";
import {
  csvLines,
  csvMoney,
  csvNumber,
  csvSafeText,
  DEFAULT_CSV_FORMAT,
  type CsvFormat,
} from "../export/csv";
import { xlsxChunks } from "../export/xlsx";
import { exportFileStem } from "../export/spec";
import { inTx } from "../rbac/context";
import { PermissionError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";
import type { ResultTable } from "./result-table";

const dayText = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${Number(d)}. ${Number(m)}. ${y}` : iso;
};

/** CSV z dat widgetu (středník nebo čárka podle klienta, UTF-8 s BOM, ochrana proti vzorcům). */
export function tableToCsv(
  t: ResultTable,
  fmt: CsvFormat = DEFAULT_CSV_FORMAT,
): AsyncGenerator<Buffer> {
  return csvLines(
    t.columns.map((c) => c.header),
    t.rows.map((r) =>
      t.columns.map((c, i) => {
        const v = r[i];
        if (v === null || v === undefined || v === "") return "";
        if (c.type === "money") return csvMoney(Number(v), fmt);
        if (c.type === "number" || c.type === "percent") return csvNumber(Number(v), fmt);
        if (c.type === "date") return dayText(String(v));
        if (c.type === "bool") return v ? "ano" : "ne";
        return csvSafeText(String(v));
      }),
    ),
    fmt,
  );
}

/** XLSX z dat widgetu: částky jako částky, data jako data, čísla jako čísla. */
export function tableToXlsx(t: ResultTable, name: string, title?: string): AsyncGenerator<Buffer> {
  return xlsxChunks([{ name, ...(title ? { title } : {}), columns: t.columns, rows: t.rows }]);
}

/**
 * Stopa exportu z nástěnky (widget nebo celá nástěnka): záznam v „historii exportů“ a v auditu. Data samotná
 * se do záznamu neukládají, jen kdo, co, kolik řádků a s jakými filtry.
 */
export async function recordDashboardExport(
  ctx: Ctx,
  v: {
    label: string;
    format: string;
    rows: number;
    fileName: string;
    spec: Record<string, unknown>;
    boardId?: string;
  },
): Promise<void> {
  const userId = ctx.actor.userId;
  if (!userId) throw new PermissionError();
  await inTx(ctx, async (c) => {
    const [run] = await c.db
      .insert(schema.exportRun)
      .values({
        userId,
        source: "dashboard",
        entityType: v.boardId ? `dashboard:${v.boardId}` : "dashboard",
        label: v.label.slice(0, 120),
        format: v.format,
        fileName: v.fileName,
        status: "done",
        rowCount: v.rows,
        spec: v.spec,
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning({ id: schema.exportRun.id });
    await recordAudit(c, {
      action: "export",
      entityType: "dashboard",
      entityId: v.boardId ?? run!.id,
      summary: `Export z nástěnky „${v.label}“ (${v.format.toUpperCase()}): ${v.rows} řádků`,
      changes: [
        { field: "filtry", old: null, new: JSON.stringify(v.spec.filters ?? {}).slice(0, 1000) },
      ],
    });
  });
}

export const dashboardFileStem = (title: string) => exportFileStem(undefined, title.toLowerCase());
