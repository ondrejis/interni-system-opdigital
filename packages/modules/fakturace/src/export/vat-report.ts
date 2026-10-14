import {
  csvLines,
  csvMoney,
  csvSafeText,
  DEFAULT_CSV_FORMAT,
  type CsvFormat,
  type XlsxColumn,
  type XlsxSheet,
} from "@rebar/core/export";
import { formatDate } from "@rebar/core/shared";

/**
 * Podklady pro přiznání DPH: řádek za každý doklad a sazbu (základ, DPH, celkem), členěné na vydané a přijaté,
 * souhrn po sazbách. Čistá logika bez databáze. Nejde o přiznání: jsou to součty z dokladů, které účetní zkontroluje
 * (nárok na odpočet, krácení, kontrolní hlášení a režimy DPH mimo běžný a přenesený systém neřeší).
 */
export type VatSource = "issued" | "received";

export type VatDoc = {
  /** Id dokladu (pro počet dokladů v souhrnu). */
  id: string;
  source: VatSource;
  number: string;
  kindLabel: string;
  issueDate: string;
  /** Datum zdanitelného plnění (DUZP). */
  taxableDate: string;
  partner: string;
  ico: string;
  dic: string;
  variableSymbol: string;
  /** Přenesená daňová povinnost. */
  reverseCharge: boolean;
  /** Doklad mimo DPH (druhá strana je neplátce). */
  outsideVat: boolean;
  currency: string;
  groups: readonly { vatRateBp: number; netMinor: number; vatMinor: number }[];
};

export type VatBucket = { key: string; label: string; order: number };

/** Zařazení částky: sazba (21 %, 12 %…), 0 %, přenesená daňová povinnost zvlášť, nebo mimo DPH (neplátce). */
export function vatBucket(
  rateBp: number,
  d: Pick<VatDoc, "reverseCharge" | "outsideVat">,
): VatBucket {
  if (d.outsideVat) return { key: "none", label: "mimo DPH (neplátce)", order: 40_000 };
  if (d.reverseCharge) return { key: "pdp", label: "přenesená daňová povinnost", order: 30_000 };
  if (rateBp === 0) return { key: "r0", label: "0 %", order: 20_000 };
  // nejvyšší sazba první
  return {
    key: `r${rateBp}`,
    label: `${(rateBp / 100).toLocaleString("cs-CZ")} %`,
    order: 10_000 - rateBp,
  };
}

export type VatRow = {
  docId: string;
  source: VatSource;
  number: string;
  kindLabel: string;
  issueDate: string;
  taxableDate: string;
  partner: string;
  ico: string;
  dic: string;
  variableSymbol: string;
  regime: string;
  currency: string;
  bucket: VatBucket;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
};

const regimeOf = (d: VatDoc) =>
  d.outsideVat ? "neplátce DPH" : d.reverseCharge ? "přenesená daňová povinnost" : "běžný";

/** Řádky podkladů jednoho dokladu: jeden za sazbu, nulové skupiny se vynechají (vyjma jediné). */
export function vatRows(d: VatDoc): VatRow[] {
  const nonZero = d.groups.filter((g) => g.netMinor !== 0 || g.vatMinor !== 0);
  const groups = nonZero.length ? nonZero : d.groups.slice(0, 1);
  return groups.map((g) => ({
    docId: d.id,
    source: d.source,
    number: d.number,
    kindLabel: d.kindLabel,
    issueDate: d.issueDate,
    taxableDate: d.taxableDate,
    partner: d.partner,
    ico: d.ico,
    dic: d.dic,
    variableSymbol: d.variableSymbol,
    regime: regimeOf(d),
    currency: d.currency,
    bucket: vatBucket(g.vatRateBp, d),
    netMinor: g.netMinor,
    vatMinor: g.vatMinor,
    grossMinor: g.netMinor + g.vatMinor,
  }));
}

/** Řádky všech dokladů seřazené: vydané před přijatými, pak DUZP, číslo a sazba. */
export function vatRowsOf(docs: readonly VatDoc[]): VatRow[] {
  return docs
    .flatMap(vatRows)
    .sort(
      (a, b) =>
        (a.source === b.source ? 0 : a.source === "issued" ? -1 : 1) ||
        a.taxableDate.localeCompare(b.taxableDate) ||
        a.number.localeCompare(b.number, "cs") ||
        a.bucket.order - b.bucket.order,
    );
}

