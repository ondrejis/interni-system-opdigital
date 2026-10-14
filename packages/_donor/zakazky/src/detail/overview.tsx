"use client";

import { cn, useEntityApi, useNav, type RecordOverviewCard } from "@rebar/ui";
import { TeamCard } from "./team-card";

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
];
