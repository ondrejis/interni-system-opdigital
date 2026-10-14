import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  csvLines,
  csvMoney,
  csvSafeText,
  DEFAULT_CSV_FORMAT,
  xlsxChunks,
  zipChunks,
  type CsvFormat,
  type ZipEntry,
} from "@rebar/core/export";
import type { XlsxColumn, XlsxSheet } from "@rebar/core/export";
import { recordAudit } from "@rebar/core/audit";
import type { EntityDef } from "@rebar/core/entities";
import { openFile } from "@rebar/core/files";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatDate } from "@rebar/core/shared";
import { job } from "@rebar/zakazky/schema";
import { invoice, payment, receivedInvoice } from "../schema";
import { loadVatDocs, isdocEntries, vatReportFile } from "./accounting";
import {
  KIND_LABEL,
  MODE_LABEL,
  periodStem,
  safeName,
  uniqueNamer,
  type PeriodBasis,
} from "./common";
import { PACKAGE_MAX_DOCS, selectDocumentIds } from "./select";

export { PACKAGE_MAX_DOCS };

/** Stav úhrady vystavené faktury pro účetní: uhrazeno, částečně, neuhrazeno, stornováno. */
export function paidLabel(i: {
  kind: string;
  state: string;
  grossMinor: number;
  paidMinor: number;
}) {
  if (i.kind === "credit_note") return "dobropis";
  if (i.state === "credited") return "stornováno dobropisem";
  if (i.paidMinor >= i.grossMinor && i.grossMinor > 0) return "uhrazeno";
  if (i.paidMinor > 0) return "částečně uhrazeno";
  return "neuhrazeno";
}

export function receivedPaidLabel(i: { state: string; grossMinor: number; paidMinor: number }) {
  if (i.state === "paid" || (i.paidMinor >= i.grossMinor && i.grossMinor > 0)) return "uhrazeno";
  if (i.paidMinor > 0) return "částečně uhrazeno";
  return "neuhrazeno";
}

export type PackageOptions = {
  from: string;
  to: string;
  /** Souhrn jako XLSX (jeden sešit s listy), nebo dva CSV soubory. */
  format: "xlsx" | "csv";
  /** Přibalit skeny přijatých faktur (výchozí ano). */
  receivedFiles?: boolean;
  /** Přibalit složku `isdoc/` s ISDOC vydaných a přijatých faktur (výchozí ne). */
  isdoc?: boolean;
  /** Přibalit `dph-podklady` (stejný formát jako souhrn) se stejnými doklady jako balík (výchozí ne). */
  vatReport?: boolean;
  /** Formát CSV (oddělovač), výchozí středník; týká se souhrnu v CSV i podkladů DPH. */
  csv?: CsvFormat;
  /** Podle čeho se doklady vybírají do období (výchozí datum vystavení). */
  basis?: PeriodBasis;
};

export type PreparedPackage = {
  filename: string;
  chunks: AsyncGenerator<Buffer>;
  issuedCount: number;
  receivedCount: number;
};

type IssuedRow = {
  id: string;
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
  retentionMinor: number;
  paidMinor: number;
  paidDate: string;
  vatMode: string;
  jobNumber: string;
};

type ReceivedRow = {
  id: string;
  number: string;
  supplierName: string;
  supplierIco: string;
  supplierDic: string;
  variableSymbol: string;
  issueDate: string;
  taxableDate: string;
  dueDate: string;
  currency: string;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  paidMinor: number;
  paidDate: string;
  state: string;
  vatMode: string;
  jobNumber: string;
  fileId: string | null;
};

/**
 * Měsíční (obecně za období) balík pro účetní: ZIP s PDF vydaných faktur, skeny schválených přijatých faktur
 * a souhrnem v XLSX nebo CSV s označením uhrazených. Vyžaduje `fakturace.export`; vidí se jen doklady, které aktér smí
 * číst (rozsah „jen moje“ se respektuje). PDF se vykreslují a odesílají postupně, nic se nedrží celé v paměti.
 */
