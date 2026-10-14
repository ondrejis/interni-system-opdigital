import { eq } from "drizzle-orm";
import { assertEntityAccess } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import {
  renderPdf,
  type Content,
  type TableCell,
  type TDocumentDefinitions,
} from "@rebar/core/pdf";
import { NotFoundError, PermissionError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { companySetting } from "@rebar/core/settings";
import { formatDate, formatMinor } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import { company, person } from "@rebar/kontakty/schema";
import { job } from "../schema";
import { offerTemplateSetting, type OfferTemplate } from "./offer-template";
import { lineAmount, type ObjectNode, type SectionNode, type VatGroup } from "./math";
import { budgetTreeView } from "./queries";
import type { ItemView, ObjectView, SectionView } from "./types";

type Party = {
  name: string;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  ico?: string | null;
  dic?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type OfferDoc = {
  number: string;
  revision: number;
  title: string;
  address: string | null;
  note: string | null;
  date: string;
  supplier: Party;
  customer: Party;
  contact: string | null;
  currency: string;
  vatPayer: boolean;
  reverseCharge: boolean;
  tree: ObjectNode<ObjectView, SectionView, ItemView>[];
  singleObject: boolean;
  groups: VatGroup[];
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  /** Texty ze šablony nabídky v Nastavení. */
  template?: OfferTemplate & { contact: string };
};

const GRAY = "#6b7280";
const qty = (q: string) => Number(q).toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
const pct = (bp: number) => `${(bp / 100).toLocaleString("cs-CZ")} %`;

function party(title: string, p: Party): Content {
  const lines = [
    { text: p.name, bold: true, fontSize: 11 },
    p.street ?? "",
    [p.zip, p.city].filter(Boolean).join(" "),
    p.ico ? `IČO: ${p.ico}` : "",
    p.dic ? `DIČ: ${p.dic}` : "",
    [p.email, p.phone].filter(Boolean).join(" · "),
  ].filter((l) => l !== "");
  return { stack: [{ text: title, color: GRAY, fontSize: 8, margin: [0, 0, 0, 3] }, ...lines] };
}

/** Nabídka jako PDF: dodavatel, zákazník, rozpad po oddílech jen s prodejními cenami (bez nákladů a marží), DPH po sazbách, podpisy. */
export async function offerPdf(d: OfferDoc): Promise<Buffer> {
  const m = (n: number) => formatMinor(n, d.currency);
  const body: TableCell[][] = [
    [
      { text: "Popis", style: "th" },
      { text: "Množství", style: "th", alignment: "right" },
      { text: "Cena / j.", style: "th", alignment: "right" },
      ...(d.vatPayer && !d.reverseCharge
        ? [{ text: "DPH", style: "th", alignment: "right" } as TableCell]
        : []),
      { text: "Celkem", style: "th", alignment: "right" },
    ],
  ];
  const cols = body[0]!.length;
  const span = (cell: TableCell): TableCell[] => [
    cell,
    ...Array.from({ length: cols - 1 }, () => ({}) as TableCell),
  ];

  const walk = (s: SectionNode<SectionView, ItemView>, depth: number) => {
    const visible = s.items.filter((i) => Number(i.quantity) !== 0);
    if (!visible.length && !s.children.length) return;
    body.push(
      span({
        text: [s.code, s.title].filter(Boolean).join("  "),
        bold: true,
        fillColor: depth === 0 ? "#f3f4f6" : "#f9fafb",
        margin: [depth * 10, 2, 0, 2],
        colSpan: cols,
      } as TableCell),
    );
    for (const i of visible)
      body.push([
        { text: [i.code, i.title].filter(Boolean).join("  "), margin: [depth * 10 + 6, 0, 0, 0] },
        { text: `${qty(i.quantity)} ${i.unit}`, alignment: "right" },
        { text: m(i.unitPriceMinor), alignment: "right" },
        ...(d.vatPayer && !d.reverseCharge
          ? [{ text: pct(i.vatRateBp), alignment: "right" } as TableCell]
          : []),
        { text: m(lineAmount(i.quantity, i.unitPriceMinor)), alignment: "right" },
      ]);
    for (const c of s.children) walk(c, depth + 1);
    body.push(
      span({
        text: `Oddíl ${s.title} celkem: ${m(s.totals.sellMinor)}`,
        alignment: "right",
        italics: true,
        color: GRAY,
        fontSize: 9,
        colSpan: cols,
      } as TableCell),
    );
  };
  for (const o of d.tree) {
    if (!d.singleObject)
      body.push(
        span({
          text: [o.code, o.title].filter(Boolean).join("  "),
          bold: true,
          fontSize: 11,
          margin: [0, 6, 0, 2],
          colSpan: cols,
        } as TableCell),
      );
    o.sections.forEach((s) => walk(s, 0));
  }

  const meta: [string, string][] = [
    ["Datum", formatDate(d.date)],
    ["Zakázka", d.number],
    ...(d.revision > 1 ? ([["Revize", String(d.revision)]] as [string, string][]) : []),
  ];

  const content: Content[] = [
    {
      columns: [
        {
          stack: [
            { text: "NABÍDKA", fontSize: 15, bold: true },
            { text: d.title, fontSize: 12, margin: [0, 2, 0, 0] },
            ...(d.address
              ? [
                  {
                    text: `Místo plnění: ${d.address}`,
                    color: GRAY,
                    fontSize: 9,
                    margin: [0, 2, 0, 0],
                  } as Content,
                ]
              : []),
          ],
        },
        {
          width: "auto",
          table: {
            body: meta.map(([k, v]) => [
              { text: k, color: GRAY, fontSize: 8.5 },
              { text: v, alignment: "right" },
            ]),
          },
          layout: "noBorders",
        },
      ],
      margin: [0, 0, 0, 14],
    },
    {
      columns: [party("DODAVATEL", d.supplier), party("ZÁKAZNÍK", d.customer)],
      columnGap: 30,
      margin: [0, 0, 0, d.contact ? 4 : 14],
    },
    ...(d.contact
      ? [
          {
            text: `Kontaktní osoba: ${d.contact}`,
            color: GRAY,
            fontSize: 9,
            margin: [0, 0, 0, 12],
          } as Content,
        ]
      : []),
    ...(d.template?.introText
      ? [{ text: d.template.introText, margin: [0, 0, 0, 10] } as Content]
      : []),
    ...(d.note ? [{ text: d.note, margin: [0, 0, 0, 10] } as Content] : []),
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto", ...(d.vatPayer && !d.reverseCharge ? ["auto"] : []), "auto"],
        body,
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
          i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.3,
        vLineWidth: () => 0,
        hLineColor: () => "#d1d5db",
        paddingTop: () => 3,
        paddingBottom: () => 3,
      },
      margin: [0, 0, 0, 10],
    },
  ];

  if (d.vatPayer && d.groups.length)
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
                { text: m(g.netMinor), alignment: "right" },
                { text: d.reverseCharge ? "—" : m(g.vatMinor), alignment: "right" },
                { text: m(g.grossMinor), alignment: "right" },
              ] as TableCell[],
          ),
        ],
      },
      layout: "lightHorizontalLines",
    });

  content.push({
    stack: [
      ...(d.vatPayer
        ? [
            {
              text: `Cena bez DPH: ${m(d.netMinor)}`,
              alignment: "right",
              color: GRAY,
              margin: [0, 0, 0, 2],
            } as Content,
          ]
        : []),
      {
        text: `Cena celkem${d.vatPayer && !d.reverseCharge ? " s DPH" : ""}: ${m(d.reverseCharge ? d.netMinor : d.grossMinor)}`,
        alignment: "right",
        fontSize: 14,
        bold: true,
      },
      ...(d.reverseCharge
        ? [
            {
              text: "Daň odvede zákazník (§ 92a zákona o DPH).",
              alignment: "right",
              color: GRAY,
              fontSize: 8.5,
              margin: [0, 3, 0, 0],
            } as Content,
          ]
        : []),
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
    margin: [0, 6, 0, d.template?.termsText || d.template?.validityDays ? 12 : 28],
    unbreakable: true,
  });

  if (d.template?.validityDays)
    content.push({
      text: `Nabídka platí ${d.template.validityDays} dní od data vystavení (${formatDate(d.date)}).`,
      fontSize: 9,
      margin: [0, 0, 0, 6],
    });
  if (d.template?.termsText)
    content.push({
      margin: [0, 0, 0, 22],
      stack: [
        { text: "Podmínky", color: GRAY, fontSize: 8, margin: [0, 0, 0, 2] },
        { text: d.template.termsText, fontSize: 9 },
      ],
    });

  content.push({
    unbreakable: true,
    columns: [
      {
        stack: [
          { text: "Za dodavatele", color: GRAY, fontSize: 8.5 },
          {
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: 36,
                x2: 200,
                y2: 36,
                lineWidth: 0.5,
                lineColor: "#9ca3af",
              },
            ],
          },
          { text: d.supplier.name, fontSize: 9, margin: [0, 2, 0, 0] },
        ],
      },
      {
        stack: [
          { text: "Souhlasím s nabídkou (za zákazníka)", color: GRAY, fontSize: 8.5 },
          {
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: 36,
                x2: 200,
                y2: 36,
                lineWidth: 0.5,
                lineColor: "#9ca3af",
              },
            ],
          },
          { text: `${d.customer.name} · datum a podpis`, fontSize: 9, margin: [0, 2, 0, 0] },
        ],
      },
    ],
    columnGap: 40,
  });

  const def: TDocumentDefinitions = {
    content,
    styles: { th: { bold: true, color: GRAY, fontSize: 8.5 } },
    footer: (page: number, pages: number) => ({
      columns: [
        {
          stack: [
            { text: d.template?.footerText || d.supplier.name },
            ...(d.template?.contact ? [{ text: d.template.contact }] : []),
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
    info: { title: `Nabídka ${d.number}`, author: d.supplier.name },
  };
  return renderPdf(def);
}

/**
 * Podklad pro PDF nabídky. Vyžaduje přístup k zakázce a oprávnění `zakazky.economics`; do dokumentu jdou
 * jen prodejní ceny. Bez `versionId` se vezme poslední nabídka.
 */
export async function buildOfferDoc(
  ctx: Ctx,
  deps: ModuleDeps,
  jobId: string,
  versionId?: string | null,
): Promise<OfferDoc> {
  await assertEntityAccess(ctx, "job", jobId, "read");
  if (!scopeOf(ctx, "zakazky.economics")) throw new PermissionError();
  const offers = (await budgetTreeView(ctx, jobId)).versions.filter((v) => v.kind === "offer");
  const chosen = versionId ? offers.find((v) => v.id === versionId) : offers[offers.length - 1];
  if (!chosen) throw new NotFoundError("Zakázka nemá žádnou nabídku.");
  const tree = await budgetTreeView(ctx, jobId, chosen.id);
  if (!tree.objects.some((o) => o.sections.length))
    throw new UserError("Nabídka zatím nemá žádné položky.");
  const [j] = await ctx.db.select().from(job).where(eq(job.id, jobId));
  if (!j) throw new NotFoundError("Zakázka nenalezena.");
  const [c] = await ctx.db.select().from(company).where(eq(company.id, j.companyId));
  const [p] = j.personId ? await ctx.db.select().from(person).where(eq(person.id, j.personId)) : [];
  const s = await deps.settings.get(ctx.db, companySetting);
  const supplier: Party = {
    name: s.name || "—",
    street: s.street,
    zip: s.zip,
    city: s.city,
    ico: s.ico,
    dic: s.dic,
    email: s.email,
    phone: s.phone,
  };
  const contact = p?.name ?? null;
  const tpl = await deps.settings.get(ctx.db, offerTemplateSetting);
  return {
    number: j.number,
    revision: chosen.number,
    title: chosen.title || j.title,
    address: j.address,
    note: chosen.note,
    date: todayIso(),
    supplier,
    customer: c ? { ...c } : { name: "—" },
    contact,
    currency: j.currency,
    vatPayer: !!s.dic,
    reverseCharge: j.vatMode === "reverse_charge",
    tree: tree.objects,
    singleObject: tree.singleObject,
    groups: tree.vat.groups,
    netMinor: tree.vat.netMinor,
    vatMinor: tree.vat.vatMinor,
    grossMinor: tree.vat.grossMinor,
    template: {
      ...tpl,
      contact: tpl.footerContact
        ? [supplier.email, supplier.phone].filter(Boolean).join(" · ")
        : "",
    },
  };
}

export async function renderOfferPdf(
  ctx: Ctx,
  deps: ModuleDeps,
  jobId: string,
  versionId?: string | null,
) {
  const doc = await buildOfferDoc(ctx, deps, jobId, versionId);
  return {
    filename: `Nabidka_${doc.number.replace(/[^\w-]/g, "_")}${doc.revision > 1 ? `_r${doc.revision}` : ""}.pdf`,
    buffer: await offerPdf(doc),
  };
}
