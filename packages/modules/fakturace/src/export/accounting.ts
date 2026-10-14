import { recordAudit } from "@rebar/core/audit";
import {
  DEFAULT_CSV_FORMAT,
  xlsxChunks,
  XLSX_MIME,
  zipChunks,
  type CsvFormat,
  type ZipEntry,
} from "@rebar/core/export";
import { assertEntityAccess } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, NotFoundError, PermissionError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatDate } from "@rebar/core/shared";
import { eq } from "drizzle-orm";
import { invoice, receivedInvoice } from "../schema";
import { periodStem, safeName, uniqueNamer, type PeriodBasis } from "./common";
import {
  issuedIsdoc,
  issuedVatDoc,
  loadIssuedBundles,
  loadReceivedBundles,
  receivedIsdoc,
  receivedVatDoc,
  type IssuedBundle,
  type ReceivedBundle,
} from "./documents";
import { buildIsdoc } from "./isdoc";
import { selectDocumentIds, ISSUED_STATES, RECEIVED_STATES, type DocEntities } from "./select";
import { vatCsv, vatRowsOf, vatSheets, type VatDoc } from "./vat-report";

/** Dávka dokladů načítaná najednou (třemi dotazy) při streamování ISDOC. */
const BATCH = 25;

export const ISDOC_MIME = "application/xml; charset=utf-8";

/* ---------- jednotlivé soubory ---------- */

/** Název souboru ISDOC vydané faktury a přijaté faktury (v ZIP přijaté leží ve složce `prijate`). */
export const issuedIsdocName = (b: IssuedBundle) => `${safeName(b.row.number ?? "doklad")}.isdoc`;
export const receivedIsdocName = (b: ReceivedBundle) =>
  `${safeName(`${b.supplier.name}-${b.row.number}`)}.isdoc`;

export function issuedIsdocXml(b: IssuedBundle): string {
  if (!b.row.number || !b.row.issueDate || !ISSUED_STATES.includes(b.row.state))
    throw new UserError("Koncept nemá číslo a datum vystavení, do ISDOC jde až vystavená faktura.");
  return buildIsdoc(issuedIsdoc(b));
}

export function receivedIsdocXml(b: ReceivedBundle): string {
  if (!RECEIVED_STATES.includes(b.row.state))
    throw new UserError("Do ISDOC jdou jen schválené a uhrazené přijaté faktury.");
  return buildIsdoc(receivedIsdoc(b));
}

/**
 * ISDOC jednoho dokladu (vydaného i přijatého, rozliší se podle id). Vyžaduje `fakturace.export` a přístup k záznamu
 * (rozsah „jen moje“ se respektuje). Zapíše se do auditu.
 */
export async function buildSingleIsdoc(
  ctx: Ctx,
  deps: ModuleDeps,
  id: string,
): Promise<{ filename: string; xml: string }> {
  if (!scopeOf(ctx, "fakturace.export")) throw new PermissionError();
  const [issued] = await ctx.db.select({ id: invoice.id }).from(invoice).where(eq(invoice.id, id));
  const [received] = issued
    ? []
    : await ctx.db
        .select({ id: receivedInvoice.id })
        .from(receivedInvoice)
        .where(eq(receivedInvoice.id, id));
  if (!issued && !received) throw new NotFoundError("Doklad nenalezen.");
  let out: { filename: string; xml: string; label: string };
  if (issued) {
    await assertEntityAccess(ctx, "invoice", id, "read");
    const [b] = await loadIssuedBundles(ctx, deps, [id]);
    if (!b) throw new NotFoundError("Faktura nenalezena.");
    out = { filename: issuedIsdocName(b), xml: issuedIsdocXml(b), label: b.row.number ?? "" };
  } else {
    await assertEntityAccess(ctx, "received_invoice", id, "read");
    const [b] = await loadReceivedBundles(ctx, deps, [id]);
    if (!b) throw new NotFoundError("Přijatá faktura nenalezena.");
    out = { filename: receivedIsdocName(b), xml: receivedIsdocXml(b), label: b.row.number };
  }
  await inTx(ctx, (c) =>
    recordAudit(c, {
      action: "export",
      entityType: issued ? "invoice" : "received_invoice",
      entityId: id,
      summary: `Export ISDOC: ${issued ? "vydaná" : "přijatá"} faktura ${out.label}`,
    }),
  );
  return { filename: out.filename, xml: out.xml };
}