export async function prepareAccountingPackage(
  ctx: Ctx,
  deps: ModuleDeps,
  entities: { invoice: EntityDef; received: EntityDef },
  renderPdf: (
    ctx: Ctx,
    deps: ModuleDeps,
    id: string,
  ) => Promise<{ filename: string; buffer: Buffer }>,
  opts: PackageOptions,
): Promise<PreparedPackage> {
  const { invIds, recIds } = await selectDocumentIds(ctx, entities, {
    from: opts.from,
    to: opts.to,
    basis: opts.basis,
  });
  const csv = opts.csv ?? DEFAULT_CSV_FORMAT;

  const issued: IssuedRow[] = invIds.length
    ? (
        await ctx.db
          .select({ i: invoice, jobNumber: job.number })
          .from(invoice)
          .leftJoin(job, eq(job.id, invoice.jobId))
          .where(and(inArray(invoice.id, invIds), isNull(invoice.deletedAt)))
          .orderBy(asc(invoice.issueDate), asc(invoice.number))
      ).map(({ i, jobNumber }) => ({
        id: i.id,
        number: i.number ?? "",
        kind: i.kind,
        state: i.state,
        issueDate: i.issueDate ?? "",
        taxableDate: i.taxableDate ?? "",
        dueDate: i.dueDate ?? "",
        customerName: i.customer?.name ?? "",
        customerIco: i.customer?.ico ?? "",
        customerDic: i.customer?.dic ?? "",
        variableSymbol: i.variableSymbol ?? "",
        currency: i.currency,
        netMinor: i.netMinor,
        vatMinor: i.vatMinor,
        grossMinor: i.grossMinor,
        retentionMinor: i.retentionMinor,
        paidMinor: i.paidMinor,
        paidDate: "",
        vatMode: i.vatMode,
        jobNumber: jobNumber ?? "",
      }))
    : [];
  if (issued.length) {
    const last = await ctx.db
      .select({ id: payment.invoiceId, d: sql<string>`max(${payment.date})::text` })
      .from(payment)
      .where(and(inArray(payment.invoiceId, invIds), isNull(payment.deletedAt)))
      .groupBy(payment.invoiceId);
    const byId = new Map(last.map((l) => [l.id, l.d]));
    for (const r of issued) r.paidDate = byId.get(r.id) ?? "";
  }

  const received: ReceivedRow[] = recIds.length
    ? (
        await ctx.db
          .select({ r: receivedInvoice, jobNumber: job.number })
          .from(receivedInvoice)
          .leftJoin(job, eq(job.id, receivedInvoice.jobId))
          .where(and(inArray(receivedInvoice.id, recIds), isNull(receivedInvoice.deletedAt)))
          .orderBy(asc(receivedInvoice.issueDate), asc(receivedInvoice.number))
      ).map(({ r, jobNumber }) => ({
        id: r.id,
        number: r.number,
        supplierName: r.supplier?.name ?? "",
        supplierIco: r.supplier?.ico ?? "",
        supplierDic: r.supplier?.dic ?? "",
        variableSymbol: r.variableSymbol ?? "",
        issueDate: r.issueDate ?? "",
        taxableDate: r.taxableDate ?? "",
        dueDate: r.dueDate ?? "",
        currency: r.currency,
        netMinor: r.netMinor,
        vatMinor: r.vatMinor,
        grossMinor: r.grossMinor,
        paidMinor: r.paidMinor,
        paidDate: r.paidDate ?? "",
        state: r.state,
        vatMode: r.vatMode,
        jobNumber: jobNumber ?? "",
        fileId: r.fileId,
      }))
    : [];

  // stopa v auditu hned při zahájení (kdo co vyexportoval)
  await inTx(ctx, (c) =>
    recordAudit(c, {
      action: "export",
      entityType: "invoice",
      entityId: issued[0]?.id ?? received[0]!.id,
      summary: `Balík pro účetní ${opts.from} – ${opts.to}: ${issued.length} vydaných, ${received.length} přijatých faktur${
        opts.isdoc ? ", s ISDOC" : ""
      }${opts.vatReport ? ", s podklady DPH" : ""}`,
    }),
  );

  const stem = `ucetni-balik-${periodStem(opts.from, opts.to)}`;
  const notes: string[] = [];

  async function* entries(): AsyncGenerator<ZipEntry> {
    // souhrn je první v archivu; přílohy a poznámky se doplní až za ním
    if (opts.format === "xlsx")
      yield { name: "souhrn.xlsx", data: xlsxChunks(summarySheets(issued, received, opts)) };
    else {
      yield {
        name: "vydane-faktury.csv",
        data: csvLines(
          ISSUED_COLUMNS.map((c) => c.header),
          issued.map((r) => csvCells(ISSUED_COLUMNS, issuedCells(r), csv)),
          csv,
        ),
      };
      yield {
        name: "prijate-faktury.csv",
        data: csvLines(
          RECEIVED_COLUMNS.map((c) => c.header),
          received.map((r) => csvCells(RECEIVED_COLUMNS, receivedCells(r), csv)),
          csv,
        ),
      };
    }
    if (opts.vatReport) {
      const docs = await loadVatDocs(ctx, deps, { invIds, recIds });
      const f = vatReportFile(docs, { from: opts.from, to: opts.to, format: opts.format, csv });
      yield { name: f.name, data: f.chunks };
    }
    const unique = uniqueNamer();
    for (const r of issued) {
      try {
        const pdf = await renderPdf(ctx, deps, r.id);
        yield { name: unique("vydane", safeName(r.number), ".pdf"), data: pdf.buffer };
      } catch (err) {
        notes.push(
          `Vydaná faktura ${r.number}: PDF se nepodařilo vytvořit (${(err as Error).message}).`,
        );
      }
    }
    if (opts.isdoc)
      yield* isdocEntries(ctx, deps, { invIds, recIds }, { dir: "isdoc", unique, notes });
    if (opts.receivedFiles !== false)
      for (const r of received) {
        if (!r.fileId) {
          notes.push(`Přijatá faktura ${r.number} (${r.supplierName}): nemá nahraný sken.`);
          continue;
        }
        try {
          const f = await openFile(ctx, { storage: deps.storage }, r.fileId);
          const ext = /\.[A-Za-z0-9]{1,5}$/.exec(f.name)?.[0] ?? "";
          yield {
            name: unique("prijate", safeName(`${r.supplierName}-${r.number}`), ext.toLowerCase()),
            data: f.stream,
          };
        } catch {
          notes.push(
            `Přijatá faktura ${r.number} (${r.supplierName}): sken se nepodařilo přibalit.`,
          );
        }
      }
    if (notes.length)
      yield { name: "poznamky.txt", data: `Poznámky k balíku\r\n\r\n${notes.join("\r\n")}\r\n` };
  }

  return {
    filename: `${stem}.zip`,
    chunks: zipChunks(entries()),
    issuedCount: issued.length,
    receivedCount: received.length,
  };
}

