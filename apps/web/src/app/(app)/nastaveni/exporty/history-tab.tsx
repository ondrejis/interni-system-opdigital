"use client";

import type { RunSummary } from "@rebar/core/export";
import { Chip, EmptyState, Notice } from "@rebar/ui";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { listMyExportsAction } from "@/server/export-actions";
import { unwrap } from "../_shared/action-query";
import { formatDateTime } from "../_shared/format";
import { SettingsTable, type TableColumn } from "../_shared/settings-table";
import { ListSkeleton, LoadError, TableCard } from "./exports-ui";
import { formatCount, formatLabel, isRunActive, runStatus } from "./labels";
import { POLL_MS, exportKeys } from "./my-exports";

/** Historie všech exportů v systému (správce exportů). Soubory cizích exportů se nestahují. */
export function HistoryTab() {
  const q = useQuery({
    queryKey: exportKeys.all,
    queryFn: () => unwrap(listMyExportsAction({ all: true })),
    refetchInterval: (query) =>
      query.state.data?.some((r) => isRunActive(r.status)) ? POLL_MS : false,
    staleTime: 0,
  });
  if (q.isLoading) return <ListSkeleton label="Načítám historii exportů" />;
  if (q.isError || !q.data)
    return (
      <LoadError
        title="Historii se nepodařilo načíst"
        message={q.error?.message}
        onRetry={() => void q.refetch()}
      />
    );
  const rows = q.data;
  const columns: TableColumn<RunSummary>[] = [
    {
      key: "who",
      header: "Kdo",
      primary: true,
      cell: (r) => (
        <span className="block truncate">
          {r.userName}
          {r.mine && <span className="ml-1.5 text-sm font-normal text-muted">(vy)</span>}
        </span>
      ),
    },
    {
      key: "what",
      header: "Co",
      cell: (r) => (
        <>
          <span className="block truncate" title={r.fileName}>
            {r.label}
          </span>
          {r.status === "failed" && r.error && (
            <span className="block text-sm text-danger">{r.error}</span>
          )}
        </>
      ),
    },
    { key: "format", header: "Formát", cell: (r) => formatLabel(r.format) },
    {
      key: "when",
      header: "Kdy",
      cell: (r) => <span className="tabular whitespace-nowrap">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: "rows",
      header: "Řádků",
      cell: (r) => <span className="tabular">{formatCount(r.rowCount)}</span>,
    },
    {
      key: "status",
      header: "Stav",
      cell: (r) => {
        const s = runStatus(r.status);
        return (
          <Chip color={s.color} dot={isRunActive(r.status)}>
            {s.label}
          </Chip>
        );
      },
    },
  ];
  return (
    <div className="space-y-4">
      <Notice tone="info">
        Přehled slouží ke kontrole, kdo co exportoval. Soubory ostatních uživatelů si stáhnout
        nejde, vidíte jen záznam o exportu.
      </Notice>
      {rows.length === 0 ? (
        <TableCard>
          <EmptyState
            icon={<History />}
            title="Zatím nikdo nic neexportoval"
            description="Jakmile někdo vytvoří export, objeví se tady."
          />
        </TableCard>
      ) : (
        <>
          <TableCard>
            <SettingsTable
              label="Historie všech exportů"
              testId="export-history"
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
            />
          </TableCard>
          {rows.length >= 100 && (
            <p className="text-sm text-faint">Zobrazuje se posledních 100 exportů.</p>
          )}
        </>
      )}
    </div>
  );
}
