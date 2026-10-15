"use client";

import {
  DEFINITION_VERSION,
  MAX_DASHBOARD_WIDGETS,
  type DashboardDefinition,
  type DashboardFilters,
  type DashboardSummary,
  type DashboardWidget,
} from "@rebar/core/dashboards-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  FileDown,
  Image as ImageIcon,
  Maximize2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/button";
import { ConfirmDialog } from "../components/confirm-dialog";
import { Input } from "../components/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/overlay";
import { Skeleton } from "../components/badges";
import { errorToast, successToast } from "../components/toast";
import { useNav } from "../nav";
import { dashKeys, useDashboardApi } from "./api";
import { DashboardGrid, useLayout } from "./dashboard-grid";
import { FiltersBar } from "./filters-bar";
import { elementToPng } from "./png";
import { ShareDialog } from "./share-dialog";
import { WidgetCatalogDialog } from "./widget-catalog-dialog";
import { newWidget, newWidgetId, WidgetEditor } from "./widget-editor";

type Props = {
  boardId: string;
  filters: DashboardFilters;
  onFiltersChange: (f: DashboardFilters) => void;
  /** Smí uživatel zakládat vlastní nástěnky (klonování). */
  canWrite: boolean;
  jobsAvailable: boolean;
  /** Adresa celoobrazovkového režimu pro TV (bez navigace). */
  tvHref?: string | undefined;
  /** Po smazání nástěnky (návrat na Přehled). */
  onDeleted?: (() => void) | undefined;
  onCloned?: ((id: string) => void) | undefined;
};

/**
 * Jedna nástěnka: filtry (období, zakázka, osoba), mřížka widgetů, úpravy (přidat, přesunout, změnit velikost, upravit,
 * odebrat), uložení s kontrolou souběžné změny, klon, sdílení, smazání a exporty (PDF, PNG). Chyba jednoho widgetu
 * nerozbije ostatní.
 */