/* ---------- soubory souhrnu ---------- */

const ISSUED_COLUMNS: XlsxColumn[] = [
  { header: "Číslo", type: "text", width: 16 },
  { header: "Druh", type: "text", width: 18 },
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
  { header: "Zádržné", type: "money" },
  { header: "Uhrazeno", type: "money" },
  { header: "Stav úhrady", type: "text", width: 20 },
  { header: "Datum úhrady", type: "date" },
  { header: "Režim DPH", type: "text", width: 26 },
  { header: "Zakázka", type: "text", width: 14 },
];

const issuedCells = (r: IssuedRow) => [
  r.number,
  KIND_LABEL[r.kind] ?? r.kind,
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
  r.retentionMinor,
  r.paidMinor,
  paidLabel(r),
  r.paidDate,
  MODE_LABEL[r.vatMode] ?? r.vatMode,
  r.jobNumber,
];

const RECEIVED_COLUMNS: XlsxColumn[] = [
  { header: "Číslo dokladu", type: "text", width: 18 },
  { header: "Dodavatel", type: "text", width: 32 },
  { header: "IČO", type: "text", width: 12 },
  { header: "DIČ", type: "text", width: 14 },
  { header: "Variabilní symbol", type: "text", width: 16 },
  { header: "Vystaveno", type: "date" },
  { header: "DUZP", type: "date" },
  { header: "Splatnost", type: "date" },
  { header: "Měna", type: "text", width: 7 },
  { header: "Základ", type: "money" },
  { header: "DPH", type: "money" },
  { header: "Celkem", type: "money" },
  { header: "Uhrazeno", type: "money" },
  { header: "Stav úhrady", type: "text", width: 20 },
  { header: "Datum úhrady", type: "date" },
  { header: "Režim DPH", type: "text", width: 26 },
  { header: "Zakázka", type: "text", width: 14 },
];

