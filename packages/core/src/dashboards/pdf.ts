import type { Content, TableCell } from "pdfmake/interfaces";
import type { ExportHeader } from "../export/pdf-table";
import { renderPdf } from "../pdf/render";
import { cellText } from "./result-table";
import { formatValue } from "./format";
import { PERIOD_LABELS } from "./types";
import type { WidgetOutcome, WidgetResult } from "./types";

export type DashboardPdfInput = {
  title: string;
  header: ExportHeader;
  /** Popis použitých filtrů nástěnky (období, zakázka, osoba). */
  filterText: string;
  widgets: readonly {
    id: string;
    title: string;
    /** Šířka ve sloupcích z 12; malé widgety (KPI) se řadí vedle sebe. */
    w: number;
    outcome: WidgetOutcome;
  }[];
  generatedAt: string;
};

const GRAY = "#6b6e78";
const ACCENT = "#2563eb";
const SERIES = [
  "#2563eb",
  "#d97706",
  "#15803d",
  "#7c3aed",
  "#0f766e",
  "#b91c1c",
  "#4b5563",
  "#a16207",
];
const BAR_W = 90;

const card = (title: string, body: Content[]): Content => ({
  stack: [{ text: title, bold: true, fontSize: 9, color: GRAY, margin: [0, 0, 0, 3] }, ...body],
  margin: [0, 0, 0, 10],
});

function bar(value: number, max: number, color = ACCENT): TableCell {
  const w = max > 0 ? Math.max(0, Math.min(BAR_W, (Math.abs(value) / max) * BAR_W)) : 0;
  return {
    canvas: [{ type: "rect", x: 0, y: 2, w, h: 6, color }],
    margin: [0, 0, 0, 0],
  } as TableCell;
}

function body(result: WidgetResult): Content[] {
  switch (result.kind) {
    case "kpi": {
      const d = result.delta;
      return [
        { text: result.text ?? formatValue(result.format, result.value), fontSize: 20, bold: true },
        ...(d
          ? [
              {
                text: `${d.abs >= 0 ? "+" : "−"}${formatValue(result.format, Math.abs(d.abs))}${d.pct === null ? "" : ` (${d.pct >= 0 ? "+" : "−"}${Math.abs(Math.round(d.pct * 10) / 10)} %)`} proti předchozímu období`,
                color: GRAY,
                fontSize: 8,
              } as Content,
            ]
          : []),
      ];
    }
    case "gauge":
      return [
        {
          text: `${formatValue(result.format, result.value)} z ${formatValue(result.format, result.target)}${result.pct === null ? "" : ` (${Math.round(result.pct)} %)`}`,
          fontSize: 14,
          bold: true,
        },
        {
          canvas: [
            { type: "rect", x: 0, y: 0, w: 200, h: 8, color: "#e6e6ea" },
            {
              type: "rect",
              x: 0,
              y: 0,
              w: Math.min(200, ((result.pct ?? 0) / 100) * 200),
              h: 8,
              color: (result.pct ?? 0) >= 100 ? "#15803d" : ACCENT,
            },
          ],
          margin: [0, 4, 0, 0],
        },
      ];
    case "chart": {
      const max = Math.max(
        1,
        ...result.series.flatMap((s) => s.values.map((v) => Math.abs(v ?? 0))),
      );
      const f = result.format;
      return [
        {
          table: {
            headerRows: 1,
            widths: ["*", ...result.series.map(() => 70), BAR_W],
            body: [
              [
                { text: "", style: "th" },
                ...result.series.map((s) => ({
                  text: s.label,
                  bold: true,
                  alignment: "right" as const,
                })),
                { text: "", style: "th" },
              ],
              ...result.categories.map((c, i) => [
                { text: c.label },
                ...result.series.map((s) => ({
                  text: formatValue(f, s.values[i] ?? null),
                  alignment: "right" as const,
                })),
                bar(result.series[0]?.values[i] ?? 0, max, SERIES[0]),
              ]),
            ],
          },
          layout: "lightHorizontalLines",
          fontSize: 8.5,
        } as Content,
      ];
    }
    case "status":
      return [
        {
          table: {
            widths: ["*", 50, 90],
            body: [
              [
                { text: "Stav", bold: true },
                { text: "Počet", bold: true, alignment: "right" },
                { text: "Hodnota", bold: true, alignment: "right" },
              ],
              ...result.stages.map((s) => [
                s.name,
                { text: String(s.count), alignment: "right" as const },
                { text: formatValue(result.format, s.value), alignment: "right" as const },
              ]),
            ],
          },
          layout: "lightHorizontalLines",
          fontSize: 8.5,
        } as Content,
      ];
    case "table":
      return [
        {
          table: {
            headerRows: 1,
            widths: result.columns.map((_, i) => (i === 0 ? "*" : "auto")),
            body: [
              result.columns.map((c) => ({
                text: c.label,
                bold: true,
                alignment:
                  c.type === "text" || c.type === "date" || c.type === "status"
                    ? ("left" as const)
                    : ("right" as const),
              })),
              ...result.rows.slice(0, 25).map((r) =>
                result.columns.map((c) => ({
                  text: cellText(c.type, result.format, r.cells[c.key]),
                  alignment:
                    c.type === "text" || c.type === "date" || c.type === "status"
                      ? ("left" as const)
                      : ("right" as const),
                })),
              ),
            ],
          },
          layout: "lightHorizontalLines",
          fontSize: 8.5,
        } as Content,
      ];
    case "list":
      return result.items.length
        ? [
            {
              ul: result.items.map((i) => ({
                text: [
                  { text: i.title, bold: true },
                  ...(i.subtitle ? [{ text: ` · ${i.subtitle}`, color: GRAY }] : []),
                  ...(i.date
                    ? [
                        {
                          text: ` · ${cellText("date", undefined, i.date)}`,
                          color: i.tone === "danger" ? "#c2272d" : GRAY,
                        },
                      ]
                    : []),
                ],
              })),
              fontSize: 8.5,
            } as Content,
          ]
        : [{ text: "Nic k zobrazení.", color: GRAY }];
    case "attention":
      return result.items.length
        ? [
            {
              ul: result.items.map((i) => `${i.title}${i.detail ? ` – ${i.detail}` : ""}`),
              fontSize: 8.5,
            } as Content,
          ]
        : [{ text: "Teď nic nehoří.", color: GRAY }];
    case "tiles":
      return [
        {
          table: {
            widths: ["*", "auto"],
            body: result.tiles.map((t) => [
              t.title,
              { text: t.value, bold: true, alignment: "right" as const },
            ]),
          },
          layout: "lightHorizontalLines",
          fontSize: 8.5,
        } as Content,
      ];
    case "empty":
      return [{ text: result.message, color: GRAY }];
  }
}

