"use client";

import type { RunSummary } from "@rebar/core/export";
import {
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Notice,
  errorToast,
  successToast,
} from "@rebar/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteExportFileAction, listMyExportsAction } from "@/server/export-actions";
import { unwrap } from "../_shared/action-query";
import { formatDateTime } from "../_shared/format";
import { SettingsTable, type TableColumn } from "../_shared/settings-table";
import { LINK_BUTTON, ListSkeleton, LoadError, TableCard } from "./exports-ui";
import { formatBytes, formatCount, formatLabel, isRunActive, runStatus } from "./labels";

/** Obnovování seznamu, dokud se něco zpracovává (v milisekundách). */
export const POLL_MS = 5000;

export const exportKeys = {
  mine: ["exports", "mine"] as const,
  all: ["exports", "all"] as const,
};

/** Moje exporty: hotové soubory ke stažení; fronta a zpracování se sama obnovuje. */
export function MyExports({ retentionDays }: { retentionDays: number }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: exportKeys.mine,
    queryFn: () => unwrap(listMyExportsAction({})),
    refetchInterval: (query) =>
      query.state.data?.some((r) => isRunActive(r.status)) ? POLL_MS : false,
    staleTime: 0,
  });
  const [removing, setRemoving] = useState<RunSummary | null>(null);

  if (q.isLoading) return <ListSkeleton label="Načítám exporty" />;
  if (q.isError || !q.data)
    return (
      <LoadError
        title="Exporty se nepodařilo načíst"
        message={q.error?.message}
        onRetry={() => void q.refetch()}
      />
    );
  const rows = q.data;
  const running = rows.some((r) => isRunActive(r.status));

  const columns: TableColumn<RunSummary>[] = [
    {
      key: "name",
      header: "Název",
      primary: true,
      cell: (r) => (
        <>
          <span className="block truncate" title={r.fileName}>
            {r.label}
          </span>
          {r.status === "failed" && r.error && (
            <span className="block text-sm font-normal text-danger">{r.error}</span>
          )}
        </>
      ),
    },
    { key: "format", header: "Formát", cell: (r) => formatLabel(r.format) },
    {
      key: "rows",
      header: "Řádků",
      cell: (r) => <span className="tabular">{formatCount(r.rowCount)}</span>,
    },
    {
      key: "size",
      header: "Velikost",
      cell: (r) => <span className="tabular">{formatBytes(r.sizeBytes)}</span>,
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
    {
      key: "created",
      header: "Vytvořeno",
      cell: (r) => <span className="tabular whitespace-nowrap">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: "expires",
      header: "Platí do",
      cell: (r) => (
        <span className="tabular whitespace-nowrap">
          {r.status === "done" ? formatDateTime(r.expiresAt) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-base text-muted">
        Hotové exporty zůstávají ke stažení {retentionDays}&nbsp;
        {retentionDays === 1 ? "den" : retentionDays < 5 ? "dny" : "dní"}, pak se soubor smaže.
      </p>
      {running && (
        <Notice tone="info">
          Některé exporty se ještě zpracovávají. Seznam se obnovuje sám, stačí chvíli počkat.
        </Notice>
      )}
      {rows.length === 0 ? (
        <TableCard>
          <EmptyState
            icon={<Download />}
            title="Zatím žádné exporty"
            description="Export vytvoříte v kterémkoli seznamu tlačítkem Export. Větší exporty se zpracují na pozadí a objeví se tady."
          />
        </TableCard>
      ) : (
        <TableCard>
          <SettingsTable
            label="Moje exporty"
            testId="my-exports"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            actionsPlacement="footer"
            actions={(r) => (
              <>
                {r.downloadable && (
                  <a href={`/api/exports/${r.id}/file`} className={LINK_BUTTON} download>
                    <Download aria-hidden /> Stáhnout
                    <span className="sr-only"> {r.label}</span>
                  </a>
                )}
                {r.status === "done" && r.downloadable && (
                  <IconButton
                    label={`Smazat soubor: ${r.label}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoving(r)}
                  >
                    <Trash2 />
                  </IconButton>
                )}
              </>
            )}
          />
        </TableCard>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Smazat soubor exportu"
        description={removing?.label ?? ""}
        confirmLabel="Smazat soubor"
        danger
        onConfirm={async () => {
          if (!removing) return;
          const r = await deleteExportFileAction({ id: removing.id });
          if (!r.ok) {
            errorToast(r.error);
            return false;
          }
          successToast("Soubor smazán.");
          void qc.invalidateQueries({ queryKey: ["exports"] });
        }}
      >
        Soubor se smaže z úložiště a nepůjde už stáhnout. Export si můžete kdykoli vytvořit znovu.
      </ConfirmDialog>
    </div>
  );
}