export function DashboardView({
  boardId,
  filters,
  onFiltersChange,
  canWrite,
  jobsAvailable,
  tvHref,
  onDeleted,
  onCloned,
}: Props) {
  const api = useDashboardApi();
  const qc = useQueryClient();
  const nav = useNav();
  const board = useQuery({ queryKey: dashKeys.board(boardId), queryFn: () => api.get(boardId) });
  const catalog = useQuery({
    queryKey: dashKeys.catalog,
    queryFn: () => api.catalog(),
    staleTime: 60_000,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DashboardWidget[]>([]);
  const [name, setName] = useState("");
  const [editor, setEditor] = useState<{ widget: DashboardWidget; isNew: boolean } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  // telefon: v režimu Upravit jde jen měnit pořadí widgetů (MOB-09), ostatní úpravy patří na tablet a počítač
  const reorderOnly = useLayout() === "mobile";
  const gridWrap = useRef<HTMLDivElement>(null);

  const summary: DashboardSummary | undefined = board.data?.summary;
  const definition: DashboardDefinition | undefined = board.data?.definition;

  // při přepnutí nástěnky se rozdělané úpravy zahodí
  useEffect(() => {
    setEditing(false);
    setEditor(null);
  }, [boardId]);

  // výchozí období nástěnky, pokud adresa žádné nezvolila
  const appliedDefault = useRef<string | null>(null);
  useEffect(() => {
    if (!definition?.defaultPeriod || appliedDefault.current === boardId) return;
    appliedDefault.current = boardId;
    if (filters.period === "all" && definition.defaultPeriod !== "all")
      onFiltersChange({ ...filters, period: definition.defaultPeriod });
    // jen při prvním načtení nástěnky
  }, [definition, boardId]);

  const widgets = editing ? draft : (definition?.widgets ?? []);
  const dirty = useMemo(
    () =>
      editing &&
      (JSON.stringify(draft) !== JSON.stringify(definition?.widgets ?? []) ||
        name.trim() !== (summary?.name ?? "")),
    [editing, draft, definition, name, summary],
  );

  const save = useMutation({
    mutationFn: () =>
      api.update({
        id: boardId,
        name: name.trim(),
        definition: {
          schemaVersion: DEFINITION_VERSION,
          widgets: draft,
          ...(definition?.defaultPeriod ? { defaultPeriod: definition.defaultPeriod } : {}),
        },
        ...(summary ? { expectedUpdatedAt: summary.updatedAt } : {}),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: dashKeys.board(boardId) });
      await qc.invalidateQueries({ queryKey: dashKeys.list });
      setEditing(false);
      successToast("Nástěnka je uložená.");
    },
    onError: (e) => errorToast((e as Error).message),
  });

  function startEdit() {
    setDraft(definition?.widgets ?? []);
    setName(summary?.name ?? "");
    setEditing(true);
  }

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      errorToast((e as Error).message);
      return undefined;
    }
  }

  if (board.isPending)
    return (
      <div className="space-y-3" role="status" aria-label="Načítám nástěnku">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  if (board.isError || !summary || !definition)
    return (
      <p role="alert" className="rounded-lg border border-line p-4 text-danger">
        Nástěnku se nepodařilo načíst: {(board.error as Error | null)?.message ?? "neznámá chyba"}
      </p>
    );

  return (
    <div data-testid="dashboard" data-board-id={boardId}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <label className="sr-only" htmlFor="dash-name">
              Název nástěnky
            </label>
            <Input
              id="dash-name"
              className="max-w-xs text-lg font-semibold"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              data-testid="dashboard-name"
            />
          </>
        ) : (
          <h2 className="text-xl font-semibold" data-testid="dashboard-title">
            {summary.name}
          </h2>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5" data-png-skip>
          {editing ? (
            <>
              {!reorderOnly && (
                <Button
                  variant="secondary"
                  onClick={() => setCatalogOpen(true)}
                  disabled={draft.length >= MAX_DASHBOARD_WIDGETS}
                  data-testid="add-widget"
                >
                  <Plus /> Přidat widget
                </Button>
              )}
              <Button
                variant="primary"
                loading={save.isPending}
                disabled={!dirty}
                onClick={() => save.mutate()}
                data-testid="save-dashboard"
              >
                <Check /> Uložit
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} data-testid="cancel-edit">
                <X /> Zrušit
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setRefreshKey((k) => k + 1)}
                aria-label="Obnovit data"
              >
                <RefreshCw />
                <span className="hidden sm:inline">Obnovit</span>
              </Button>
              {summary.canEdit && (
                <Button variant="secondary" onClick={startEdit} data-testid="edit-dashboard">
                  <Pencil /> Upravit
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    aria-label="Další akce nástěnky"
                    data-testid="dashboard-menu"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {tvHref && (
                    <DropdownMenuItem onSelect={() => nav.push(tvHref)}>
                      <Maximize2 className="size-4" /> Celá obrazovka (TV)
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => void run(() => api.exportBoard(boardId, filters))}
                    data-testid="export-pdf"
                  >
                    <FileDown className="size-4" /> Stáhnout PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void run(() =>
                        elementToPng(
                          gridWrap.current!,
                          `${summary.name}`.toLowerCase().replace(/\s+/g, "-"),
                        ),
                      )
                    }
                  >
                    <ImageIcon className="size-4" /> Stáhnout obrázek (PNG)
                  </DropdownMenuItem>
                  {canWrite && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() =>
                          void run(async () => {
                            const r = await api.clone(boardId);
                            await qc.invalidateQueries({ queryKey: dashKeys.list });
                            successToast("Nástěnka je naklonovaná.");
                            onCloned?.(r.id);
                          })
                        }
                      >
                        <Copy className="size-4" /> Klonovat do mých nástěnek
                      </DropdownMenuItem>
                    </>
                  )}
                  {summary.canEdit && (
                    <>
                      <DropdownMenuItem onSelect={() => setTimeout(() => setShareOpen(true), 60)}>
                        <Share2 className="size-4" /> Sdílet…
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-danger"
                        onSelect={() => setTimeout(() => setConfirmDelete(true), 60)}
                      >
                        <Trash2 className="size-4" /> Smazat
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <div className="mb-4" data-png-skip>
        <FiltersBar value={filters} onChange={onFiltersChange} jobsAvailable={jobsAvailable} />
      </div>

      <div ref={gridWrap}>
        {widgets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line p-8 text-center text-muted">
            <p className="font-medium text-fg">Nástěnka je zatím prázdná.</p>
            <p className="mt-1">
              {summary.canEdit
                ? "Klikněte na Upravit a přidejte první widget."
                : "Autor zatím nepřidal žádný widget."}
            </p>
          </div>
        ) : (
          <DashboardGrid
            widgets={widgets}
            filters={filters}
            refreshKey={refreshKey}
            editing={editing}
            reorderOnly={reorderOnly}
            onChange={setDraft}
            onEdit={(id) => {
              const w = draft.find((x) => x.id === id);
              if (w) setEditor({ widget: w, isNew: false });
            }}
          />
        )}
      </div>

      {catalogOpen && (
        <WidgetCatalogDialog
          presets={catalog.data?.presets ?? []}
          onClose={() => setCatalogOpen(false)}
          onCustom={(type) => {
            setCatalogOpen(false);
            setEditor({ widget: newWidget(type, catalog.data), isNew: true });
          }}
          onPick={(p) => {
            setCatalogOpen(false);
            const widget = { ...p.widget, id: newWidgetId() };
            if (p.configure) setEditor({ widget, isNew: true });
            else
              setDraft((d) =>
                [
                  ...d,
                  ...(p.widgets ?? [p.widget]).map((x) => ({ ...x, id: newWidgetId() })),
                ].slice(0, MAX_DASHBOARD_WIDGETS),
              );
          }}
        />
      )}
      {editor && (
        <WidgetEditor
          widget={editor.widget}
          catalog={catalog.data}
          filters={filters}
          isNew={editor.isNew}
          onClose={() => setEditor(null)}
          onSave={(w) => {
            setDraft((d) => (editor.isNew ? [...d, w] : d.map((x) => (x.id === w.id ? w : x))));
            setEditor(null);
          }}
        />
      )}
      {shareOpen && (
        <ShareDialog
          summary={summary}
          catalog={catalog.data}
          onClose={() => setShareOpen(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: dashKeys.board(boardId) });
            void qc.invalidateQueries({ queryKey: dashKeys.list });
          }}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Smazat nástěnku „${summary.name}“?`}
        description="Nástěnka zmizí všem, se kterými je sdílená. Data v systému se nemění."
        confirmLabel="Smazat"
        danger
        onConfirm={async () => {
          try {
            await api.remove(boardId);
            await qc.invalidateQueries({ queryKey: dashKeys.list });
            successToast("Nástěnka je smazaná.");
            onDeleted?.();
          } catch (e) {
            errorToast((e as Error).message);
            return false;
          }
        }}
      />
    </div>
  );
}
