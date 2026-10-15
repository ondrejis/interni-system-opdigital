import { recordAudit } from "../audit/audit";
import { describeEntity } from "../entities/describe";
import {
  queryRecords,
  type EntityRegistry,
  type QueryInput,
  type ResolvedEntity,
} from "../entities/engine";
import type { FilterGroup } from "../entities/operators";
import type { Labels, RecordRow } from "../entities/types";
import type { AttributeDescriptor } from "../entities/shared";
import { formatDate, formatMinor, formatNumberUnit } from "../entities/shared";
import { inTx } from "../rbac/context";
import { PermissionError, UserError } from "../rbac/errors";
import { canSeePrivate, scopeOf } from "../rbac/permissions";
import { localParts } from "../time/dates";
import type { Ctx } from "../rbac/types";
import {
  csvLines,
  csvMoney,
  csvNumber,
  csvSafeText,
  DEFAULT_CSV_FORMAT,
  type CsvFormat,
} from "./csv";
import { renderTablePdf, PDF_MAX_ROWS, type ExportHeader } from "./pdf-table";
import { exportFileStem, type ExportFormat } from "./spec";
import { xlsxChunks, XLSX_MIME, type XlsxColumn } from "./xlsx";

/** Nejvíc řádků jednoho exportu; víc se do souboru nehodí (a Excel jich unese přes milion). */
export const EXPORT_MAX_ROWS = 50_000;
const PAGE = 200;

export type { ExportFormat };

export type EntityExportOptions = {
  format: ExportFormat;
  /** Oddělovač CSV (z konfigurace klienta); výchozí středník. */
  csv?: CsvFormat;
  /** Název souboru bez přípony (`{datum}` se nahradí dnešním datem). */
  fileName?: string | undefined;
  /** Hlavička PDF (název systému a údaje o firmě). */
  header?: ExportHeader;
  /** Zápis do auditu (výchozí ano); vypíná se jen tam, kde audit zapisuje volající. */
  audit?: boolean;

  /** Filtr, hledání a řazení z aktuálního pohledu; export vezme celou filtrovanou sadu, ne jen zobrazené řádky. */
  query?: Pick<QueryInput, "filters" | "sort" | "q">;
  /** Sloupce v pořadí; bez nich se vezmou výchozí viditelné. Skryté (bez oprávnění) a neznámé sloupce se odmítnou. */
  columns?: readonly string[];
  maxRows?: number;
};