export type VatSummaryLine = {
  source: VatSource | "difference";
  currency: string;
  /** Popis skupiny: sazba, „Celkem“, nebo „Výstup − vstup“. */
  label: string;
  /** Řádek s celkem za druh dokladů. */
  total: boolean;
  count: number | null;
  netMinor: number | null;
  vatMinor: number;
  grossMinor: number | null;
};

/**
 * Souhrn po sazbách: za každou měnu vydané (po sazbách a celkem), přijaté (po sazbách a celkem) a rozdíl DPH
 * (daň na výstupu − daň na vstupu, orientačně). Částky různých měn se nesčítají.
 */
export function vatSummary(rows: readonly VatRow[]): VatSummaryLine[] {
  const out: VatSummaryLine[] = [];
  const currencies = [...new Set(rows.map((r) => r.currency))].sort();
  for (const currency of currencies) {
    const vatOfSource: Record<VatSource, number> = { issued: 0, received: 0 };
    for (const source of ["issued", "received"] as const) {
      const part = rows.filter((r) => r.source === source && r.currency === currency);
      if (!part.length) continue;
      const buckets = new Map<string, { bucket: VatBucket; rows: VatRow[] }>();
      for (const r of part) {
        const b = buckets.get(r.bucket.key) ?? { bucket: r.bucket, rows: [] };
        b.rows.push(r);
        buckets.set(r.bucket.key, b);
      }
      const line = (label: string, rs: VatRow[], total: boolean): VatSummaryLine => ({
        source,
        currency,
        label,
        total,
        count: new Set(rs.map((r) => r.docId)).size,
        netMinor: rs.reduce((a, r) => a + r.netMinor, 0),
        vatMinor: rs.reduce((a, r) => a + r.vatMinor, 0),
        grossMinor: rs.reduce((a, r) => a + r.grossMinor, 0),
      });
      for (const b of [...buckets.values()].sort((a, c) => a.bucket.order - c.bucket.order))
        out.push(line(b.bucket.label, b.rows, false));
      const total = line("Celkem", part, true);
      out.push(total);
      vatOfSource[source] = total.vatMinor;
    }
    out.push({
      source: "difference",
      currency,
      label: "Výstup − vstup (orientačně)",
      total: true,
      count: null,
      netMinor: null,
      vatMinor: vatOfSource.issued - vatOfSource.received,
      grossMinor: null,
    });
  }
  return out;
}

const SOURCE_LABEL: Record<VatSource | "difference", string> = {
  issued: "Vydané",
  received: "Přijaté",
  difference: "Rozdíl DPH",
};

/* ---------- CSV ---------- */

/** Popis řádků souhrnu pod tabulkou CSV (první sloupec). */
const SUMMARY_LABEL: Record<VatSource | "difference", string> = {
  issued: "Souhrn – vydané",
  received: "Souhrn – přijaté",
  difference: "Souhrn – rozdíl DPH",
};

const CSV_HEADER = [
  "Evidence",
  "Číslo dokladu",
  "Druh",
  "DUZP",
  "Vystaveno",
  "Partner",
  "IČO",
  "DIČ",
  "Variabilní symbol",
  "Režim DPH",
  "Měna",
  "Sazba DPH",
  "Základ",
  "DPH",
  "Celkem",
];

/** Datum v CSV: česky (`5. 3. 2026`) pro středník (český Excel), ISO pro čárku (import do jiných systémů). */
const csvDate = (iso: string, f: CsvFormat) =>
  !iso ? "" : f.delimiter === ";" ? formatDate(iso) : iso;

