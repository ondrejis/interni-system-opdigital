import {
  renderPdf,
  type Content,
  type TableCell,
  type TDocumentDefinitions,
} from "@rebar/core/pdf";
import { formatDate, formatMinor } from "@rebar/core/shared";
import { czAccountToIban, spdPayload } from "./iban";
import type { PartySnapshot } from "./schema";
import {
  REVERSE_CHARGE_TEXT,
  retentionPct,
  type LineRole,
  type VatGroup,
  type VatMode,
} from "./totals";

export type InvoiceTemplate = {
  intro: string;
  footer: string;
  /** Kontakt firmy (e-mail, telefon, web) pod textem patičky; prázdný = netiskne se. */
  contact?: string;
  /** Platební podmínky pod součty. */
  terms?: string;
  showQr: boolean;
};

export type InvoiceDoc = {
  number: string | null;
  kind: string;
  state: string;
  issueDate: string | null;
  taxableDate: string | null;
  dueDate: string | null;
  supplier: PartySnapshot;
  customer: PartySnapshot;
  jobNumber?: string | null;
  originalNumber?: string | null;
  /** Soupis provedených prací, ze kterého faktura vznikla. */
  statement?: { number: number; periodFrom: string; periodTo: string } | null;
  lines: {
    description: string;
    quantity: string;
    unit: string;
    unitPriceMinor: number;
    vatRateBp: number;
    netMinor: number;
    vatMinor: number;
    grossMinor: number;
    role?: LineRole;
  }[];
  groups: VatGroup[];
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  paidMinor: number;
  currency: string;
  variableSymbol: string | null;
  note: string | null;
  template: InvoiceTemplate;
  vatPayer: boolean;
  /** Přenesená daňová povinnost: doklad bez DPH s povinným textem. */
  vatMode?: VatMode;
  /** Kód klasifikace produkce CZ-CPA pro doklad s přenesenou daňovou povinností (nepovinný). */
  reverseChargeCpa?: string | null;
  /** Zádržné stržené z dokladu: základ, částka s DPH a celkem před zádržným. */
  retention?: {
    /** Sazba zádržného zakázky v setinách procenta. */
    bp: number;
    retentionNetMinor: number;
    retentionGrossMinor: number;
    grossBeforeMinor: number;
  } | null;
};

const GRAY = "#6b7280";
const money = (n: number, cur: string) => formatMinor(n, cur);
const qty = (q: string) => Number(q).toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
const pct = (bp: number) => `${(bp / 100).toLocaleString("cs-CZ")} %`;

export function documentTitle(kind: string, vatPayer: boolean): string {
  switch (kind) {
    case "proforma":
      return "Zálohová faktura";
    case "credit_note":
      return vatPayer ? "Dobropis – opravný daňový doklad" : "Dobropis";
    case "retention":
      return vatPayer ? "Faktura – uvolnění zádržného" : "Uvolnění zádržného";
    default:
      return vatPayer ? "Faktura – daňový doklad" : "Faktura";
  }
}

function party(title: string, p: PartySnapshot): Content {
  const lines = [
    { text: p.name, bold: true, fontSize: 11 },
    [p.street].filter(Boolean).join(""),
    [p.zip, p.city].filter(Boolean).join(" "),
    p.ico ? `IČO: ${p.ico}` : "",
    p.dic ? `DIČ: ${p.dic}` : "",
  ].filter((l) => l !== "");
  return { stack: [{ text: title, color: GRAY, fontSize: 8, margin: [0, 0, 0, 3] }, ...lines] };
}