export type PreparedExport = {
  filename: string;
  mime: string;
  /** Počet exportovaných záznamů. */
  count: number;
  chunks: AsyncGenerator<Buffer>;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Typ sloupce XLSX podle atributu: čísla zůstanou čísly, peníze mají formát měny, data jsou data. */
function xlsxType(a: AttributeDescriptor): XlsxColumn["type"] {
  switch (a.type) {
    case "currency":
      return "money";
    case "number":
      return a.unit ? "percent" : "number";
    case "date":
      return "date";
    default:
      return "text";
  }
}

const labelOf = (labels: Labels, key: string, id: unknown) =>
  typeof id === "string" ? (labels[key]?.[id]?.label ?? "") : "";

/** Hodnota buňky pro XLSX podle typu atributu (čísla jako čísla, text jako text). */
function xlsxValue(a: AttributeDescriptor, v: unknown, labels: Labels): unknown {
  if (v === null || v === undefined) return null;
  switch (a.type) {
    case "currency":
    case "date":
      return v;
    case "number":
      // `percent_bp` je uloženo v setinách procenta, v tabulce se ukazuje v procentech
      return a.unit === "percent_bp" ? Number(v) / 100 : Number(v);
    default:
      return textValue(a, v, labels);
  }
}

/** Text hodnoty (stejný jako v tabulce v aplikaci, ale bez nezlomitelných mezer a formátování měny). */
function textValue(a: AttributeDescriptor, v: unknown, labels: Labels): string {
  if (v === null || v === undefined) return "";
  switch (a.type) {
    case "status":
      return a.stages?.find((s) => s.id === v)?.name ?? "";
    case "select":
      return a.choices?.find((c) => c.value === v)?.label ?? String(v);
    case "multiselect":
      return (Array.isArray(v) ? (v as string[]) : [])
        .map((x) => a.choices?.find((c) => c.value === x)?.label ?? x)
        .join(", ");
    case "user":
    case "record":
      return labelOf(labels, a.key, v);
    case "checkbox":
      return v ? "ano" : "ne";
    case "date":
      return formatDate(String(v));
    case "number":
      return a.unit ? formatNumberUnit(a.unit, Number(v)).replace(/\u00a0/g, " ") : String(v);
    default:
      return String(v);
  }
}

/** Hodnota buňky CSV: čísla s desetinnou čárkou (česká verze Excelu), text zabezpečený proti vzorcům. */
function csvValue(a: AttributeDescriptor, v: unknown, labels: Labels, fmt: CsvFormat): string {
  if (v === null || v === undefined || v === "") return "";
  switch (a.type) {
    case "currency":
      return csvMoney(Number(v), fmt);
    case "number":
      return csvNumber(a.unit === "percent_bp" ? Number(v) / 100 : Number(v), fmt);
    default:
      return csvSafeText(textValue(a, v, labels));
  }
}

/** Hodnota buňky PDF: stejný text jako v tabulce v aplikaci (částky v korunách, česká data). */
function pdfValue(a: AttributeDescriptor, v: unknown, labels: Labels): string {
  if (v === null || v === undefined || v === "") return "";
  if (a.type === "currency") return formatMinor(Number(v));
  return textValue(a, v, labels);
}

/**
 * Sloupce exportu: zadané v pořadí, jinak výchozí viditelné. Skryté (bez oprávnění) a neznámé sloupce se odmítnou, takže
 * export nikdy neobsahuje víc než seznam v aplikaci.
 */
export async function exportColumns(
  ctx: Ctx,
  registry: EntityRegistry,
  entity: ResolvedEntity,
  columns?: readonly string[],
) {
  const descriptor = await describeEntity(ctx, ctx.db, entity, registry);
  const byKey = new Map(descriptor.attributes.map((a) => [a.key, a]));
  const keys = columns?.length
    ? [...columns]
    : [
        descriptor.titleKey,
        ...descriptor.attributes
          .filter((a) => a.defaultVisible && a.key !== descriptor.titleKey)
          .map((a) => a.key),
      ];
  const unknown = keys.filter((k) => !byKey.has(k));
  if (unknown.length)
    throw new UserError(`Export nejde provést: neznámý nebo nedostupný sloupec „${unknown[0]}“.`);
  const attrs = keys.map((k) => byKey.get(k)!);
  if (!attrs.length) throw new UserError("Vyberte aspoň jeden sloupec exportu.");
  return { descriptor, attrs };
}

/**
 * Export seznamu entity do XLSX nebo CSV. Řádky se čtou ze serveru po stránkách (nikdy celá tabulka naráz),
 * oprávnění a skryté atributy hlídá stejná datová vrstva jako seznam v aplikaci; aktér bez `permissions.export`
 * (nebo čtení) nedostane nic.
 */
export async function prepareEntityExport(
  ctx: Ctx,
  registry: EntityRegistry,
  entity: ResolvedEntity,
  opts: EntityExportOptions,
): Promise<PreparedExport> {
  const perm = entity.def.permissions.export ?? entity.def.permissions.read;
  if (!scopeOf(ctx, perm)) throw new PermissionError();
  const max = opts.maxRows ?? EXPORT_MAX_ROWS;
  const { descriptor, attrs } = await exportColumns(ctx, registry, entity, opts.columns);

  const base: QueryInput = { ...(opts.query ?? {}) };
  const first = await queryRecords(ctx, registry, entity, { ...base, limit: PAGE, offset: 0 });
  const total = first.total;
  if (first.total > max)
    throw new UserError(
      `Export má ${first.total.toLocaleString("cs-CZ")} záznamů, nejvýš jich lze exportovat ${max.toLocaleString("cs-CZ")}. Zúžte filtr nebo období.`,
    );

  async function* pages(): AsyncGenerator<{ rows: RecordRow[]; labels: Labels }> {
    let page = first;
    for (let offset = 0; ; offset += PAGE) {
      if (offset > 0)
        page = await queryRecords(ctx, registry, entity, { ...base, limit: PAGE, offset });
      yield {
        rows: page.rows,
        labels: page.labels,
      };
      if (offset + PAGE >= first.total) return;
    }
  }

  async function* xlsxRows(): AsyncGenerator<unknown[]> {
    for await (const p of pages())
      for (const r of p.rows) {
        yield attrs.map((a) => xlsxValue(a, r[a.key], p.labels));
      }
  }
  async function* csvRows(): AsyncGenerator<string[]> {
    for await (const p of pages())
      for (const r of p.rows) {
        yield attrs.map((a) => csvValue(a, r[a.key], p.labels, csvFmt));
      }
  }

  const today = localParts(new Date()).date;
  const stem = exportFileStem(opts.fileName, `${slug(descriptor.label.many)}-${today}`);
  const csvFmt = opts.csv ?? DEFAULT_CSV_FORMAT;
  const filters = base.filters as FilterGroup | undefined;
  // stopa v auditu vzniká hned (kdo co vyexportoval), ne až po dokončení stahování; i export s nulou záznamů
  if (opts.audit !== false)
    await inTx(ctx, (c) =>
      recordAudit(c, {
        action: "export",
        entityType: entity.def.key,
        entityId: first.rows[0]?.id ?? entity.def.key,
        summary: `Export seznamu „${descriptor.label.many}“ (${opts.format.toUpperCase()}): ${total} záznamů`,
        // počet záznamů vlastníka zahrnuje soukromé, takže stopa po jeho exportu je pro ostatní soukromá
        isPrivate: canSeePrivate(ctx) && !!entity.def.visibility,
        changes: [
          { field: "formát", old: null, new: opts.format },
          { field: "záznamů", old: null, new: total },
          { field: "sloupce", old: null, new: attrs.map((a) => a.label).join(", ") },
          ...(filters?.conditions.length
            ? [{ field: "filtr", old: null, new: JSON.stringify(filters).slice(0, 2000) }]
            : []),
          ...(base.q ? [{ field: "hledání", old: null, new: base.q }] : []),
        ],
      }),
    );

  if (opts.format === "csv") {
    return {
      filename: `${stem}.csv`,
      mime: "text/csv;charset=utf-8",
      count: total,
      chunks: csvLines(
        attrs.map((a) => a.label),
        csvRows(),
        csvFmt,
      ),
    };
  }

  if (opts.format === "pdf") {
    if (total > PDF_MAX_ROWS)
      throw new UserError(
        `PDF jde vytvořit nejvýš z ${PDF_MAX_ROWS.toLocaleString("cs-CZ")} záznamů (tento výběr má ${total.toLocaleString("cs-CZ")}). Zúžte filtr, nebo zvolte Excel či CSV.`,
      );
    const rows: string[][] = [];
    for await (const p of pages())
      for (const r of p.rows) rows.push(attrs.map((a) => pdfValue(a, r[a.key], p.labels)));
    const totalsRow = attrs.some((a) => a.aggregate && first.totals[a.key] !== undefined)
      ? attrs.map((a, i) =>
          a.aggregate && first.totals[a.key] !== undefined
            ? formatMinor(first.totals[a.key]!)
            : i === 0
              ? "Celkem"
              : null,
        )
      : undefined;
    const pdf = await renderTablePdf({
      title: descriptor.label.many,
      header: opts.header ?? { brand: "" },
      notes: [
        `Záznamů: ${total.toLocaleString("cs-CZ")}${base.q ? ` · hledání „${base.q}“` : ""}${filters?.conditions.length ? " · s filtrem" : ""}`,
      ],
      columns: attrs.map((a) => ({
        header: a.label,
        align:
          a.type === "number" || a.type === "currency" ? ("right" as const) : ("left" as const),
        weight: Math.max(0.5, Math.min(3, a.width / 140)),
      })),
      rows,
      ...(totalsRow ? { totals: totalsRow } : {}),
      generatedAt: `Vytvořeno ${formatDate(today)} ${localParts(new Date()).time}`,
    });
    return {
      filename: `${stem}.pdf`,
      mime: "application/pdf",
      count: total,
      chunks: (async function* () {
        yield pdf;
      })(),
    };
  }

  // řádek součtů jen u sloupců, které entita umí sčítat; součet je za celou filtrovanou sadu
  const totals = attrs.some((a) => a.aggregate && first.totals[a.key] !== undefined)
    ? attrs.map((a, i) =>
        i === 0 && !(a.aggregate && first.totals[a.key] !== undefined)
          ? "Celkem"
          : a.aggregate
            ? (first.totals[a.key] ?? null)
            : null,
      )
    : undefined;
  const columns: XlsxColumn[] = attrs.map((a) => ({
    header: a.label,
    type: xlsxType(a),
    width: Math.max(10, Math.min(48, Math.round(a.width / 7))),
  }));
  return {
    filename: `${stem}.xlsx`,
    mime: XLSX_MIME,
    count: total,
    chunks: xlsxChunks([
      {
        name: descriptor.label.many,
        title: `${descriptor.label.many} · export ${formatDate(today)} · ${total.toLocaleString("cs-CZ")} záznamů`,
        columns,
        rows: xlsxRows(),
        ...(totals ? { totals } : {}),
      },
    ]),
  };
}
