"use client";

import { formatMinor } from "@rebar/core/shared";
import {
  Button,
  Combobox,
  Icon,
  IconButton,
  cn,
  useCan,
  useEntityApi,
  useEntitySummary,
  withRecordParam,
  type ComboOption,
} from "@rebar/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ForecastView, ArchiveView, DealListView } from "../views/components";
import { QuickAddDealDialog } from "../inbox/components";
import { BoardView } from "./board-view";
import { boardFilters, ownerFromQuery, pluralDeals, viewFromQuery, type CrmView } from "./logic";

const VIEWS: { id: CrmView; label: string; icon: string }[] = [
  { id: "nastenka", label: "Nástěnka", icon: "kanban" },
  { id: "seznam", label: "Seznam", icon: "list" },
  { id: "prognoza", label: "Prognóza", icon: "chart-column" },
  { id: "archiv", label: "Archiv", icon: "archive" },
];

/** Přepíše parametry adresy bez navigace (stav stránky zůstane, odkaz nese pohled a vlastníka). */
function replaceQuery(patch: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(window.history.state, "", url);
}

/** Otevře detail zakázky v pop-upu seznamu na stránce (stejně jako klik na kartu: Zpět ho zavře). */
function openDealPopup(id: string) {
  const href = withRecordParam(window.location.pathname + window.location.search, id);
  window.history.pushState({ ...(window.history.state ?? {}), __recordDialog: id }, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtr vlastníka: Všichni, Já, nebo konkrétní uživatel. */
function OwnerSwitch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const api = useEntityApi();
  const [name, setName] = useState<string | null>(null);
  const load = useCallback(
    async (q: string): Promise<ComboOption[]> => {
      const specials: ComboOption[] = [
        { value: "all", label: "Všichni" },
        { value: "me", label: "Já" },
      ].filter((o) => norm(o.label).includes(norm(q)));
      const users = await api.lookups.users(q);
      return [...specials, ...users.filter((u) => u.value !== api.me.id)];
    },
    [api],
  );
  // jméno vybraného uživatele z adresy (po obnovení stránky ho nemáme z výběru)
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
      aria-label="Vlastník zakázek"
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
          <span className={cn("max-w-32 truncate", value === "all" && "hidden sm:inline")}>
            {label}
          </span>
          <Icon name="chevron-down" className="size-3.5 text-faint" />
        </Button>
      }
    />
  );
}

/** Počet otevřených zakázek (a jejich hodnota s oprávněním k cenám) podle filtru vlastníka. */
function DealCounter({ owner }: { owner: string }) {
  const params = useMemo(() => ({ filters: boardFilters(owner) }), [owner]);
  const summary = useEntitySummary("job", params);
  if (!summary.data) return <span className="h-5 w-24" aria-hidden />;
  const { total, totals } = summary.data;
  const value = totals.value;
  return (
    <span className="tabular text-sm text-muted" data-testid="deal-counter">
      {total} {pluralDeals(total)}
      {typeof value === "number" && <> · {formatMinor(value)}</>}
    </span>
  );
}

/**
 * Stránka `/crm`: přepínač pohledů (Nástěnka, Seznam, Prognóza, Archiv; v adrese `?zobrazeni=`), filtr vlastníka
 * (`?vlastnik=`), počítadlo zakázek a tlačítko „+ Zakázka“. Nástěnka je kanban fází Poptávka a Nabídka, ostatní pohledy
 * dodává oblast Pohledy a všechny otevírají detail v pop-upu (`?record=`).
 */
export function CrmPage({ query }: { query: Record<string, string> }) {
  const can = useCan();
  const [view, setView] = useState<CrmView>(() => viewFromQuery(query.zobrazeni));
  const [owner, setOwner] = useState(() => ownerFromQuery(query.vlastnik));
  const [quickAdd, setQuickAdd] = useState<{ open: boolean; stageId?: string }>({ open: false });
  const canCreate = can("zakazky.write");

  const selectView = (next: CrmView) => {
    setView(next);
    replaceQuery({
      zobrazeni: next === "nastenka" ? null : next,
      record: null,
      tab: null,
      sub: null,
    });
  };
  const selectOwner = (next: string) => {
    setOwner(next);
    replaceQuery({ vlastnik: next === "all" ? null : next });
  };
  const addInStage = useCallback((stageId: string) => setQuickAdd({ open: true, stageId }), []);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="crm-page" data-view={view}>
      <div className="flex items-center gap-x-3 border-b border-line px-4 py-2">
        <div
          className="flex min-h-8 rounded-md border border-line-strong p-0.5"
          role="group"
          aria-label="Zobrazení"
        >
          {VIEWS.map((v) => (
            <IconButton
              key={v.id}
              label={v.label}
              variant={view === v.id ? "secondary" : "ghost"}
              aria-pressed={view === v.id}
              className={cn("h-auto w-8")}
              data-testid={`view-${v.id}`}
              onClick={() => selectView(v.id)}
            >
              <Icon name={v.icon} />
            </IconButton>
          ))}
        </div>
        {canCreate && (
          <Button
            variant="primary"
            data-testid="add-deal"
            onClick={() => setQuickAdd({ open: true })}
          >
            <Icon name="plus" /> <span className="sr-only sm:not-sr-only">Zakázka</span>
          </Button>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          {(view === "nastenka" || view === "seznam") && (
            <span className="hidden sm:contents">
              <DealCounter owner={owner} />
            </span>
          )}
          <OwnerSwitch value={owner} onChange={selectOwner} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {view === "nastenka" && (
          <BoardView
            owner={owner}
            initialRecordId={query.record ?? null}
            initialTab={query.tab}
            initialSub={query.sub}
            onAddDeal={addInStage}
          />
        )}
        {view === "seznam" && <DealListView owner={owner} />}
        {view === "prognoza" && <ForecastView owner={owner} />}
        {view === "archiv" && <ArchiveView owner={owner} />}
      </div>

      <QuickAddDealDialog
        open={quickAdd.open}
        onOpenChange={(open) => setQuickAdd((s) => ({ ...s, open }))}
        {...(quickAdd.stageId ? { defaultStageId: quickAdd.stageId } : {})}
        onCreated={openDealPopup}
      />
    </div>
  );
}
