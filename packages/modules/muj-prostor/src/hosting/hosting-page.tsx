"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Button,
  Chip,
  EmptyState,
  EntityList,
  Icon,
  Skeleton,
  useCommandQuery,
  useEntityDescriptor,
  useNav,
} from "@rebar/ui";
import { useMemo } from "react";
import { RECURRING_KIND_LABELS } from "../labels";
import { Kpi, RenewalCell, useMarkRenewed } from "../shared-ui";
import type { HostingOverview, ServiceRow } from "../types";
import { HOSTING_DEFAULT_FILTER, HOSTING_VIEW_LAYOUT } from "./view-layout";

/** Uložený pohled z adresy (`?pohled=`); čte se až po načtení popisu entity, tedy jen v prohlížeči. */
function viewFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("pohled") ?? undefined;
}

/** Nejvíc řádků v panelu „K obnově“; zbytek je v pohledu Obnova do 30 dní. */
const DUE_ROWS = 5;

function DueRow({ row }: { row: ServiceRow }) {
  const { Link } = useNav();
  const { mark, pending } = useMarkRenewed();
  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-3 py-2 first:border-t-0"
      data-testid="due-row"
    >
      <Link
        href={`/muj-prostor/hosting/vse/${row.id}`}
        className="min-w-0 flex-1 truncate font-medium hover:underline"
      >
        {row.name}
      </Link>
      <span className="truncate text-muted">{row.companyName ?? "—"}</span>
      <Chip color="gray">{RECURRING_KIND_LABELS[row.kind]}</Chip>
      <span className="tabular text-muted">
        {row.priceMinor === null ? "" : formatMinor(row.priceMinor)}
      </span>
      <RenewalCell row={row} />
      <Button
        size="sm"
        loading={pending}
        disabled={!row.nextRenewal}
        onClick={() => row.nextRenewal && mark({ id: row.id, nextRenewal: row.nextRenewal })}
        aria-label={`Označit obnovu jako vyfakturovanou: ${row.name}`}
      >
        <Icon name="check" /> Označit obnovu
      </Button>
    </li>
  );
}

/**
 * Stránka „Hosting a údržba“ (HOST-01 až HOST-03): nahoře souhrn (roční opakovaný příjem, počet aktivních služeb,
 * obnovy do 30 dní a po termínu), panel nejbližších obnov s tlačítkem „Označit obnovu“ a pod tím seznam všech služeb
 * s pohledy Obnova do 30 dní, Podle klienta a Zrušené.
 */
export function HostingPage() {
  const overview = useCommandQuery<HostingOverview>(
    "muj-prostor.hosting.overview",
    {},
    { refetchInterval: 30_000 },
  );
  const descriptor = useEntityDescriptor("recurring_service");
  const initialViewId = useMemo(viewFromUrl, []);
  const data = overview.data;
  const summary = data?.summary;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="hosting-page">
      <div className="space-y-3 px-4 pt-3">
        {!summary ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-18 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="hosting-summary">
            <Kpi
              testId="kpi-arr"
              label="Roční opakovaný příjem"
              value={formatMinor(summary.annualMinor)}
              hint={`${formatMinor(summary.monthlyMinor)} měsíčně`}
            />
            <Kpi
              testId="kpi-active"
              label="Aktivní služby"
              value={summary.activeCount}
              hint={`hosting ${summary.byKind.hosting.count}, údržba ${summary.byKind.maintenance.count}`}
            />
            <Kpi
              testId="kpi-due"
              label="Obnova do 30 dní"
              value={summary.dueSoonCount}
              tone={summary.dueSoonCount > 0 ? "warning" : undefined}
              hint={summary.dueSoonCount === 0 ? "nic se neblíží" : "včetně po termínu"}
            />
            <Kpi
              testId="kpi-overdue"
              label="Po termínu obnovy"
              value={summary.overdueCount}
              tone={summary.overdueCount > 0 ? "danger" : undefined}
              hint={summary.overdueCount === 0 ? "v pořádku" : "označte obnovu nebo ji pozastavte"}
            />
          </div>
        )}
        {data && data.due.length > 0 && (
          <section className="card overflow-hidden" data-testid="due-panel">
            <h2 className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
              <Icon name="alarm-clock" className="size-4 text-faint" />K obnově do 30 dní
              <span className="tabular rounded-full bg-hover px-1.5 text-xs font-medium text-muted">
                {data.due.length}
              </span>
              <span className="ml-auto text-sm font-normal text-faint">
                Další obnova se po označení posune o období.
              </span>
            </h2>
            <ul className="border-t border-line-soft">
              {data.due.slice(0, DUE_ROWS).map((r) => (
                <DueRow key={r.id} row={r} />
              ))}
            </ul>
            {data.due.length > DUE_ROWS && (
              <p className="border-t border-line-soft px-3 py-2 text-sm text-muted">
                A dalších {data.due.length - DUE_ROWS} v pohledu „Obnova do 30 dní“.
              </p>
            )}
          </section>
        )}
        {overview.isError && !data && (
          <EmptyState
            title="Souhrn se nepodařilo načíst"
            description={overview.error.message}
            action={<Button onClick={() => void overview.refetch()}>Zkusit znovu</Button>}
          />
        )}
        {data && (
          <p className="sr-only" data-testid="hosting-today">
            Dnes je {formatDate(data.today)}.
          </p>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col pt-1">
        {descriptor.data ? (
          <EntityList
            entity={descriptor.data}
            openMode="dialog"
            basePath="/muj-prostor/hosting"
            defaultFilters={HOSTING_DEFAULT_FILTER}
            allViewLabel="Aktuální"
            viewLayout={HOSTING_VIEW_LAYOUT}
            initialViewId={initialViewId}
          />
        ) : (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