/* ---------- ZIP s ISDOC ---------- */

export type IsdocExportOptions = {
  from: string;
  to: string;
  /** Podle čeho se doklady vybírají do období (výchozí datum vystavení). */
  basis?: PeriodBasis;
  /** Které doklady (výchozí obojí). */
  kind?: "issued" | "received" | "all";
};

export type PreparedIsdocExport = {
  filename: string;
  chunks: AsyncGenerator<Buffer>;
  issuedCount: number;
  receivedCount: number;
};

/** Položky ZIP s ISDOC: `<číslo>.isdoc` pro vydané, `prijate/<dodavatel>-<číslo>.isdoc` pro přijaté; chyby do poznámek. */
export async function* isdocEntries(
  ctx: Ctx,
  deps: ModuleDeps,
  ids: { invIds: readonly string[]; recIds: readonly string[] },
  opts: { dir?: string; unique?: ReturnType<typeof uniqueNamer>; notes?: string[] } = {},
): AsyncGenerator<ZipEntry> {
  const dir = opts.dir ?? "";
  const unique = opts.unique ?? uniqueNamer();
  const notes = opts.notes ?? [];
  const join = (...p: string[]) => p.filter(Boolean).join("/");
  for (let i = 0; i < ids.invIds.length; i += BATCH) {
    for (const b of await loadIssuedBundles(ctx, deps, ids.invIds.slice(i, i + BATCH))) {
      try {
        const xml = issuedIsdocXml(b);
        yield { name: unique(dir, safeName(b.row.number ?? "doklad"), ".isdoc"), data: xml };
      } catch (err) {
        notes.push(
          `Vydaná faktura ${b.row.number}: ISDOC se nepodařilo vytvořit (${(err as Error).message}).`,
        );
      }
    }
  }
  for (let i = 0; i < ids.recIds.length; i += BATCH) {
    for (const b of await loadReceivedBundles(ctx, deps, ids.recIds.slice(i, i + BATCH))) {
      try {
        const xml = receivedIsdocXml(b);
        yield {
          name: unique(
            join(dir, "prijate"),
            safeName(`${b.supplier.name}-${b.row.number}`),
            ".isdoc",
          ),
          data: xml,
        };
      } catch (err) {
        notes.push(
          `Přijatá faktura ${b.row.number} (${b.supplier.name}): ISDOC se nepodařilo vytvořit (${(err as Error).message}).`,
        );
      }
    }
  }
}

/** Zapíše do auditu, že aktér vyexportoval doklady (kdo, co, za jaké období). */
async function auditExport(ctx: Ctx, entityId: string, summary: string) {
  await inTx(ctx, (c) =>
    recordAudit(c, { action: "export", entityType: "invoice", entityId, summary }),
  );
}

/**
 * ZIP s ISDOC za období (vydané, přijaté, nebo obojí). Vyžaduje `fakturace.export`, vybírají se jen doklady
 * dostupné aktérovi. Soubory se tvoří a odesílají postupně po dávkách, celá sada se nedrží v paměti.
 */
export async function prepareIsdocExport(
  ctx: Ctx,
  deps: ModuleDeps,
  entities: DocEntities,
  opts: IsdocExportOptions,
): Promise<PreparedIsdocExport> {
  const kind = opts.kind ?? "all";
  const ids = await selectDocumentIds(ctx, entities, {
    from: opts.from,
    to: opts.to,
    basis: opts.basis,
    issued: kind !== "received",
    received: kind !== "issued",
  });
  await auditExport(
    ctx,
    ids.invIds[0] ?? ids.recIds[0]!,
    `Export ISDOC ${opts.from} – ${opts.to}: ${ids.invIds.length} vydaných, ${ids.recIds.length} přijatých faktur`,
  );
  const notes: string[] = [];
  async function* entries(): AsyncGenerator<ZipEntry> {
    yield* isdocEntries(ctx, deps, ids, { notes });
    if (notes.length)
      yield { name: "poznamky.txt", data: `Poznámky k exportu\r\n\r\n${notes.join("\r\n")}\r\n` };
  }
  return {
    filename: `isdoc-${periodStem(opts.from, opts.to)}.zip`,
    chunks: zipChunks(entries()),
    issuedCount: ids.invIds.length,
    receivedCount: ids.recIds.length,
  };
}