/**
 * Snímek nástěnky do PDF pro poradu: hlavička klienta, použité filtry a widgety v pořadí nástěnky. KPI se řadí do řad,
 * grafy mají podobu tabulky s pruhy (bez rastrových obrázků a těžkých závislostí). Widget, který se nenačetl, má místo
 * obsahu důvod.
 */
export async function renderDashboardPdf(input: DashboardPdfInput): Promise<Buffer> {
  const content: Content[] = [
    {
      columns: [
        {
          stack: [
            { text: input.header.brand, fontSize: 12, bold: true },
            ...(input.header.lines ?? []).map((l) => ({ text: l, color: GRAY, fontSize: 8 })),
          ],
        },
        { text: input.generatedAt, alignment: "right", color: GRAY, fontSize: 8 },
      ],
      margin: [0, 0, 0, 8],
    },
    { text: input.title, fontSize: 16, bold: true },
    { text: input.filterText, color: GRAY, fontSize: 8.5, margin: [0, 2, 0, 10] },
  ];
  // malé widgety (šířka ≤ 4 sloupce) vedle sebe, ostatní na celou šířku
  let i = 0;
  const ws = input.widgets;
  while (i < ws.length) {
    const w = ws[i]!;
    const render = (x: (typeof ws)[number]): Content =>
      card(
        x.title,
        x.outcome.ok
          ? body(x.outcome.result)
          : [
              {
                text: `Widget se nepodařilo načíst: ${x.outcome.error}`,
                color: "#c2272d",
                fontSize: 8.5,
              },
            ],
      );
    if (w.w <= 4) {
      const row: (typeof ws)[number][] = [];
      while (i < ws.length && ws[i]!.w <= 4 && row.length < 4) row.push(ws[i++]!);
      content.push({ columns: row.map(render), columnGap: 12 });
    } else {
      content.push(render(w));
      i++;
    }
  }
  return renderPdf({
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [32, 30, 32, 36],
    content,
    footer: (page: number, pages: number) => ({
      text: `${input.header.brand} · strana ${page} z ${pages}`,
      alignment: "right",
      color: GRAY,
      fontSize: 8,
      margin: [0, 0, 32, 0],
    }),
  });
}

/** Popis filtrů nástěnky pro hlavičku PDF. */
export function describeFilters(
  f: { period: keyof typeof PERIOD_LABELS; from?: string | undefined; to?: string | undefined },
  extra: {
    range: { from: string; to: string } | null;
    job?: string | undefined;
    user?: string | undefined;
  },
): string {
  const parts: string[] = [];
  parts.push(
    extra.range
      ? `Období: ${cellText("date", undefined, extra.range.from)} – ${cellText("date", undefined, extra.range.to)} (${PERIOD_LABELS[f.period]})`
      : `Období: ${PERIOD_LABELS[f.period]}`,
  );
  if (extra.job) parts.push(`Zakázka: ${extra.job}`);
  if (extra.user) parts.push(`Osoba: ${extra.user}`);
  return parts.join(" · ");
}
