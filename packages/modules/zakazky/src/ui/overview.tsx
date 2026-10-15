"use client";

import { formatDate } from "@rebar/core/shared";
import {
  Card,
  CardBody,
  CardHeader,
  Chip,
  Skeleton,
  useEntityApi,
  useNav,
  type RecordOverviewCard,
} from "@rebar/ui";
import { Handshake, ListChecks } from "lucide-react";
import { PHASE_STATUS_LABELS } from "../shared";
import { useJobDetail } from "./hooks";
import { phaseProgress } from "./logic";
import { LoadError } from "./parts";
import { ParticipantsCard, TeamCard } from "./team";

const PHASE_COLORS = {
  not_started: "gray",
  in_progress: "blue",
  done: "green",
  skipped: "gray",
} as const;

/** Karta Fáze na Přehledu: stav, plánovaná data a počet otevřených úkolů každé fáze. */
function PhasesCard({ jobId }: { jobId: string }) {
  const q = useJobDetail(jobId);
  const p = q.data?.phases ?? [];
  const progress = phaseProgress(p);
  return (
    <Card aria-label="Fáze zakázky">
      <CardHeader
        title="Fáze"
        icon={<ListChecks />}
        count={q.data ? `${progress.done}/${progress.total}` : undefined}
      />
      <CardBody flush>
        {q.isLoading ? (
          <Skeleton className="m-4 h-20" />
        ) : q.error ? (
          <div className="p-4">
            <LoadError message={q.error.message} onRetry={() => void q.refetch()} />
          </div>
        ) : p.length === 0 ? (
          <p className="p-4 text-sm text-muted">Zakázka nemá žádné fáze.</p>
        ) : (
          <ol className="divide-y divide-line-soft">
            {p.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
                data-testid="overview-phase"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                <Chip color={PHASE_COLORS[f.status]} dot>
                  {PHASE_STATUS_LABELS[f.status]}
                </Chip>
                {(f.plannedStart || f.plannedEnd) && (
                  <span className="tabular text-sm text-muted">
                    {formatDate(f.plannedStart)}–{formatDate(f.plannedEnd)}
                  </span>
                )}
                {f.openTasks ? (
                  <span className="text-sm text-muted">{f.openTasks} otevřených úkolů</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

/** Odkaz na původní obchod, ze kterého zakázka vznikla. */
function DealCard({ jobId }: { jobId: string }) {
  const api = useEntityApi();
  const { Link } = useNav();
  const q = useJobDetail(jobId);
  const dealId = q.data?.job.dealId;
  const href = dealId ? api.hrefFor("deal", dealId) : null;
  if (!href) return null;
  return (
    <Card aria-label="Původní obchod">
      <CardHeader title="Původní obchod" icon={<Handshake />} />
      <CardBody>
        <Link href={href} className="text-accent hover:underline">
          Zakázka vznikla z obchodu — otevřít
        </Link>
      </CardBody>
    </Card>
  );
}

/** Karty Přehledu zakázky; ostatní moduly přidávají další přes `recordOverview`. */
export const OVERVIEW_CARDS: RecordOverviewCard[] = [
  { id: "phases", order: 10, render: ({ id }) => <PhasesCard jobId={id} /> },
  { id: "deal", order: 20, render: ({ id }) => <DealCard jobId={id} /> },
  {
    id: "team",
    column: "side",
    order: 10,
    render: ({ id, entity }) => <TeamCard jobId={id} canEdit={entity.can.write} />,
  },
  {
    id: "participants",
    column: "side",
    order: 20,
    render: ({ id, entity }) => <ParticipantsCard jobId={id} canEdit={entity.can.write} />,
  },
];
