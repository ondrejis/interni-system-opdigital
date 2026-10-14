import { csvSafeText, xlsxChunks, XLSX_MIME, type XlsxColumn } from "@rebar/core/export";
import { formatMinor } from "@rebar/core/shared";

/**
 * Export dokladů do účetnictví. Adaptér dostane vystavené doklady a vrátí soubor; další (Pohoda, Fakturoid, iDoklad)
 * se přidávají jako další adaptéry se stejným rozhraním, bez zásahu do zbytku modulu.
 */
export type ExportRow = {
  number: string;
  kind: string;
  state: string;
  issueDate: string;
  taxableDate: string;
  dueDate: string;
  customerName: string;
  customerIco: string;
  customerDic: string;
  variableSymbol: string;
  currency: string;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  paidMinor: number;
  jobNumber: string;
  /** `standard`, nebo `reverse_charge` (přenesená daňová povinnost). */
  vatMode: string;
  /** Zádržné stržené z dokladu (bez DPH, kladné). */
  retentionMinor: number;
};

export type ExportFile = { filename: string; mime: string; content: string | Buffer };

export type ExportAdapter = {
  key: string;
  label: string;
  description: string;
  run(rows: readonly ExportRow[]): ExportFile | Promise<ExportFile>;
};

const KIND_LABEL: Record<string, string> = {
  proforma: "zálohová",
  partial: "průběžná",
  final: "vyúčtování",
  credit_note: "dobropis",
  retention: "uvolnění zádržného",
};

const MODE_LABEL: Record<string, string> = {
  standard: "běžný",
  reverse_charge: "přenesená daňová povinnost",
};

/** Buňka CSV: text se zabezpečí proti vzorcům v Excelu (`=`, `+`, `-`, `@` na začátku) a escapuje. */
const q = (v: string) => {
  const t = csvSafeText(v);
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const amount = (minor: number) => (minor / 100).toFixed(2).replace(".", ",");

/** Obecné CSV pro Excel (středník, UTF-8 s BOM, částky s desetinnou čárkou). */
export const csvAdapter: ExportAdapter = {
  key: "csv",
  label: "CSV (Excel)",
  description:
    "Přehled faktur: číslo, druh, odběratel, datumy, částky, režim DPH a zádržné. Otevře se v Excelu.",
  run(rows) {
    const head = [
      "Číslo",
      "Druh",
      "Stav",
      "Vystaveno",
      "DUZP",
      "Splatnost",
      "Odběratel",
      "IČO",
      "DIČ",
      "Variabilní symbol",
      "Měna",
      "Základ",
      "DPH",
      "Celkem",
      "Uhrazeno",
      "Zakázka",
      "Režim DPH",
      "Zádržné",
    ];
    const lines = rows.map((r) =>
      [
        r.number,
        KIND_LABEL[r.kind] ?? r.kind,
        r.state,
        r.issueDate,
        r.taxableDate,
        r.dueDate,
        r.customerName,
        r.customerIco,
        r.customerDic,
        r.variableSymbol,
        r.currency,
        amount(r.netMinor),
        amount(r.vatMinor),
        amount(r.grossMinor),
        amount(r.paidMinor),
        r.jobNumber,
        MODE_LABEL[r.vatMode] ?? r.vatMode,
        amount(r.retentionMinor),
      ]
        .map(q)
        .join(";"),
    );
    return {
      filename: `faktury-${new Date().toISOString().slice(0, 10)}.csv`,
      mime: "text/csv;charset=utf-8",
      content: "﻿" + [head.join(";"), ...lines].join("\r\n"),
    };
  },
};

const XLSX_COLUMNS: XlsxColumn[] = [
  { header: "Číslo", type: "text", width: 16 },
  { header: "Druh", type: "text", width: 18 },
  { header: "Stav", type: "text", width: 14 },
  { header: "Vystaveno", type: "date" },
  { header: "DUZP", type: "date" },
  { header: "Splatnost", type: "date" },
  { header: "Odběratel", type: "text", width: 32 },
  { header: "IČO", type: "text", width: 12 },
  { header: "DIČ", type: "text", width: 14 },
  { header: "Variabilní symbol", type: "text", width: 16 },
  { header: "Měna", type: "text", width: 7 },
  { header: "Základ", type: "money" },
  { header: "DPH", type: "money" },
  { header: "Celkem", type: "money" },
  { header: "Uhrazeno", type: "money" },
  { header: "Zakázka", type: "text", width: 14 },
  { header: "Režim DPH", type: "text", width: 26 },
  { header: "Zádržné", type: "money" },
];

/** Stejná data jako CSV, ale typovaně: částky jsou čísla s formátem, data jsou data, součty v posledním řádku. */
export const xlsxAdapter: ExportAdapter = {
  key: "xlsx",
  label: "Excel (XLSX)",
  description:
    "Přehled faktur jako sešit Excelu: částky jako čísla, skutečná data, řádek součtů. Stejné sloupce jako CSV.",
  async run(rows) {
    const cells = rows.map((r) => [
      r.number,
      KIND_LABEL[r.kind] ?? r.kind,
      r.state,
      r.issueDate,
      r.taxableDate,
      r.dueDate,
      r.customerName,
      r.customerIco,
      r.customerDic,
      r.variableSymbol,
      r.currency,
      r.netMinor,
      r.vatMinor,
      r.grossMinor,
      r.paidMinor,
      r.jobNumber,
      MODE_LABEL[r.vatMode] ?? r.vatMode,
      r.retentionMinor,
    ]);
    const totals = XLSX_COLUMNS.map((c, i) =>
      i === 0 ? "Celkem" : c.type === "money" ? cells.reduce((a, r) => a + Number(r[i]), 0) : null,
    );
    const parts: Buffer[] = [];
    for await (const c of xlsxChunks([
      { name: "Faktury", columns: XLSX_COLUMNS, rows: cells, totals },
    ]))
      parts.push(c);
    return {
      filename: `faktury-${new Date().toISOString().slice(0, 10)}.xlsx`,
      mime: XLSX_MIME,
      content: Buffer.concat(parts),
    };
  },
};

export const EXPORT_ADAPTERS: readonly ExportAdapter[] = [csvAdapter, xlsxAdapter];

export function totalLabel(rows: readonly ExportRow[]): string {
  return formatMinor(rows.reduce((a, r) => a + r.grossMinor, 0));
}
