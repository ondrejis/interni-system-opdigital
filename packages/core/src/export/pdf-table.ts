import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { renderPdf } from "../pdf/render";

/** Hlavička exportu: název systému klienta a údaje o firmě. */
export type ExportHeader = {
  brand: string;
  /** Řádky pod názvem (firma, IČO, adresa). */
  lines?: readonly string[];
};

export type PdfTableColumn = {
  header: string;
  align?: "left" | "right";
  /** Relativní šířka sloupce (výchozí 1). */
  weight?: number;
};

export type PdfTableInput = {
  title: string;
  header: ExportHeader;
  /** Popis výběru: filtry, období, počet záznamů. */
  notes?: readonly string[];
  columns: readonly PdfTableColumn[];
  rows: readonly (readonly string[])[];
  /** Řádek součtů pod tabulkou (hodnoty podle sloupců, `null` = prázdná buňka). */
  totals?: readonly (string | null)[];
  generatedAt: string;
};

/** Nejvíc řádků v PDF tabulce (pdfmake skládá dokument v paměti). */
export const PDF_MAX_ROWS = 5_000;

const GRAY = "#6b6e78";

/**
 * PDF tabulka exportu seznamu: A4 na šířku (na výšku do pěti sloupců), hlavička klienta, popis výběru, opakovaná
 * záhlaví tabulky na každé stránce, číslování stran. Texty jdou přes pdfmake bez přístupu k souborům a síti.
 */
export async function renderTablePdf(input: PdfTableInput): Promise<Buffer> {
  const cols = input.columns;
  const landscape = cols.length > 5;
  const cell = (
    text: string,
    col: PdfTableColumn,
    extra: Record<string, unknown> = {},
  ): TableCell => ({ text, alignment: col.align ?? "left", ...extra }) as TableCell;
  const body: TableCell[][] = [
    cols.map((c) => cell(c.header, c, { bold: true, fillColor: "#eceef1", margin: [0, 2, 0, 2] })),
    ...input.rows.map((r, i) =>
      cols.map((c, j) => cell(r[j] ?? "", c, i % 2 ? { fillColor: "#f7f7f8" } : {})),
    ),
  ];
  if (input.totals)
    body.push(
      cols.map((c, j) => cell(input.totals![j] ?? "", c, { bold: true, margin: [0, 3, 0, 0] })),
    );
  const content: Content[] = [
    {
      columns: [
        {
          stack: [
            { text: input.header.brand, fontSize: 13, bold: true },
            ...(input.header.lines ?? []).map((l) => ({ text: l, color: GRAY, fontSize: 8.5 })),
          ],
        },
        { text: input.generatedAt, alignment: "right", color: GRAY, fontSize: 8.5 },
      ],
      margin: [0, 0, 0, 10],
    },
    { text: input.title, fontSize: 15, bold: true, margin: [0, 0, 0, 3] },
    ...(input.notes ?? []).map((n) => ({ text: n, color: GRAY, fontSize: 8.5 }) as Content),
    {
      table: {
        headerRows: 1,
        // šířky v procentech podle vah sloupců (pdfmake nezná poměrné hvězdičky)
        widths: cols.map(
          (c) =>
            `${((100 * (c.weight ?? 1)) / cols.reduce((n, x) => n + (x.weight ?? 1), 0)).toFixed(2)}%`,
        ),
        body,
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
          i === 0 || i === node.table.body.length ? 0.6 : 0.25,
        vLineWidth: () => 0,
        hLineColor: () => "#c9cbd1",
        paddingTop: () => 2.5,
        paddingBottom: () => 2.5,
        paddingLeft: () => 3,
        paddingRight: () => 3,
      },
      fontSize: landscape ? 8 : 9,
      margin: [0, 8, 0, 0],
    },
  ];
  const def: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: landscape ? "landscape" : "portrait",
    pageMargins: [32, 32, 32, 40],
    content,
    footer: (page: number, pages: number) => ({
      columns: [
        { text: input.header.brand, color: GRAY, fontSize: 8, margin: [32, 0, 0, 0] },
        {
          text: `Strana ${page} z ${pages}`,
          alignment: "right",
          color: GRAY,
          fontSize: 8,
          margin: [0, 0, 32, 0],
        },
      ],
    }),
  };
  return renderPdf(def);
}
