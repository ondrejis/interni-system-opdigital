import type { XlsxColumnType } from "../export/xlsx";
import { formatValue } from "./format";
import type { TableColumn, ValueFormat, WidgetResult } from "./types";

export type ResultTable = {
  columns: { header: string; type: XlsxColumnType }[];
  rows: unknown[][];
  /** Řádek součtů nebo poznámky se nepoužívá; jen data widgetu. */
};

const typeOf = (f: ValueFormat): XlsxColumnType =>
  f === "money" ? "money" : f === "percent" ? "number" : "number";

/** Hodnota v jednotkách vhodných pro buňku tabulky (minuty se převedou na hodiny, ať je v Excelu číslo). */
const cellValue = (f: ValueFormat, v: number | null): number | null =>
  v === null ? null : f === "minutes" ? Math.round((v / 60) * 100) / 100 : v;

const headerSuffix = (f: ValueFormat) =>
  f === "minutes" || f === "hours" ? " (h)" : f === "percent" ? " (%)" : "";

const COLUMN: Record<TableColumn["type"], XlsxColumnType> = {
  text: "text",
  money: "money",
  number: "number",
  percent: "number",
  date: "date",
  minutes: "number",
  hours: "number",
  status: "text",
};

/**
 * Data widgetu jako tabulka pro CSV / XLSX (typovaně: částky jako částky, data jako data). Co widget zobrazuje, to se
 * exportuje, nic navíc, takže export nemůže prozradit víc než samotný widget.
 */
export function resultToTable(result: WidgetResult, title: string): ResultTable {
  switch (result.kind) {
    case "kpi": {
      const f = result.format;
      return {
        columns: [
          { header: "Ukazatel", type: "text" },
          { header: `Hodnota${headerSuffix(f)}`, type: typeOf(f) },
          ...(result.previous !== undefined
            ? [
                { header: `Předchozí období${headerSuffix(f)}`, type: typeOf(f) },
                { header: "Změna (%)", type: "number" as const },
              ]
            : []),
        ],
        rows: [
          [
            title,
            result.text ?? cellValue(f, result.value),
            ...(result.previous !== undefined
              ? [cellValue(f, result.previous ?? null), result.delta?.pct ?? null]
              : []),
          ],
        ],
      };
    }
    case "gauge": {
      const f = result.format;
      return {
        columns: [
          { header: "Ukazatel", type: "text" },
          { header: `Hodnota${headerSuffix(f)}`, type: typeOf(f) },
          { header: `Cíl${headerSuffix(f)}`, type: typeOf(f) },
          { header: "Plnění cíle (%)", type: "number" },
        ],
        rows: [[title, cellValue(f, result.value), cellValue(f, result.target), result.pct]],
      };
    }
    case "chart": {
      const f = result.format;
      return {
        columns: [
          { header: "Skupina", type: "text" },
          ...result.series.map((s) => ({
            header: `${s.label}${headerSuffix(f)}`,
            type: typeOf(f),
          })),
        ],
        rows: result.categories.map((c, i) => [
          c.label,
          ...result.series.map((s) => cellValue(f, s.values[i] ?? null)),
        ]),
      };
    }
    case "status": {
      const f = result.format;
      return {
        columns: [
          { header: "Stav", type: "text" },
          { header: "Počet", type: "number" },
          { header: `Hodnota${headerSuffix(f)}`, type: typeOf(f) },
        ],
        rows: result.stages.map((s) => [s.name, s.count, cellValue(f, s.value)]),
      };
    }
    case "table":
      return {
        columns: result.columns.map((c) => ({ header: c.label, type: COLUMN[c.type] })),
        rows: result.rows.map((r) =>
          result.columns.map((c) => {
            const v = r.cells[c.key];
            if (v === undefined || v === null) return null;
            if (c.type === "minutes") return Math.round((Number(v) / 60) * 100) / 100;
            return v;
          }),
        ),
      };
    case "list":
      return {
        columns: [
          { header: "Název", type: "text" },
          { header: "Podrobnost", type: "text" },
          { header: "Termín", type: "date" },
          { header: "Stav", type: "text" },
        ],
        rows: result.items.map((i) => [
          i.title,
          i.subtitle ?? null,
          i.date ?? null,
          i.badge ?? null,
        ]),
      };
    case "attention":
      return {
        columns: [
          { header: "Důležitost", type: "text" },
          { header: "Co vyžaduje pozornost", type: "text" },
          { header: "Podrobnost", type: "text" },
        ],
        rows: result.items.map((i) => [
          { danger: "Vysoká", warning: "Střední", info: "Informace" }[i.severity],
          i.title,
          i.detail ?? null,
        ]),
      };
    case "tiles":
      return {
        columns: [
          { header: "Ukazatel", type: "text" },
          { header: "Hodnota", type: "text" },
          { header: "Poznámka", type: "text" },
        ],
        rows: result.tiles.map((t) => [t.title, t.value, t.hint ?? null]),
      };
    case "empty":
      return { columns: [{ header: "Zpráva", type: "text" }], rows: [[result.message]] };
  }
}

/** Textová podoba hodnoty buňky pro PDF a náhledy. */
export function cellText(
  type: TableColumn["type"],
  format: ValueFormat | undefined,
  v: unknown,
): string {
  if (v === null || v === undefined || v === "") return "";
  switch (type) {
    case "money":
      return formatValue("money", Number(v));
    case "percent":
      return formatValue("percent", Number(v));
    case "minutes":
      return formatValue("minutes", Number(v));
    case "hours":
      return formatValue("hours", Number(v));
    case "number":
      return formatValue(format === "money" ? "money" : "number", Number(v));
    case "date": {
      const [y, m, d] = String(v).slice(0, 10).split("-");
      return y && m && d ? `${Number(d)}. ${Number(m)}. ${y}` : String(v);
    }
    default:
      return String(v);
  }
}
