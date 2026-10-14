"use client";

import { formatMinor } from "@rebar/core/shared";
import {
  Skeleton,
  cn,
  useCommandQuery,
  useEntityApi,
  useNav,
  type RecordOverviewCard,
} from "@rebar/ui";
import { ShareCard } from "../share/ui";
import { fromPreparation } from "./visibility";
import { paidShare, summaryFromRow, type JobSummary } from "./kpis";
import { TeamCard } from "./team-card";

/** Stav fakturace: kolik z ceny zakázky je vyfakturováno a uhrazeno. Vidí jen držitel `zakazky.economics`. */
function InvoicingCard({ id, row }: { id: string; row: Record<string, unknown> }) {
  const q = useCommandQuery<JobSummary>("zakazky.summary", { jobId: id });
  const s = q.data ?? (q.isLoading ? null : summaryFromRow(row));
  if (!s) return <Skeleton className="h-20" />;
  const billed =
    s.contractMinor > 0 ? Math.min(100, Math.round((s.invoicedMinor / s.contractMinor) * 100)) : 0;
  const paid = paidShare(s.invoicedMinor, s.paidMinor);
  return (
    <section aria-label="Stav fakturace" className="rounded-lg border border-line p-4">
      <h3 className="mb-2 text-sm font-semibold">Stav fakturace</h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Smluvní cena</dt>
          <dd className="tabular font-medium">{formatMinor(s.contractMinor)}</dd>
        </div>
        <div>
          <dt className="text-muted">Fakturováno</dt>
          <dd className="tabular font-medium">{formatMinor(s.invoicedMinor)}</dd>
        </div>
        <div>
          <dt className="text-muted">Uhrazeno</dt>
          <dd className="tabular font-medium">{formatMinor(s.paidMinor)}</dd>
        </div>
      </dl>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-hover"
        role="img"
        aria-label={`Vyfakturováno ${billed} % ceny zakázky, uhrazeno ${paid} % faktur`}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${billed}%` }} />
      </div>
      <p className="mt-1.5 text-sm text-muted">
        Vyfakturováno {billed} % ceny zakázky
        {s.invoicedMinor > 0 && <>, z faktur uhrazeno {paid} %</>}.
      </p>
    </section>
  );
}

/** Poptávka, ze které zakázka vznikla (odkaz), pokud ji zakázka eviduje. */
function SourceInquiryCard({ row }: { row: Record<string, unknown> }) {
  const api = useEntityApi();
  const { Link } = useNav();
  const id = typeof row.sourceInquiry === "string" ? row.sourceInquiry : null;
  const href = id ? api.hrefFor("inquiry", id) : null;
  if (!href) return null;
  return (
    <section aria-label="Zdrojová poptávka" className={cn("rounded-lg border border-line p-4")}>
      <h3 className="mb-1 text-sm font-semibold">Poptávka</h3>
      <Link href={href} className="text-sm text-accent hover:underline">
        Zakázka vznikla z poptávky — otevřít
      </Link>
    </section>
  );
}

/** Vlastní karty Přehledu zakázky; ostatní oblasti a moduly přidávají další přes `recordOverview`. */
export const OVERVIEW_CARDS: RecordOverviewCard[] = [
  {
    id: "invoicing",
    order: 60,
    permission: "zakazky.economics",
    visible: fromPreparation,
    render: ({ id, row }) => <InvoicingCard id={id} row={row} />,
  },
  {
    id: "source-inquiry",
    order: 90,
    render: ({ row }) => <SourceInquiryCard row={row} />,
  },
  {
    id: "team",
    column: "side",
    order: 10,
    render: ({ id, entity }) => <TeamCard jobId={id} canEdit={entity.can.write} />,
  },
  {
    id: "share",
    column: "side",
    order: 50,
    permission: "zakazky.share",
    render: ({ id }) => <ShareCard jobId={id} />,
  },
];
