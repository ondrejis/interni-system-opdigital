"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Card,
  CardBody,
  CardHeader,
  Chip,
  Icon,
  Skeleton,
  useCan,
  useCommandQuery,
  useEntityApi,
  useNav,
  type ActivityResult,
} from "@rebar/ui";
import { useEffect, useState } from "react";
import type { ClientContextDto } from "../contract";
import { useClientSummary } from "./hooks";

const CONTEXT_LABELS: [keyof ClientContextDto, string][] = [
  ["decisionMaker", "Kdo rozhoduje"],
  ["howToCommunicate", "Jak komunikovat"],
  ["history", "Historie spolupráce"],
  ["notes", "Na co si dát pozor"],
];

/** Karta „Kontext“ na Přehledu: čtyři pole kontextu, kliknutí vede na záložku Kontext. */
export function ContextCard({
  companyId,
  openTab,
}: {
  companyId: string;
  openTab: (tab: string) => void;
}) {
  const q = useClientSummary(companyId);
  if (q.isLoading) return <Skeleton className="h-24" />;
  const ctx = q.data?.context;
  const filled = ctx ? CONTEXT_LABELS.filter(([k]) => ctx[k]) : [];
  return (
    <Card aria-label="Kontext" data-testid="overview-context">
      <CardHeader
        title="Kontext"
        action={
          <button
            type="button"
            className="text-sm text-accent hover:underline"
            onClick={() => openTab("kontext")}
          >
            {filled.length ? "Upravit" : "Doplnit"}
          </button>
        }
      />
      <CardBody>
        {filled.length === 0 ? (
          <p className="text-muted">
            Zatím bez kontextu: kdo rozhoduje, jak komunikovat, na co si dát pozor.
          </p>
        ) : (
          <dl className="space-y-2">
            {filled.map(([k, label]) => (
              <div key={k}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="whitespace-pre-line [overflow-wrap:anywhere]">{ctx![k]}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

type JobCard = {
  id: string;
  number: string;
  title: string;
  companyId: string;
  status: string;
  currentPhaseName: string | null;
  dueDate: string | null;
  overdue: boolean;
};
type DealCard = { id: string; title: string; companyId: string | null; valueMinor: number | null };
type DealBoard = { columns: { stage: { name: string }; cards: DealCard[] }[] };

/** Aktivní zakázky klienta s fází (KLI-05); data z `zakazky.board` (modul sám hlídá soukromí a rozsah). */
export function ActiveJobsCard({ companyId }: { companyId: string }) {
  const { Link } = useNav();
  const q = useCommandQuery<{ columns: { cards: JobCard[] }[] }, { by: "status" }>(
    "zakazky.board",
    { by: "status" },
  );
  if (q.isLoading) return <Skeleton className="h-20" />;
  if (q.error || !q.data) return null;
  const jobs = q.data.columns
    .flatMap((c) => c.cards)
    .filter((j) => j.companyId === companyId && ["planned", "active", "paused"].includes(j.status));
  return (
    <Card aria-label="Aktivní zakázky" data-testid="overview-jobs">
      <CardHeader title="Aktivní zakázky" count={jobs.length} />
      <CardBody flush>
        {jobs.length === 0 ? (
          <p className="px-4 py-3 text-muted">Žádná aktivní zakázka.</p>
        ) : (
          <ul>
            {jobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-2 first:border-t-0"
              >
                <Link
                  href={`/zakazky/${j.id}`}
                  className="min-w-0 flex-1 truncate font-medium hover:underline"
                >
                  <span className="text-muted">{j.number}</span> {j.title}
                </Link>
                {j.currentPhaseName && <Chip color="blue">{j.currentPhaseName}</Chip>}
                {j.dueDate && (
                  <span className={j.overdue ? "text-danger" : "text-muted"}>
                    do {formatDate(j.dueDate)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Otevřené obchody klienta s fází a hodnotou (KLI-05); data z `obchody.board`. */
export function OpenDealsCard({ companyId }: { companyId: string }) {
  const { Link } = useNav();
  const q = useCommandQuery<DealBoard, Record<string, never>>("obchody.board", {});
  if (q.isLoading) return <Skeleton className="h-20" />;
  if (q.error || !q.data) return null;
  const deals = q.data.columns.flatMap((c) =>
    c.cards.filter((d) => d.companyId === companyId).map((d) => ({ ...d, stage: c.stage.name })),
  );
  return (
    <Card aria-label="Otevřené obchody" data-testid="overview-deals">
      <CardHeader title="Otevřené obchody" count={deals.length} />
      <CardBody flush>
        {deals.length === 0 ? (
          <p className="px-4 py-3 text-muted">Žádný otevřený obchod.</p>
        ) : (
          <ul>
            {deals.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-2 first:border-t-0"
              >
                <Link
                  href={`/obchody/${d.id}`}
                  className="min-w-0 flex-1 truncate font-medium hover:underline"
                >
                  {d.title}
                </Link>
                <Chip color="purple">{d.stage}</Chip>
                {d.valueMinor !== null && (
                  <span className="tabular text-muted">{formatMinor(d.valueMinor)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Finanční souhrn (KLI-10): celkem zaplaceno, za 12 měsíců, aktivní měsíční retainer, nezaplacené. */
export function FinanceCard({ companyId }: { companyId: string }) {
  const q = useClientSummary(companyId);
  if (q.isLoading) return <Skeleton className="h-24" />;
  const d = q.data;
  if (!d || !d.canSeeFinance) return null;
  const f = d.summary.finance;
  const items: [string, string, string][] = [
    ["Celkem zaplaceno", formatMinor(f.incomeTotalMinor), "finance-total"],
    ["Za 12 měsíců", formatMinor(f.income12mMinor), "finance-12m"],
    [
      "Měsíční retainer",
      f.activeRetainerMinor ? formatMinor(f.activeRetainerMinor) : "—",
      "finance-retainer",
    ],
    ["Nezaplacené platby", String(f.unpaidCount), "finance-unpaid"],
  ];
  return (
    <Card aria-label="Finance" data-testid="overview-finance">
      <CardHeader title="Finance" />
      <CardBody>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {items.map(([label, value, id]) => (
            <div key={id} data-testid={id}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="tabular text-lg font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {d.financeSharedOnly && (
          <p className="mt-2 text-sm text-faint" data-testid="finance-shared-only">
            Součty jen ze sdílených zakázek.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/** Posledních 5 událostí u klienta (KLI-05; úpravy údajů, stavy, události Disku z historie záznamu). */
export function EventsCard({ companyId }: { companyId: string }) {
  const api = useEntityApi();
  const [data, setData] = useState<ActivityResult | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    api
      .activity("company", companyId)
      .then((r) => live && setData(r))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [api, companyId]);
  if (data === undefined) return <Skeleton className="h-24" />;
  const items = (data?.timeline ?? []).slice(0, 5);
  return (
    <Card aria-label="Poslední události" data-testid="overview-events">
      <CardHeader title="Poslední události" />
      <CardBody flush>
        {items.length === 0 ? (
          <p className="px-4 py-3 text-muted">Zatím se nic nestalo.</p>
        ) : (
          <ul>
            {items.map((it) => (
              <li
                key={`${it.kind}-${it.id}`}
                className="flex items-baseline gap-3 border-t border-line-soft px-4 py-2 first:border-t-0"
              >
                <Icon
                  name={it.kind === "comment" ? "message-square" : "history"}
                  className="size-3.5 shrink-0 text-faint"
                />
                <span className="min-w-0 flex-1 truncate">
                  {it.kind === "comment" ? it.body : (it.summary ?? it.action)}
                </span>
                <span className="shrink-0 text-sm text-muted">
                  {it.actor} · {formatDate(it.at.slice(0, 10))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

type NoteRow = {
  id: string;
  title: string | null;
  bodyText: string;
  pinned: boolean;
  updatedAt: string;
};

/** Poslední poznámky klienta (MOB-03): připnuté nahoře, pak nejnovější; data z `ukoly.note.list`. */
export function RecentNotesCard({ companyId }: { companyId: string }) {
  const can = useCan();
  const { Link } = useNav();
  const q = useCommandQuery<{ rows: NoteRow[] }, { companyId: string; limit: number }>(
    "ukoly.note.list",
    { companyId, limit: 3 },
    { enabled: can("ukoly.read") },
  );
  if (!can("ukoly.read") || q.isLoading || q.error || !q.data) return null;
  return (
    <Card aria-label="Poslední poznámky" data-testid="overview-notes">
      <CardHeader title="Poslední poznámky" count={q.data.rows.length} />
      <CardBody flush>
        {q.data.rows.length === 0 ? (
          <p className="px-4 py-3 text-muted">Žádné poznámky.</p>
        ) : (
          <ul>
            {q.data.rows.map((n) => (
              <li key={n.id} className="border-t border-line-soft px-4 py-2 first:border-t-0">
                <Link href={`/poznamky/${n.id}`} className="block hover:underline">
                  <span className="font-medium">
                    {n.pinned && <Icon name="pin" className="mr-1 inline size-3.5" />}
                    {n.title || "Poznámka"}
                  </span>
                  <span className="line-clamp-2 text-muted">{n.bodyText}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