/** Faktura jako PDF: dodavatel, odběratel, položky, rekapitulace DPH, QR platba a text ze šablony dokladu. */
export async function invoicePdf(d: InvoiceDoc): Promise<Buffer> {
  const iban = czAccountToIban(d.supplier.bankAccount);
  const remaining = d.kind === "credit_note" ? 0 : Math.max(0, d.grossMinor - d.paidMinor);
  const reverse = d.vatMode === "reverse_charge";
  /** Sloupec a rekapitulace DPH se tisknou jen u plátce a jen v běžném režimu. */
  const showVat = d.vatPayer && !reverse;
  const isCredit = d.kind === "credit_note";

  const head: TableCell[] = [
    { text: "Popis", style: "th" },
    { text: "Množství", style: "th", alignment: "right" },
    { text: "Cena / j.", style: "th", alignment: "right" },
    ...(showVat ? [{ text: "DPH", style: "th", alignment: "right" } as TableCell] : []),
    { text: showVat || reverse ? "Základ" : "Celkem", style: "th", alignment: "right" },
  ];
  const rows: TableCell[][] = d.lines.map((l) => {
    const sub = l.role === "retention" || l.role === "advance" || l.role === "previous";
    const style = sub ? { italics: true, color: "#374151" } : {};
    return [
      { text: l.description, ...style },
      { text: `${qty(l.quantity)} ${l.unit}`, alignment: "right", ...style },
      { text: money(l.unitPriceMinor, d.currency), alignment: "right", ...style },
      ...(showVat ? [{ text: pct(l.vatRateBp), alignment: "right", ...style } as TableCell] : []),
      {
        text: money(showVat || reverse ? l.netMinor : l.grossMinor, d.currency),
        alignment: "right",
        ...style,
      },
    ];
  });

  const meta: [string, string][] = [
    ["Datum vystavení", d.issueDate ? formatDate(d.issueDate) : "—"],
    ...((showVat || reverse) && d.kind !== "proforma"
      ? ([["Datum zdanitelného plnění", d.taxableDate ? formatDate(d.taxableDate) : "—"]] as [
          string,
          string,
        ][])
      : []),
    ["Splatnost", d.dueDate ? formatDate(d.dueDate) : "—"],
    ["Variabilní symbol", d.variableSymbol ?? "—"],
    ...(d.supplier.bankAccount
      ? ([["Číslo účtu", d.supplier.bankAccount]] as [string, string][])
      : []),
    ["Způsob úhrady", "převodem"],
    ...(d.jobNumber ? ([["Zakázka", d.jobNumber]] as [string, string][]) : []),
    ...(d.originalNumber ? ([["K dokladu", d.originalNumber]] as [string, string][]) : []),
    ...(d.statement
      ? ([
          [
            "Soupis prací",
            `č. ${d.statement.number}, ${formatDate(d.statement.periodFrom)} – ${formatDate(d.statement.periodTo)}`,
          ],
        ] as [string, string][])
      : []),
    ...(reverse ? ([["Režim DPH", "přenesená daň. povinnost"]] as [string, string][]) : []),
  ];

  const qrText =
    d.template.showQr && iban && !isCredit && d.kind !== "credit_note" && remaining > 0
      ? spdPayload({
          iban,
          amountMinor: remaining,
          currency: d.currency,
          variableSymbol: d.variableSymbol,
          message: `${documentTitle(d.kind, false)} ${d.number ?? ""}`,
        })
      : null;

  const content: Content[] = [
    {
      columns: [
        {
          stack: [
            { text: documentTitle(d.kind, showVat).toUpperCase(), fontSize: 15, bold: true },
            {
              text: d.number ?? "NÁVRH (číslo se přidělí při vystavení)",
              fontSize: 12,
              margin: [0, 2, 0, 0],
            },
          ],
        },
        {
          width: "auto",
          table: {
            body: meta.map(([k, v]) => [
              { text: k, color: GRAY, fontSize: 8.5 },
              { text: v, alignment: "right", bold: k === "Variabilní symbol" },
            ]),
          },
          layout: "noBorders",
        },
      ],
      margin: [0, 0, 0, 14],
    },
    {
      columns: [party("DODAVATEL", d.supplier), party("ODBĚRATEL", d.customer)],
      columnGap: 30,
      margin: [0, 0, 0, 14],
    },
    ...(d.template.intro ? [{ text: d.template.intro, margin: [0, 0, 0, 8] } as Content] : []),
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto", ...(showVat ? ["auto"] : []), "auto"],
        body: [head, ...rows],
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
          i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.3,
        vLineWidth: () => 0,
        hLineColor: () => "#d1d5db",
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [0, 0, 0, 10],
    },
  ];

  if (showVat && d.groups.length) {
    content.push({
      alignment: "right",
      margin: [0, 0, 0, 8],
      table: {
        headerRows: 1,
        widths: ["auto", "auto", "auto", "auto"],
        body: [
          [
            { text: "Sazba", style: "th" },
            { text: "Základ", style: "th", alignment: "right" },
            { text: "DPH", style: "th", alignment: "right" },
            { text: "Celkem", style: "th", alignment: "right" },
          ],
          ...d.groups.map(
            (g) =>
              [
                pct(g.vatRateBp),
                { text: money(g.netMinor, d.currency), alignment: "right" },
                { text: money(g.vatMinor, d.currency), alignment: "right" },
                { text: money(g.grossMinor, d.currency), alignment: "right" },
              ] as TableCell[],
          ),
        ],
      },
      layout: "lightHorizontalLines",
    });
  }

  content.push({
    columns: [
      qrText
        ? {
            width: 100,
            stack: [
              { qr: qrText, fit: 90 },
              { text: "QR platba", fontSize: 7.5, color: GRAY, margin: [14, 2, 0, 0] },
            ],
          }
        : { width: 100, text: "" },
      {
        stack: [
          ...(d.retention
            ? ([
                {
                  text: `Celkem před zádržným: ${money(d.retention.grossBeforeMinor, d.currency)}`,
                  alignment: "right",
                  color: GRAY,
                  margin: [0, 0, 0, 2],
                },
                {
                  text: `Zádržné ${retentionPct(d.retention.bp)} %: − ${money(d.retention.retentionGrossMinor, d.currency)}${showVat ? " (včetně DPH)" : ""}`,
                  alignment: "right",
                  color: GRAY,
                  margin: [0, 0, 0, 3],
                },
              ] as Content[])
            : []),
          ...(d.paidMinor > 0 && !isCredit
            ? [
                {
                  text: `Uhrazeno: ${money(d.paidMinor, d.currency)}`,
                  alignment: "right",
                  color: GRAY,
                  margin: [0, 0, 0, 3],
                } as Content,
              ]
            : []),
          {
            text: isCredit
              ? `Celkem k vrácení: ${money(Math.abs(d.grossMinor), d.currency)}`
              : `Celkem k úhradě: ${money(remaining || d.grossMinor, d.currency)}`,
            alignment: "right",
            fontSize: 14,
            bold: true,
          },
          ...(!d.vatPayer
            ? [
                {
                  text: "Dodavatel není plátcem DPH.",
                  alignment: "right",
                  color: GRAY,
                  fontSize: 8,
                  margin: [0, 3, 0, 0],
                } as Content,
              ]
            : []),
        ],
      },
    ],
    margin: [0, 6, 0, 10],
  });
  if (reverse)
    content.push({
      margin: [0, 0, 0, 8],
      stack: [
        { text: REVERSE_CHARGE_TEXT, bold: true },
        {
          text: `Základ daně: ${money(d.netMinor, d.currency)}, DPH se na dokladu neuvádí. DIČ odběratele: ${d.customer.dic ?? "—"}.${
            d.reverseChargeCpa ? ` Kód klasifikace produkce (CZ-CPA): ${d.reverseChargeCpa}.` : ""
          }`,
          color: GRAY,
          fontSize: 9,
          margin: [0, 2, 0, 0],
        },
      ],
    });
  if (d.retention)
    content.push({
      text: `Zádržné se uvolňuje samostatným dokladem po předání díla nebo po uplynutí záruky.`,
      color: GRAY,
      fontSize: 8.5,
      margin: [0, 0, 0, 8],
    });
  if (d.note) content.push({ text: d.note, margin: [0, 0, 0, 8], italics: true });
  if (d.template.terms)
    content.push({
      margin: [0, 0, 0, 8],
      stack: [
        { text: "Platební podmínky", color: GRAY, fontSize: 8, margin: [0, 0, 0, 2] },
        { text: d.template.terms, fontSize: 9 },
      ],
    });

  const def: TDocumentDefinitions = {
    content,
    styles: { th: { bold: true, color: GRAY, fontSize: 8.5 } },
    footer: (page: number, pages: number) => ({
      columns: [
        {
          stack: [
            { text: d.template.footer || d.supplier.name },
            ...(d.template.contact ? [{ text: d.template.contact }] : []),
          ],
          color: GRAY,
          fontSize: 8,
          margin: [40, 0, 0, 0],
        },
        {
          text: `${page} / ${pages}`,
          alignment: "right",
          color: GRAY,
          fontSize: 8,
          margin: [0, 0, 40, 0],
        },
      ],
    }),
    ...(d.state === "draft"
      ? { watermark: { text: "NÁVRH", color: "#9ca3af", opacity: 0.15, bold: true } }
      : {}),
    info: {
      title: `${documentTitle(d.kind, showVat)} ${d.number ?? ""}`.trim(),
      author: d.supplier.name,
    },
  };
  return renderPdf(def);
}
