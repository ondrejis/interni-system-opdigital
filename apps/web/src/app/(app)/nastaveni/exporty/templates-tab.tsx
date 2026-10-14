"use client";

import type { TemplateInfo } from "@rebar/core/export";
import {
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Notice,
  errorToast,
  successToast,
  useNav,
} from "@rebar/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileText, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteExportTemplateAction, listExportTemplatesAction } from "@/server/export-actions";
import { unwrap } from "../_shared/action-query";
import { SettingsTable, type TableColumn } from "../_shared/settings-table";
import { LINK_BUTTON, ListSkeleton, LoadError, TableCard } from "./exports-ui";
import { formatLabel, templateHref } from "./labels";

export const templateKeys = { list: ["exports", "templates"] as const };

const SCOPE_LABEL = { view: "Aktuální pohled", all: "Všechny záznamy" } as const;

/** Šablony exportů: uložená nastavení (sloupce, filtry, formát). Vytvářejí se v exportním dialogu v seznamech. */
export function TemplatesTab({
  canManage,
  entityPaths,
}: {
  canManage: boolean;
  entityPaths: Record<string, string>;
}) {
  const qc = useQueryClient();
  const { Link } = useNav();
  const q = useQuery({
    queryKey: templateKeys.list,
    queryFn: () => unwrap(listExportTemplatesAction({})),
    staleTime: 0,
  });
  const [removing, setRemoving] = useState<TemplateInfo | null>(null);

  if (q.isLoading) return <ListSkeleton label="Načítám šablony" />;
  if (q.isError || !q.data)
    return (
      <LoadError
        title="Šablony se nepodařilo načíst"
        message={q.error?.message}
        onRetry={() => void q.refetch()}
      />
    );
  const rows = q.data;

  const columns: TableColumn<TemplateInfo>[] = [
    {
      key: "name",
      header: "Název",
      primary: true,
      cell: (t) => <span className="block truncate">{t.name}</span>,
    },
    { key: "entity", header: "Data", cell: (t) => t.entityLabel },
    { key: "format", header: "Formát", cell: (t) => formatLabel(t.spec.format) },
    { key: "scope", header: "Rozsah", cell: (t) => SCOPE_LABEL[t.spec.scope] },
    {
      key: "owner",
      header: "Komu patří",
      cell: (t) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Chip color={t.mine ? "blue" : "green"}>{t.mine ? "Moje" : "Sdílená"}</Chip>
          {!t.mine && <span className="truncate text-sm text-muted">{t.ownerName}</span>}
          {t.mine && t.shared && <span className="text-sm text-muted">sdílím s ostatními</span>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-base text-muted">
        Šablonu vytvoříte v exportním dialogu u kteréhokoli seznamu. Tady je vidět, co máte uložené
        a co s vámi sdílejí ostatní.
      </p>
      {rows.length === 0 ? (
        <TableCard>
          <EmptyState
            icon={<FileText />}
            title="Zatím žádné šablony"
            description="V exportním dialogu u seznamu nastavte sloupce a filtry a uložte je jako šablonu. Pak je můžete použít znovu nebo podle nich naplánovat pravidelný export."
          />
        </TableCard>
      ) : (
        <TableCard>
          <SettingsTable
            label="Šablony exportů"
            testId="export-templates"
            columns={columns}
            rows={rows}
            rowKey={(t) => t.id}
            actionsPlacement="footer"
            actions={(t) => {
              const href = templateHref(entityPaths[t.entity], t.id);
              return (
                <>
                  {href && (
                    <Link href={href} className={LINK_BUTTON}>
                      Použít <ArrowRight aria-hidden />
                      <span className="sr-only"> šablonu {t.name}</span>
                    </Link>
                  )}
                  {(t.mine || canManage) && (
                    <IconButton
                      label={`Smazat šablonu ${t.name}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoving(t)}
                    >
                      <Trash2 />
                    </IconButton>
                  )}
                </>
              );
            }}
          />
        </TableCard>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Smazat šablonu"
        description={removing?.name ?? ""}
        confirmLabel="Smazat šablonu"
        danger
        onConfirm={async () => {
          if (!removing) return;
          const r = await deleteExportTemplateAction({ id: removing.id });
          if (!r.ok) {
            errorToast(r.error);
            return false;
          }
          successToast("Šablona smazána.");
          void qc.invalidateQueries({ queryKey: ["exports"] });
        }}
      >
        <>
          {removing?.shared && (
            <Notice tone="warning" className="mb-2">
              Šablonu mají k dispozici i ostatní uživatelé, smazáním o ni přijdou.
            </Notice>
          )}
          Plány, které šablonu už používají, běží dál podle svého uloženého nastavení.
        </>
      </ConfirmDialog>
    </div>
  );
}