/* ---------- podklady DPH ---------- */

export type VatReportOptions = {
  from: string;
  to: string;
  format: "csv" | "xlsx";
  /** Výchozí je DUZP (datum zdanitelného plnění), podle kterého se DPH přiznává. */
  basis?: PeriodBasis;
  /** Formát CSV (oddělovač); výchozí středník. */
  csv?: CsvFormat;
};

export type PreparedVatReport = {
  filename: string;
  mime: string;
  chunks: AsyncGenerator<Buffer>;
  issuedCount: number;
  receivedCount: number;
};

/** Doklady pro podklady DPH ze zadaných id (po dávkách, jen potřebné údaje se drží). */
export async function loadVatDocs(
  ctx: Ctx,
  deps: ModuleDeps,
  ids: { invIds: readonly string[]; recIds: readonly string[] },
): Promise<VatDoc[]> {
  const docs: VatDoc[] = [];
  for (let i = 0; i < ids.invIds.length; i += 100)
    for (const b of await loadIssuedBundles(ctx, deps, ids.invIds.slice(i, i + 100)))
      // zálohová faktura není daňový doklad, do podkladů DPH nepatří
      if (b.row.kind !== "proforma") docs.push(issuedVatDoc(b));
  for (let i = 0; i < ids.recIds.length; i += 100)
    for (const b of await loadReceivedBundles(ctx, deps, ids.recIds.slice(i, i + 100)))
      docs.push(receivedVatDoc(b));
  return docs;
}

/** Soubor podkladů DPH (CSV, nebo XLSX) z hotových dokladů. */
export function vatReportFile(
  docs: readonly VatDoc[],
  opts: { from: string; to: string; format: "csv" | "xlsx"; csv?: CsvFormat },
): { name: string; mime: string; chunks: AsyncGenerator<Buffer> } {
  const rows = vatRowsOf(docs);
  const format = opts.csv ?? DEFAULT_CSV_FORMAT;
  const stem = `dph-podklady`;
  if (opts.format === "csv")
    return { name: `${stem}.csv`, mime: "text/csv; charset=utf-8", chunks: vatCsv(rows, format) };
  const period = `${formatDate(opts.from)} – ${formatDate(opts.to)}`;
  return { name: `${stem}.xlsx`, mime: XLSX_MIME, chunks: xlsxChunks(vatSheets(rows, period)) };
}

/**
 * Podklady pro přiznání DPH za období (CSV nebo XLSX): vydané a přijaté doklady po sazbách DPH a souhrn.
 * Zálohové faktury se vynechávají (nejsou daňové doklady). Vyžaduje `fakturace.export`, respektuje rozsah „jen moje“.
 */
export async function prepareVatReport(
  ctx: Ctx,
  deps: ModuleDeps,
  entities: DocEntities,
  opts: VatReportOptions,
): Promise<PreparedVatReport> {
  const ids = await selectDocumentIds(ctx, entities, {
    from: opts.from,
    to: opts.to,
    basis: opts.basis ?? "duzp",
    withoutProforma: true,
  });
  await auditExport(
    ctx,
    ids.invIds[0] ?? ids.recIds[0]!,
    `Podklady DPH (${opts.format.toUpperCase()}) ${opts.from} – ${opts.to}: ${ids.invIds.length} vydaných, ${ids.recIds.length} přijatých faktur`,
  );
  const docs = await loadVatDocs(ctx, deps, ids);
  const file = vatReportFile(docs, opts);
  return {
    filename: `dph-podklady-${periodStem(opts.from, opts.to)}.${opts.format}`,
    mime: file.mime,
    chunks: file.chunks,
    issuedCount: ids.invIds.length,
    receivedCount: ids.recIds.length,
  };
}
