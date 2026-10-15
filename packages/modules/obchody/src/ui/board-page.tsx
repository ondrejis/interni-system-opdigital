"use client";

import type { RecordRow } from "@rebar/core/shared";
import { formatMinor } from "@rebar/core/shared";
import {
  Button,
  Combobox,
  EntityList,
  Icon,
  Kbd,
  SegmentedControl,
  Skeleton,
  cn,
  useCan,
  useEntityApi,
  useEntityDescriptor,
  useEntitySummary,
  useNav,
  withRecordParam,
  type ComboOption,
  type KanbanDropTarget,
} from "@rebar/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileBoard } from "./mobile-board";
import { QuickAddDealDialog } from "./quick-add";
import {
  boardFilters,
  listDefaultFilters,
  ownerFromQuery,
  pluralDeals,
  replaceQuery,
  viewFromQuery,
  type DealView,
} from "./logic";
import { LoseDealDialog, WinDealFlow, type DealRef } from "./win-lose";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Je obrazovka úzká (telefon)? Na serveru a při prvním vykreslení ne, potom se opraví. */
export function useNarrow(query = "(max-width: 767px)"): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const read = () => setMatch(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [query]);
  return match;
}

/** Otevře detail obchodu v pop-upu seznamu na stránce (stejně jako klik na kartu: Zpět ho zavře). */
function openDealPopup(id: string) {
  const href = withRecordParam(window.location.pathname + window.location.search, id);
  window.history.pushState({ ...(window.history.state ?? {}), __recordDialog: id }, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Filtr vlastníka: Všichni, Já, nebo konkrétní uživatel. */
function OwnerSwitch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const api = useEntityApi();
  const [name, setName] = useState<string | null>(null);
  const load = useCallback(
    async (q: string): Promise<ComboOption[]> => {
      const specials = [
        { value: "all", label: "Všichni" },
        { value: "me", label: "Já" },
      ].filter((o) => norm(o.label).includes(norm(q)));
      const users = await api.lookups.users(q);
      return [...specials, ...users.filter((u) => u.value !== api.me.id)];
    },
    [api],
  );
  useEffect(() => {
    if (value === "all" || value === "me") return setName(null);
    let live = true;
    void api.lookups.users("").then((list) => {
      if (live) setName(list.find((u) => u.value === value)?.label ?? null);
    });
    return () => {
      live = false;
    };
  }, [api, value]);
  const label = value === "all" ? "Všichni" : value === "me" ? "Já" : (name ?? "Uživatel");
  return (
    <Combobox
      aria-label="Vlastník obchodů"
      load={load}
      value={value}
      selectedLabels={{ all: "Všichni", me: "Já", ...(name ? { [value]: name } : {}) }}
      searchPlaceholder="Najít uživatele…"
      onChange={(v) => {
        if (typeof v === "string") {
          if (v !== value) setName(null);
          onChange(v);
        }
      }}
      trigger={
        <Button variant="secondary" data-testid="owner-filter" aria-label={`Vlastník: ${label}`}>
          <Icon name="user" />
          <span className={cn("max-w-32 truncate", value === "all" && "hidden sm:inline")}>{label}</span>
          <Icon name="chevron-down" className="size-3.5 text-faint" />
        </Button>
      }
    />
  );
}

/** Počet otevřených obchodů a jejich hodnota (a vážená hodnota) podle filtru vlastníka. */
function DealCounter({ owner }: { owner: string }) {
  const params = useMemo(() => ({ filters: boardFilters(owner) }), [owner]);
  const summary = useEntitySummary("deal", params);
  if (!summary.data) return <span className="h-5 w-24" aria-hidden />;
  const { total, totals } = summary.data;
  const value = totals.value;
  const weighted = totals.weighted;
  return (
    <span className="tabular text-sm text-muted" data-testid="deal-counter">
      {total} {pluralDeals(total)}
      {typeof value === "number" && <> · {formatMinor(value)}</>}
      {typeof weighted === "number" && <span className="max-md:hidden"> · vážená {formatMinor(weighted)}</span>}
    </span>
  );
}

const dealOf = (row: RecordRow): DealRef => ({ id: row.id, title: String(row.title ?? "") });

type DialogState = { kind: "won" | "lost"; deal: DealRef } | null;

/**
 * Stránka `/obchody`: přepínač Board / Seznam (`?zobrazeni=`), filtr vlastníka (`?vlastnik=`), „Nový obchod“ (klávesa C
 * nebo `?novy=1` z palety). Board je kanban fází s hlavičkami (počet, součet, vážený součet), zónami Vyhráno a
 * Prohráno při tažení a zkratkami W a L nad kartou; na telefonu posuvné sloupce s „Přesunout do fáze“. Seznam je
 * tabulka jádra s filtry a uloženými pohledy.
 */
export function ObchodyPage({ query }: { query: Record<string, string> }) {
  const can = useCan();
  const nav = useNav();
  const descriptor = useEntityDescriptor("deal");
  const narrow = useNarrow();
  const [view, setView] = useState<DealView>(() => viewFromQuery(query.zobrazeni));
  const [owner, setOwner] = useState(() => ownerFromQuery(query.vlastnik));
  const [quickAdd, setQuickAdd] = useState<{ open: boolean; stageId?: string }>({
    open: query.novy === "1",
  });
  const [dialog, setDialog] = useState<DialogState>(null);
  const canCreate = can("obchody.create");
  const canWrite = can("obchody.write") && !!descriptor.data?.can.write;

  // odkaz `?novy=1` (paleta, klávesa C) otevře rychlé založení a z adresy zmizí
  useEffect(() => {
    if (query.novy === "1") {
      setQuickAdd({ open: true });
      replaceQuery({ novy: null });
    }
  }, [query.novy]);

  const selectView = (next: DealView) => {
    setView(next);
    replaceQuery({ zobrazeni: next === "board" ? null : next, record: null, tab: null, sub: null });
  };
  const selectOwner = (next: string) => {
    setOwner(next);
    replaceQuery({ vlastnik: next === "all" ? null : next });
  };
  const addInStage = useCallback((stageId: string) => setQuickAdd({ open: true, stageId }), []);

  const baseFilters = useMemo(() => boardFilters(owner), [owner]);
  const defaultFilters = useMemo(() => listDefaultFilters(owner), [owner]);
  const defaultConfig = useMemo(() => ({ viewType: "kanban" as const, cardAttributes: [] }), []);
  const entity = useMemo(
    () => (descriptor.data ? { ...descriptor.data, can: { ...descriptor.data.can, create: false } } : null),
    [descriptor.data],
  );

  const dropTargets = useMemo<KanbanDropTarget[]>(
    () =>
      canWrite
        ? [
            {
              id: "won",
              label: "Vyhráno",
              color: "green",
              icon: "trophy",
              hint: "nebo klávesa W",
              onDrop: (_id, row) => setDialog({ kind: "won", deal: dealOf(row) }),
            },
            {
              id: "lost",
              label: "Prohráno",
              color: "red",
              icon: "thumbs-down",
              hint: "nebo klávesa L",
              onDrop: (_id, row) => setDialog({ kind: "lost", deal: dealOf(row) }),
            },
          ]
        : [],
    [canWrite],
  );
  const kanban = useMemo(
    () => ({
      dropTargets,
      shortcutKeys: ["w", "l"],
      onShortcut: (key: string, row: RecordRow) => {
        if (!canWrite) return;
        if (key === "w") setDialog({ kind: "won", deal: dealOf(row) });
        else if (key === "l") setDialog({ kind: "lost", deal: dealOf(row) });
      },
      ...(canCreate ? { onAddCard: addInStage } : {}),
    }),
    [dropTargets, canWrite, canCreate, addInStage],
  );

  const close = () => setDialog(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="obchody-page" data-view={view}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2">
        <SegmentedControl<DealView>
          label="Zobrazení"
          value={view}
          onChange={selectView}
          options={[
            { value: "board", label: "Board" },
            { value: "seznam", label: "Seznam" },
          ]}
        />
        {canCreate && (
          <Button variant="primary" data-testid="add-deal" onClick={() => setQuickAdd({ open: true })}>
            <Icon name="plus" /> <span>Nový obchod</span>
            <Kbd className="max-sm:hidden">C</Kbd>
          </Button>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <span className="hidden sm:contents">
            <DealCounter owner={owner} />
          </span>
          <OwnerSwitch value={owner} onChange={selectOwner} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {!entity ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64" />
          </div>
        ) : view === "seznam" ? (
          <EntityList
            entity={entity}
            basePath="/obchody"
            defaultFilters={defaultFilters}
            allViewLabel="Otevřené"
            initialRecordId={query.record ?? null}
            openMode="page"
          />
        ) : narrow ? (
          <MobileBoard owner={owner} canWrite={canWrite} onWin={(d) => setDialog({ kind: "won", deal: d })} onLose={(d) => setDialog({ kind: "lost", deal: d })} />
        ) : (
          <EntityList
            entity={entity}
            compact
            hideViewToggle
            baseFilters={baseFilters}
            defaultConfig={defaultConfig}
            openMode="dialog"
            basePath="/obchody"
            initialRecordId={query.record ?? null}
            initialRecordTab={query.tab}
            initialRecordSub={query.sub}
            kanban={kanban}
          />
        )}
      </div>

      <QuickAddDealDialog
        open={quickAdd.open}
        onOpenChange={(open) => setQuickAdd((s) => ({ ...s, open }))}
        {...(quickAdd.stageId ? { defaultStageId: quickAdd.stageId } : {})}
        onCreated={(id) => (view === "board" && !narrow ? openDealPopup(id) : nav.push(`/obchody/${id}`))}
      />
      <WinDealFlow deal={dialog?.kind === "won" ? dialog.deal : null} onClose={close} />
      <LoseDealDialog deal={dialog?.kind === "lost" ? dialog.deal : null} onClose={close} />
    </div>
  );
}