const receivedCells = (r: ReceivedRow) => [
  r.number,
  r.supplierName,
  r.supplierIco,
  r.supplierDic,
  r.variableSymbol,
  r.issueDate,
  r.taxableDate,
  r.dueDate,
  r.currency,
  r.netMinor,
  r.vatMinor,
  r.grossMinor,
  r.paidMinor,
  receivedPaidLabel(r),
  r.paidDate,
  MODE_LABEL[r.vatMode] ?? r.vatMode,
  r.jobNumber,
];

const sum = <T>(rows: readonly T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);

/** Řádek součtů: součet za sloupce typu částka (haléře). */
function totalsRow(columns: readonly XlsxColumn[], cells: readonly (readonly unknown[])[]) {
  return columns.map((c, i) =>
    i === 0 ? "Celkem" : c.type === "money" ? sum(cells, (r) => Number(r[i] ?? 0)) : null,
  );
}

/**
 * Buňky CSV: částky s desetinnou čárkou (u oddělovače `,` s tečkou), data česky (u `,` ve formátu ISO), texty
 * zabezpečené proti vzorcům.
 */
function csvCells(
  columns: readonly XlsxColumn[],
  cells: readonly unknown[],
  format: CsvFormat,
): string[] {
  return columns.map((c, i) => {
    const v = cells[i];
    if (v === null || v === undefined || v === "") return "";
    if (c.type === "money") return csvMoney(Number(v), format);
    if (c.type === "date") return format.delimiter === ";" ? formatDate(String(v)) : String(v);
    return csvSafeText(String(v));
  });
}

function summarySheets(
  issued: readonly IssuedRow[],
  received: readonly ReceivedRow[],
  o: PackageOptions,
): XlsxSheet[] {
  const period = `${formatDate(o.from)} – ${formatDate(o.to)}`;
  const issuedRows = issued.map(issuedCells);
  const receivedRows = received.map(receivedCells);
  // vzájemně se vyrušící dobropisy a doklady jsou v součtech, proto je celkový základ/DPH správný i s dobropisy
  const unpaid = (r: IssuedRow) =>
    r.kind === "credit_note" || r.state === "credited"
      ? 0
      : Math.max(0, r.grossMinor - r.paidMinor);
  const summary: unknown[][] = [
    [
      "Vydané faktury",
      issued.length,
      sum(issued, (r) => r.netMinor),
      sum(issued, (r) => r.vatMinor),
      sum(issued, (r) => r.grossMinor),
      sum(issued, (r) => r.paidMinor),
      sum(issued, unpaid),
    ],
    [
      "Přijaté faktury (schválené)",
      received.length,
      sum(received, (r) => r.netMinor),
      sum(received, (r) => r.vatMinor),
      sum(received, (r) => r.grossMinor),
      sum(received, (r) => r.paidMinor),
      sum(received, (r) => Math.max(0, r.grossMinor - r.paidMinor)),
    ],
  ];
  return [
    {
      name: "Souhrn",
      title: `Podklady pro účetní · ${period}`,
      columns: [
        { header: "Doklady", type: "text", width: 30 },
        { header: "Počet", type: "number", width: 10 },
        { header: "Základ", type: "money" },
        { header: "DPH", type: "money" },
        { header: "Celkem", type: "money" },
        { header: "Uhrazeno", type: "money" },
        { header: "Neuhrazeno", type: "money" },
      ],
      rows: summary,
    },
    {
      name: "Vydané faktury",
      title: `Vydané faktury · vystaveno ${period}`,
      columns: ISSUED_COLUMNS,
      rows: issuedRows,
      totals: totalsRow(ISSUED_COLUMNS, issuedRows),
    },
    {
      name: "Přijaté faktury",
      title: `Přijaté faktury (schválené a uhrazené) · vystaveno ${period}`,
      columns: RECEIVED_COLUMNS,
      rows: receivedRows,
      totals: totalsRow(RECEIVED_COLUMNS, receivedRows),
    },
  ];
}