function* csvRows(rows: readonly VatRow[], format: CsvFormat): Generator<string[]> {
  const t = csvSafeText;
  for (const r of rows)
    yield [
      SOURCE_LABEL[r.source],
      t(r.number),
      r.kindLabel,
      csvDate(r.taxableDate, format),
      csvDate(r.issueDate, format),
      t(r.partner),
      t(r.ico),
      t(r.dic),
      t(r.variableSymbol),
      r.regime,
      r.currency,
      r.bucket.label,
      csvMoney(r.netMinor, format),
      csvMoney(r.vatMinor, format),
      csvMoney(r.grossMinor, format),
    ];
  // souhrn pod tabulkou ve stejných sloupcích (po prázdném řádku)
  yield CSV_HEADER.map(() => "");
  for (const s of vatSummary(rows))
    yield [
      SUMMARY_LABEL[s.source],
      s.count === null ? "" : `počet ${s.count}`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      s.currency,
      s.label,
      s.netMinor === null ? "" : csvMoney(s.netMinor, format),
      csvMoney(s.vatMinor, format),
      s.grossMinor === null ? "" : csvMoney(s.grossMinor, format),
    ];
}

/** CSV podkladů DPH po částech: tabulka dokladů po sazbách, pod ní souhrn po sazbách (stejné sloupce). */
export function vatCsv(
  rows: readonly VatRow[],
  format: CsvFormat = DEFAULT_CSV_FORMAT,
): AsyncGenerator<Buffer> {
  return csvLines(CSV_HEADER, csvRows(rows, format), format);
}

/* ---------- XLSX ---------- */

const DETAIL_COLUMNS: XlsxColumn[] = [
  { header: "Číslo dokladu", type: "text", width: 18 },
  { header: "Druh", type: "text", width: 18 },
  { header: "DUZP", type: "date" },
  { header: "Vystaveno", type: "date" },
  { header: "Partner", type: "text", width: 32 },
  { header: "IČO", type: "text", width: 12 },
  { header: "DIČ", type: "text", width: 14 },
  { header: "Variabilní symbol", type: "text", width: 16 },
  { header: "Režim DPH", type: "text", width: 26 },
  { header: "Měna", type: "text", width: 7 },
  { header: "Sazba DPH", type: "text", width: 24 },
  { header: "Základ", type: "money" },
  { header: "DPH", type: "money" },
  { header: "Celkem", type: "money" },
];

const detailCells = (r: VatRow) => [
  r.number,
  r.kindLabel,
  r.taxableDate,
  r.issueDate,
  r.partner,
  r.ico,
  r.dic,
  r.variableSymbol,
  r.regime,
  r.currency,
  r.bucket.label,
  r.netMinor,
  r.vatMinor,
  r.grossMinor,
];

/**
 * Sešit podkladů DPH: list Souhrn (po sazbách a měnách), Vydané a Přijaté (řádek za doklad a sazbu, řádek součtů).
 * Částky jsou čísla v korunách, data skutečná data.
 */
export function vatSheets(rows: readonly VatRow[], period: string): XlsxSheet[] {
  const summary = vatSummary(rows).map((s) => [
    SOURCE_LABEL[s.source],
    s.currency,
    s.label,
    s.count,
    s.netMinor,
    s.vatMinor,
    s.grossMinor,
  ]);
  const detail = (source: VatSource, name: string, title: string): XlsxSheet => {
    const cells = rows.filter((r) => r.source === source).map(detailCells);
    return {
      name,
      title: `${title} · ${period}`,
      columns: DETAIL_COLUMNS,
      rows: cells,
      // součet přes všechny sazby (jen v jedné měně dává smysl; při více měnách je v souhrnu po měnách)
      totals:
        new Set(rows.filter((r) => r.source === source).map((r) => r.currency)).size <= 1
          ? DETAIL_COLUMNS.map((c, i) =>
              i === 0
                ? "Celkem"
                : c.type === "money"
                  ? cells.reduce((a, r) => a + Number(r[i]), 0)
                  : null,
            )
          : undefined,
    };
  };
  return [
    {
      name: "Souhrn",
      title: `Podklady pro přiznání DPH · ${period} · orientační součty z dokladů`,
      columns: [
        { header: "Evidence", type: "text", width: 14 },
        { header: "Měna", type: "text", width: 7 },
        { header: "Sazba DPH", type: "text", width: 28 },
        { header: "Počet dokladů", type: "number", width: 14 },
        { header: "Základ", type: "money" },
        { header: "DPH", type: "money" },
        { header: "Celkem", type: "money" },
      ],
      rows: summary,
    },
    detail("issued", "Vydané", "Vydané doklady po sazbách DPH"),
    detail("received", "Přijaté", "Přijaté doklady po sazbách DPH"),
  ];
}
