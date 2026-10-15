"use client";

import type {
  AttributeDescriptor,
  EntityDescriptor,
  FilterGroup,
  QueryParams,
  RecordRow,
} from "@rebar/core/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Columns3,
  Download,
  KanbanSquare,
  Link2,
  Plus,
  Search,
  Star,
  Table2,
  Trash2,
  UserRound,
  X,
  Lock,
  LockOpen,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, IconButton } from "../components/button";
import { Combobox } from "../components/combobox";
import { ConfirmDialog } from "../components/confirm-dialog";
import { EmptyState, Kbd } from "../components/badges";
import { Input, Field } from "../components/input";
import {
  Checkbox,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
} from "../components/overlay";
import { errorToast, successToast, undoToast } from "../components/toast";
import { useHotkeys } from "../hooks/use-hotkeys";
import { useNav } from "../nav";
import type { SavedViewInfo } from "./api";
import { buildCsv } from "./csv";
import { ExportDialog, notifyQueued, runExport, type ExportFormat } from "./export-dialog";
import { useEntityApi } from "./context";
import { CreateDialog } from "./create-dialog";
import { CardList } from "./card-list";
import { DataTable, type SortSpec } from "./data-table";
import { useIsMobile } from "../hooks/use-media";
import type { FilterAttributeGroup } from "./filter-attributes";
import { useFilterUi, type QuickCondition } from "./filter-bar";
import { completeFilters } from "./filters";
import { FILTER_PARAM, SEARCH_PARAM, decodeFilter, encodeFilter, sameFilter } from "./list-url";
import {
  keys,
  useEntityGroups,
  useEntityRows,
  useEntitySummary,
  useInvalidateEntity,
  useUpdateAttribute,
} from "./hooks";
import { Kanban, type KanbanDropTarget } from "./kanban";
import { ListOptionsMenu } from "./list-options-menu";
import { useBulkActions, type BulkAction, type RecordDialogExt } from "./module-ui";
import { RecordDialog } from "./record-dialog";
import { RECORD_PARAM } from "./record-url";
import { RecordView } from "./record-view";
import { useRecordParam } from "./use-record-param";
import type { ViewConfig } from "./types";
import type { ViewLayout } from "./view-layout";
import { ViewSwitcher } from "./view-switcher";

/** Kde se záznam otevře po kliku: vlastní stránka (výchozí), boční panel nad seznamem, nebo pop-up s `?record=<id>`. */
export type RecordOpenMode = "dialog" | "page" | "panel";

type Props = {
  entity: EntityDescriptor;
  /** Pohled z adresy (`?pohled=`). */
  initialViewId?: string | undefined;
  /** Předvyplnění nového záznamu a dodatečný filtr z kontextu (např. zakázky jedné firmy). */
  createDefaults?: Record<string, unknown> | undefined;
  /** Karta Přehled v detailu záznamu navíc (související záznamy modulu). */
  renderOverview?: ((id: string) => ReactNode) | undefined;
  /** Hned po otevření ukáže dialog pro nový záznam (odkaz `?novy=1` z palety). */
  autoOpenCreate?: boolean | undefined;
  /** Pevný filtr, který uživatel nevidí ani nezruší (související záznamy: vady jedné zakázky…). */
  baseFilters?: FilterGroup | undefined;
  /** Bez záložek pohledů a bez ukládání pohledů (vložený seznam uvnitř detailu). */
  compact?: boolean | undefined;
  /** Hned otevře exportní dialog s touto šablonou (odkaz z Nastavení → Exporty, `?exportTemplate=`). */
  initialExportTemplate?: string | undefined;
  /**
   * Jak se otevírá záznam. `page` (výchozí) = vlastní stránka entity, a když entita stránku nemá, boční panel;
   * `panel` = vždy boční panel; `dialog` = pop-up (`RecordDialog`) s `?record=<id>` v adrese: Zpět a Esc ho zavřou,
   * přímý odkaz ho otevře, filtr a pozice v seznamu zůstanou.
   */
  openMode?: RecordOpenMode | undefined;
  /** Záznam otevřený odkazem (`?record=` z adresy na serveru), ať se pop-up neobjeví až po načtení. Jen pro `openMode="dialog"`. */
  initialRecordId?: string | null | undefined;
  /** Záložka a podzáložka detailu z adresy (`?tab=`, `?sub=`) při otevření pop-upu odkazem. */
  initialRecordTab?: string | undefined;
  initialRecordSub?: string | undefined;
  /**
   * Adresa stránky, na které seznam běží (přepínání pohledů a `?novy=1` ji přepisují přes `replace`).
   * Výchozí je `entity.listPath`; stránka modulu s vlastní adresou (`/crm`) ji musí předat.
   */
  basePath?: string | undefined;
  /**
   * Výchozí filtr pohledu „Všechny“ (bez uloženého pohledu): uživatel ho vidí jako běžné chipy, může ho změnit nebo zrušit.
   * Na uložené pohledy nemá vliv. Předávej stabilní objekt (`useMemo`).
   */
  defaultFilters?: FilterGroup | undefined;
  /** Název záložky bez uloženého pohledu (výchozí „Všechny“); hodí se, má-li `defaultFilters` zúžený výběr. */
  allViewLabel?: string | undefined;
  /** Navržené podmínky filtru (viz `QuickCondition`), nabídnou se ve skupině „Návrhy“ nabídky Filtr. */
  quickConditions?: readonly QuickCondition[] | undefined;
  /** Skupiny atributů v nabídce Filtr (výčet klíčů); bez nich se atributy dělí podle typu. */
  filterGroups?: readonly FilterAttributeGroup[] | undefined;
  /**
   * Uspořádání uložených pohledů: nejčastější jako záložky, ostatní jedna nabídka po skupinách (viz `ViewLayout`).
   * Bez něj zůstává pás záložek se všemi pohledy.
   */
  viewLayout?: ViewLayout | undefined;
  /** Rozšíření nástěnky: cílové sloupce při tahu karty a zkratky nad kartou (viz `Kanban`). */
  kanban?:
    | {
        dropTargets?: readonly KanbanDropTarget[] | undefined;
        onShortcut?: ((key: string, row: RecordRow) => void) | undefined;
        shortcutKeys?: readonly string[] | undefined;
        /** Tlačítko „+“ pod sloupcem (přidání záznamu rovnou do stavu); bez funkce se nezobrazí. */
        onAddCard?: ((stageId: string) => void) | undefined;
      }
    | undefined;
  /** Vlastní hlavička, Přehled a záložky detailu v pop-upu (`openMode="dialog"`); viz `RecordDialogExt`. */
  recordDialog?: RecordDialogExt | undefined;
  /** Výchozí nastavení pohledu bez uloženého pohledu (např. `{ viewType: "kanban" }`). */
  defaultConfig?: Partial<ViewConfig> | undefined;
  /** Skryje přepínač Tabulka / Kanban (stránka, která nástěnku řídí sama). */
  hideViewToggle?: boolean | undefined;
};

const defaultColumns = (e: EntityDescriptor) => {
  const cols = e.attributes
    .filter((a) => a.defaultVisible || a.key === e.titleKey)
    .map((a) => a.key);
  return [e.titleKey, ...cols.filter((k) => k !== e.titleKey)];
};

/** Konfigurace pohledu „Všechny“: základ entity a případný výchozí filtr. */
const allConfig = (
  e: EntityDescriptor,
  filters?: FilterGroup,
  config?: Partial<ViewConfig>,
): ViewConfig => ({
  ...baseConfig(e),
  ...(filters ? { filters } : {}),
  ...config,
});

function baseConfig(e: EntityDescriptor): ViewConfig {
  const hasStatus = !!e.statusKey;
  return {
    viewType: "table",
    columns: defaultColumns(e),
    cardAttributes: e.attributes
      .filter((a) => a.defaultVisible && a.key !== e.titleKey && a.key !== e.statusKey)
      .slice(0, 3)
      .map((a) => a.key),
    sort: [],
    group: null,
    ...(hasStatus ? {} : {}),
  };
}

const norm = (c: ViewConfig, e: EntityDescriptor): ViewConfig => ({
  ...baseConfig(e),
  ...c,
  columns: c.columns?.length ? c.columns : defaultColumns(e),
});

/** Seznam záznamů entity: tabulka nebo kanban, pohledy, filtry, hledání, hromadné akce a detail v bočním panelu. */
export function EntityList({
  entity,
  initialViewId,
  createDefaults,
  renderOverview,
  autoOpenCreate,
  baseFilters,
  compact,
  initialExportTemplate,
  openMode = "page",
  basePath,
  initialRecordId,
  initialRecordTab,
  initialRecordSub,
  kanban,
  defaultFilters,
  allViewLabel = "Všechny",
  quickConditions,
  filterGroups,
  viewLayout,
  recordDialog,
  defaultConfig,
  hideViewToggle,
}: Props) {
  const api = useEntityApi();
  const nav = useNav();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const invalidate = useInvalidateEntity(entity.key);
  const update = useUpdateAttribute(entity.key);
  const views = useQuery({
    queryKey: keys.views(entity.key),
    queryFn: () => api.views.list(entity.key),
  });

  const [viewId, setViewId] = useState<string | null>(initialViewId ?? null);
  const [cfg, setCfg] = useState<ViewConfig>(() =>
    allConfig(entity, defaultFilters, defaultConfig),
  );
  const [applied, setApplied] = useState<string | null>(null); // pohled, jehož konfigurace už je v `cfg`
  const pendingUrlFilter = useRef<FilterGroup | undefined>(undefined);
  const urlInitDone = useRef(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const dialogMode = openMode === "dialog";
  const recordParam = useRecordParam(dialogMode, initialRecordId);
  // Výchozí: záznam se otevírá rovnou na vlastní stránce; boční panel zůstává jen pro entity bez adresy.
  const openRecord = (id: string) => {
    if (dialogMode) return recordParam.open(id);
    const href = api.hrefFor(entity.key, id);
    if (href && openMode !== "panel") nav.push(href);
    else setOpenId(id);
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState<null | "new" | "rename">(null);
  const [confirmDropView, setConfirmDropView] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Konfigurace pohledu se do pracovního stavu zkopíruje při přepnutí (a po načtení seznamu pohledů).
  const current = views.data?.find((v) => v.id === viewId) ?? null;
  useEffect(() => {
    if (applied === viewId) return;
    if (viewId && !views.data) return;
    const base = norm(
      current ? current.config : allConfig(entity, defaultFilters, defaultConfig),
      entity,
    );
    // filtr z adresy (`?f=`) má přednost před filtrem pohledu
    setCfg(pendingUrlFilter.current ? { ...base, filters: pendingUrlFilter.current } : base);
    pendingUrlFilter.current = undefined;
    setApplied(viewId);
    setSelected(new Set());
  }, [viewId, current, views.data, applied, entity, defaultFilters, defaultConfig]);

  // Filtr a hledání z adresy (`?f=`, `?q=`): odkaz na filtrovaný seznam jde poslat (SPOL-09)
  useEffect(() => {
    if (compact) return;
    const p = new URLSearchParams(window.location.search);
    const f = decodeFilter(p.get(FILTER_PARAM));
    const q0 = p.get(SEARCH_PARAM)?.slice(0, 200);
    if (q0) {
      setSearch(q0);
      setQ(q0.trim());
    }
    if (f) {
      pendingUrlFilter.current = f;
      setCfg((c) => ({ ...c, filters: f }));
    }
    // jen při prvním zobrazení
  }, []);

  useEffect(() => {
    if (autoOpenCreate && entity.can.create) {
      setCreateOpen(true);
      nav.replace(basePath ?? entity.listPath);
    }
    // jen při prvním zobrazení
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const dirty = useMemo(() => {
    const a = JSON.stringify(
      norm(current ? current.config : allConfig(entity, defaultFilters, defaultConfig), entity),
      replacer,
    );
    return a !== JSON.stringify(norm(cfg, entity), replacer);
  }, [cfg, current, entity, defaultFilters, defaultConfig]);

  const params = useMemo<QueryParams>(() => {
    const user = completeFilters(cfg.filters);
    const filters = baseFilters
      ? user
        ? ({ op: "and", conditions: [baseFilters, user] } as FilterGroup)
        : baseFilters
      : user;
    return {
      ...(filters ? { filters } : {}),
      ...(cfg.sort?.length ? { sort: cfg.sort } : {}),
      ...(q ? { q } : {}),
      ...(cfg.group ? { group: cfg.group } : {}),
    };
  }, [cfg.filters, cfg.sort, cfg.group, q, baseFilters]);

  // aktuální filtr a hledání se zapisují do adresy (jen když se liší od pohledu), aby se odkaz dal poslat
  useEffect(() => {
    if (compact || typeof window === "undefined") return;
    if (!urlInitDone.current) {
      urlInitDone.current = true;
      return;
    }
    if (viewId && applied !== viewId) return;
    const base = completeFilters(current ? current.config.filters : defaultFilters);
    const mine = completeFilters(cfg.filters);
    const url = new URL(window.location.href);
    const enc = sameFilter(mine, base) ? null : encodeFilter(mine);
    if (enc) url.searchParams.set(FILTER_PARAM, enc);
    else url.searchParams.delete(FILTER_PARAM);
    if (q) url.searchParams.set(SEARCH_PARAM, q);
    else url.searchParams.delete(SEARCH_PARAM);
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
      window.history.replaceState(window.history.state, "", next);
  }, [cfg.filters, q, viewId, applied, current, defaultFilters, compact]);

  const isKanban = cfg.viewType === "kanban" && !!entity.statusKey;
  const rows = useEntityRows(entity.key, params, !isKanban);
  const summary = useEntitySummary(entity.key, params);
  const groups = useEntityGroups(entity.key, cfg.group ?? null, params);
  const statusAttr = entity.attributes.find((a) => a.key === entity.statusKey);

  const setConfig = useCallback(
    (patch: Partial<ViewConfig>) => setCfg((c) => ({ ...c, ...patch })),
    [],
  );

  function selectView(id: string | null) {
    setViewId(id);
    const base = basePath ?? entity.listPath;
    if (basePath) {
      // stránka modulu s vlastními parametry v adrese (`/crm?zobrazeni=seznam&vlastnik=…`): ostatní parametry zůstanou
      const url = new URL(window.location.href);
      url.searchParams.delete(RECORD_PARAM);
      if (id) url.searchParams.set("pohled", id);
      else url.searchParams.delete("pohled");
      nav.replace(`${base}${url.search}`);
      return;
    }
    nav.replace(id ? `${base}?pohled=${id}` : base);
  }

  /* ---------- pohledy ---------- */
  const saveView = useMutation({
    mutationFn: async (v: {
      mode: "update" | "new" | "rename";
      name?: string;
      shared?: boolean;
    }) => {
      if (v.mode === "new")
        return api.views.save(entity.key, { name: v.name!, shared: !!v.shared, config: cfg });
      if (!current) throw new Error("Není co uložit.");
      if (v.mode === "rename")
        await api.views.update(entity.key, current.id, { name: v.name!, shared: !!v.shared });
      else await api.views.update(entity.key, current.id, { config: cfg });
      return { id: current.id };
    },
    onSuccess: async (res, v) => {
      await qc.invalidateQueries({ queryKey: keys.views(entity.key) });
      nav.refresh();
      successToast(v.mode === "new" ? "Pohled uložen." : "Pohled aktualizován.");
      if (v.mode === "new") {
        setApplied(res.id);
        selectView(res.id);
      }
      setSaveOpen(null);
    },
    onError: (e: Error) => errorToast(e.message),
  });
  const dropView = useMutation({
    mutationFn: (id: string) => api.views.remove(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.views(entity.key) });
      nav.refresh();
      selectView(null);
    },
    onError: (e: Error) => errorToast(e.message),
  });
  const favView = useMutation({
    mutationFn: (v: SavedViewInfo) => api.views.favorite(v.id, !v.favorite),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.views(entity.key) });
      nav.refresh();
    },
    onError: (e: Error) => errorToast(e.message),
  });

  /* ---------- zápis ---------- */
  const commit = useCallback(
    async (id: string, attr: string, value: unknown) => {
      const row = rows.rows.find((r) => r.id === id);
      await update.mutateAsync({ id, attr, value, updatedAt: row?.updatedAt ?? "" });
    },
    [rows.rows, update],
  );

  const remove = useMutation({
    mutationFn: (ids: string[]) => api.remove(entity.key, ids),
    onSuccess: (_r, ids) => {
      void invalidate();
      setSelected(new Set());
      if (openId && ids.includes(openId)) setOpenId(null);
      undoToast(`Smazáno: ${ids.length}.`, async () => {
        try {
          await api.restore(entity.key, ids);
          void invalidate();
        } catch (e) {
          errorToast((e as Error).message);
        }
      });
    },
    onError: (e: Error) => errorToast(e.message),
  });

  /** Hromadná změna jednoho atributu u vybraných záznamů; vratná toastem „Zpět“. */
  const bulkSet = useMutation({
    mutationFn: async (v: { attr: string; value: unknown }) => {
      const ids = [...selected];
      const prev = ids.map((id) => ({
        id,
        old: rows.rows.find((r) => r.id === id)?.[v.attr] ?? null,
      }));
      const results = await Promise.allSettled(
        ids.map((id) => api.update(entity.key, id, { [v.attr]: v.value })),
      );
      const ok = prev.filter((_, i) => results[i]!.status === "fulfilled");
      return { ok, failed: results.length - ok.length, attr: v.attr };
    },
    onSuccess: ({ ok, failed, attr }) => {
      void invalidate();
      if (failed)
        errorToast(
          `${failed} z vybraných se nepodařilo změnit (chybí oprávnění, nebo je mezitím někdo upravil).`,
        );
      if (ok.length)
        undoToast(`Změněno záznamů: ${ok.length}.`, async () => {
          await Promise.allSettled(ok.map((p) => api.update(entity.key, p.id, { [attr]: p.old })));
          void invalidate();
        });
    },
    onError: (e: Error) => errorToast(e.message),
  });

  /** Hromadná změna viditelnosti (SPOL-06): jen vlastník; zamčení zamkne i podřízené záznamy. */
  const bulkLock = useMutation({
    mutationFn: (isPrivate: boolean) => api.setVisibility(entity.key, [...selected], isPrivate),
    onSuccess: (r, isPrivate) => {
      void invalidate();
      successToast(
        isPrivate ? `Zamčeno záznamů: ${r.changed}.` : `Zveřejněno záznamů: ${r.changed}.`,
      );
    },
    onError: (e: Error) => errorToast(e.message),
  });

  function exportCsv() {
    const cols = (cfg.columns ?? defaultColumns(entity))
      .map((k) => entity.attributes.find((a) => a.key === k))
      .filter((a): a is AttributeDescriptor => !!a);
    const chosen = rows.rows.filter((r) => selected.has(r.id));
    // BOM kvůli českým znakům v Excelu
    const blob = new Blob([buildCsv(cols, chosen, rows.labels)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entity.label.many
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Export celé filtrované sady (ne jen načtených řádků) ze serveru: XLSX nebo CSV podle zobrazených sloupců. */
  const bulkActions = useBulkActions(entity.key);
  const [bulkOpen, setBulkOpen] = useState<BulkAction | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(!!initialExportTemplate);
  /** Rychlý export celé filtrované sady v zobrazených sloupcích (bez dialogu). */
  async function exportAll(format: ExportFormat) {
    setExporting(true);
    try {
      const r = await runExport(entity.key, {
        format,
        scope: "view",
        columns: cfg.columns ?? defaultColumns(entity),
        query: {
          ...(params.filters ? { filters: params.filters } : {}),
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.q ? { q: params.q } : {}),
        },
      });
      if (r === "queued") notifyQueued();
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  function cycleSort(key: string) {
    const cur = (cfg.sort ?? []).find((x) => x.attr === key);
    const rest = (cfg.sort ?? []).filter((x) => x.attr !== key);
    setConfig({
      sort: !cur
        ? [...rest, { attr: key, dir: "asc" }]
        : cur.dir === "asc"
          ? [...rest, { attr: key, dir: "desc" }]
          : rest,
    });
  }

  useHotkeys(
    {
      c: () => entity.can.create && setCreateOpen(true),
      "/": () => searchRef.current?.focus(),
      Escape: () => {
        if (selected.size) setSelected(new Set());
        else if (openId) setOpenId(null);
      },
    },
    true,
  );

  const attrs = entity.attributes;
  const visible = cfg.columns ?? defaultColumns(entity);
  const labelOf = (attr: string, id: string) => rows.labels[attr]?.[id]?.label;
  const hasFilters = !!completeFilters(cfg.filters) || !!q;
  const emptyEl = (
    <EmptyState
      title={hasFilters ? "Nic nenalezeno" : `Zatím tu nejsou žádné záznamy`}
      description={
        hasFilters ? "Zkuste upravit hledání nebo filtry." : `${entity.label.many} se objeví tady.`
      }
      action={
        hasFilters ? (
          <Button
            onClick={() => {
              setSearch("");
              setConfig({ filters: undefined });
            }}
          >
            Vymazat filtry
          </Button>
        ) : entity.can.create ? (
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus /> Přidat {entity.label.one.toLowerCase()}
          </Button>
        ) : undefined
      }
    />
  );
  const userAttrs = attrs.filter((a) => a.type === "user" && !a.readonly);
  const filter = useFilterUi({
    attributes: attrs,
    value: cfg.filters,
    onChange: (f) => setConfig({ filters: f }),
    lookups: api.lookups,
    labelOf,
    quickConditions,
    groups: filterGroups,
    baseline: current ? current.config.filters : defaultFilters,
  });

  return (
    <div className="@container flex min-h-0 flex-1 flex-col" data-testid="entity-list">
      {/* pohledy */}
      <ViewSwitcher
        allLabel={allViewLabel}
        views={views.data}
        viewId={viewId}
        onSelect={selectView}
        layout={viewLayout}
        isMobile={isMobile}
        hidden={compact}
        settings={
          current && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label="Nastavení pohledu" variant="ghost" size="sm">
                  <Columns3 className="rotate-90" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => favView.mutate(current)}>
                  <Star />{" "}
                  {current.favorite ? "Odepnout z levého panelu" : "Připnout do levého panelu"}
                </DropdownMenuItem>
                {current.mine && (
                  <DropdownMenuItem onSelect={() => setSaveOpen("rename")}>
                    Přejmenovat a sdílení
                  </DropdownMenuItem>
                )}
                {current.mine && (
                  <DropdownMenuItem danger onSelect={() => setConfirmDropView(true)}>
                    <Trash2 /> Smazat pohled
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      {/* nástrojová lišta: hlavní věci (hledání, filtr, nový záznam), vedlejší v nabídce Zobrazení */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        role="toolbar"
        aria-label="Nástroje seznamu"
      >
        <div className="relative min-w-0 flex-1 @[40rem]:w-48 @[40rem]:flex-none xl:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            ref={searchRef}
            aria-label="Hledat v seznamu"
            placeholder="Hledat…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8"
          />
          {search ? (
            <button
              type="button"
              aria-label="Zrušit hledání"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-fg"
              onClick={() => setSearch("")}
            >
              <X className="size-4" />
            </button>
          ) : (
            <Kbd className="absolute right-2 top-1/2 hidden -translate-y-1/2 @[40rem]:inline-flex">
              /
            </Kbd>
          )}
        </div>
        {filter.button}
        {!compact && (hasFilters || !!viewId) && (
          <IconButton
            label="Kopírovat odkaz na tento seznam"
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(window.location.href)
                .then(() => successToast("Odkaz zkopírován."))
                .catch(() => errorToast("Odkaz se nepodařilo zkopírovat."));
            }}
          >
            <Link2 />
          </IconButton>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {entity.statusKey && !hideViewToggle && !isMobile && (
            <div
              className="flex min-h-8 rounded-md border border-line-strong p-0.5"
              role="group"
              aria-label="Typ zobrazení"
            >
              <IconButton
                label="Tabulka"
                className="h-auto w-7"
                variant={!isKanban ? "secondary" : "ghost"}
                aria-pressed={!isKanban}
                onClick={() => setConfig({ viewType: "table" })}
              >
                <Table2 />
              </IconButton>
              <IconButton
                label="Kanban"
                className="h-auto w-7"
                variant={isKanban ? "secondary" : "ghost"}
                aria-pressed={isKanban}
                onClick={() => setConfig({ viewType: "kanban" })}
              >
                <KanbanSquare />
              </IconButton>
            </div>
          )}
          <ListOptionsMenu
            entity={entity}
            cfg={cfg}
            visible={visible}
            isKanban={isKanban}
            viewTypeInMenu={isMobile && !!entity.statusKey && !hideViewToggle}
            onConfig={setConfig}
            onCycleSort={cycleSort}
            exportApi={
              entity.can.export !== false && !compact
                ? {
                    exporting,
                    run: (f) => void exportAll(f),
                    openDialog: () => setExportOpen(true),
                  }
                : undefined
            }
            saveApi={
              compact
                ? undefined
                : {
                    dirty,
                    canUpdate: !!current?.mine,
                    onUpdate: () => saveView.mutate({ mode: "update" }),
                    onSaveNew: () => setSaveOpen("new"),
                  }
            }
          />
          {entity.can.create && (
            <Button
              variant="primary"
              onClick={() => setCreateOpen(true)}
              data-testid="create-record"
              aria-label="Nový"
            >
              <Plus /> <span className="hidden @[28rem]:inline">Nový</span>
            </Button>
          )}
        </div>
      </div>

      {/* rychlé předvolby (Moje, Dnes, Po termínu, Bez aktivity, Soukromé) */}
      {!compact && !!entity.quickFilters?.length && (
        <div
          className="flex flex-wrap items-center gap-1.5 px-4 pb-2"
          role="group"
          aria-label="Rychlé předvolby"
          data-testid="quick-filters"
        >
          {entity.quickFilters.map((qf) => {
            const active = sameFilter(completeFilters(cfg.filters), qf.filter);
            return (
              <button
                key={qf.key}
                type="button"
                aria-pressed={active}
                data-testid={`quick-filter-${qf.key}`}
                onClick={() =>
                  setConfig({
                    filters: active
                      ? completeFilters(current ? current.config.filters : defaultFilters)
                      : qf.filter,
                  })
                }
                className={
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-sm transition-colors " +
                  (active
                    ? "border-accent-line bg-accent-soft font-medium text-fg"
                    : "border-line text-muted hover:bg-hover hover:text-fg")
                }
              >
                {qf.key === "private" && <Lock className="size-3" />}
                {qf.label}
              </button>
            );
          })}
        </div>
      )}

      {/* aktivní filtry: jen když nějaké jsou */}
      {filter.chips && <div className="px-4 pb-2">{filter.chips}</div>}

      {/* hromadné akce */}
      {selected.size > 0 && !isKanban && (
        <div
          className="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-md border border-accent-line bg-accent-soft px-3 py-1"
          role="region"
          aria-label="Hromadné akce"
        >
          <span className="font-medium">Vybráno: {selected.size}</span>
          {entity.can.write && statusAttr && !statusAttr.readonly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" loading={bulkSet.isPending}>
                  Změnit stav
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(statusAttr.stages ?? []).map((st) => (
                  <DropdownMenuItem
                    key={st.id}
                    onSelect={() => bulkSet.mutate({ attr: statusAttr.key, value: st.id })}
                  >
                    <span className="chip" data-color={st.color}>
                      <span className="chip-dot" />
                      {st.name}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {entity.can.write &&
            userAttrs.map((a) => (
              <Combobox
                key={a.key}
                load={api.lookups.users}
                value={null}
                onChange={(v) => v && bulkSet.mutate({ attr: a.key, value: v })}
                searchPlaceholder="Najít uživatele…"
                trigger={
                  <Button variant="secondary">
                    <UserRound /> Přiřadit: {a.label.toLowerCase()}
                  </Button>
                }
              />
            ))}
          <Button variant="secondary" onClick={exportCsv}>
            <Download /> Exportovat
          </Button>
          {entity.visibility?.lockable &&
            entity.visibility.hasLock &&
            (["lock", "unlock"] as const).map((m) => (
              <Button
                key={m}
                variant="secondary"
                loading={bulkLock.isPending}
                onClick={() => bulkLock.mutate(m === "lock")}
              >
                {m === "lock" ? <Lock /> : <LockOpen />} {m === "lock" ? "Zamknout" : "Zveřejnit"}
              </Button>
            ))}
          {bulkActions.map((a) => (
            <Button key={a.id} variant="secondary" onClick={() => setBulkOpen(a)}>
              {a.label}
            </Button>
          ))}
          {entity.can.delete && (
            <Button
              variant="secondary"
              onClick={() => remove.mutate([...selected])}
              loading={remove.isPending}
            >
              <Trash2 /> Smazat
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Zrušit výběr
          </Button>
        </div>
      )}

      {/* obsah */}
      {isKanban && statusAttr ? (
        <Kanban
          entity={entity.key}
          titleKey={entity.titleKey}
          statusAttr={statusAttr}
          attributes={attrs}
          cardAttributes={cfg.cardAttributes ?? []}
          params={{
            ...(params.filters ? { filters: params.filters } : {}),
            ...(params.sort ? { sort: params.sort } : {}),
            ...(params.q ? { q: params.q } : {}),
          }}
          canWrite={entity.can.write}
          openId={dialogMode ? recordParam.id : openId}
          onOpen={openRecord}
          {...(kanban?.dropTargets ? { dropTargets: kanban.dropTargets } : {})}
          {...(kanban?.onShortcut ? { onShortcut: kanban.onShortcut } : {})}
          {...(kanban?.shortcutKeys ? { shortcutKeys: kanban.shortcutKeys } : {})}
          {...(kanban?.onAddCard ? { onAddCard: kanban.onAddCard } : {})}
          onMove={async (id, updatedAt, stage) => {
            await update.mutateAsync({ id, attr: statusAttr.key, value: stage, updatedAt });
            await qc.invalidateQueries({ queryKey: keys.kanbanAny(entity.key) });
          }}
        />
      ) : rows.isError && rows.rows.length === 0 ? (
        <EmptyState
          title="Seznam se nepodařilo načíst"
          description={
            (rows.error as Error | null)?.message || "Zkontrolujte připojení a zkuste to znovu."
          }
          action={
            <Button variant="primary" onClick={() => void rows.refetch()}>
              Zkusit znovu
            </Button>
          }
        />
      ) : isMobile ? (
        <CardList
          attributes={attrs}
          columns={visible}
          rows={rows.rows}
          labels={rows.labels}
          loading={rows.isLoading}
          hasMore={!!rows.hasNextPage}
          fetchingMore={rows.isFetchingNextPage}
          onEndReached={() => void rows.fetchNextPage()}
          onOpen={openRecord}
          emptyState={emptyEl}
          total={summary.data?.total ?? rows.total}
        />
      ) : (
        <DataTable
          attributes={attrs}
          columns={visible}
          widths={cfg.columnWidths ?? {}}
          rows={rows.rows}
          labels={rows.labels}
          total={summary.data?.total ?? rows.total}
          totals={summary.data?.totals ?? {}}
          sort={(cfg.sort ?? []) as SortSpec}
          group={cfg.group ?? null}
          groups={groups.data}
          loading={rows.isLoading}
          fetchingMore={rows.isFetchingNextPage}
          canWrite={entity.can.write}
          lookups={api.lookups}
          selected={selected}
          onSelectedChange={setSelected}
          onSortChange={(sort) => setConfig({ sort })}
          onGroupChange={(group) => setConfig({ group })}
          onColumnsChange={(columns) => setConfig({ columns })}
          onWidthsChange={(columnWidths) => setConfig({ columnWidths })}
          onCommit={commit}
          onOpen={openRecord}
          hrefFor={(id) => api.hrefFor(entity.key, id)}
          onEndReached={() => void rows.fetchNextPage()}
          hasMore={!!rows.hasNextPage}
          openId={dialogMode ? recordParam.id : openId}
          emptyState={emptyEl}
        />
      )}

      <Sheet
        open={!!openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={entity.label.one}
        width={680}
      >
        {openId && (
          <RecordView
            key={openId}
            entity={entity}
            id={openId}
            mode="panel"
            onClose={() => setOpenId(null)}
            onDeleted={() => setOpenId(null)}
            overview={renderOverview?.(openId)}
          />
        )}
      </Sheet>

      {dialogMode && (
        <RecordDialog
          entity={entity}
          id={recordParam.id}
          onClose={recordParam.close}
          overview={recordParam.id ? renderOverview?.(recordParam.id) : undefined}
          initialTab={initialRecordTab}
          initialSub={initialRecordSub}
          ext={recordDialog}
        />
      )}

      <CreateDialog
        entity={entity}
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaults={createDefaults}
        onCreated={(row, { open }) => open && openRecord(row.id)}
      />

      {entity.can.export !== false && !compact && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          entityKey={entity.key}
          entityLabel={entity.label.many}
          attributes={entity.attributes}
          currentColumns={cfg.columns ?? defaultColumns(entity)}
          query={{
            ...(params.filters ? { filters: params.filters } : {}),
            ...(params.sort ? { sort: params.sort } : {}),
            ...(params.q ? { q: params.q } : {}),
          }}
          total={summary.data?.total}
          initialTemplateId={initialExportTemplate}
        />
      )}

      {/* hromadná akce modulu (okno s vlastním obsahem) */}
      <Dialog open={!!bulkOpen} onOpenChange={(o) => !o && setBulkOpen(null)}>
        {bulkOpen && (
          <DialogContent
            title={bulkOpen.dialog.title}
            {...(bulkOpen.dialog.description ? { description: bulkOpen.dialog.description } : {})}
          >
            {bulkOpen.dialog.render({
              ids: [...selected],
              close: () => setBulkOpen(null),
              refresh: () => void invalidate(),
            })}
          </DialogContent>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmDropView && !!current}
        onOpenChange={setConfirmDropView}
        title="Smazat pohled"
        description={current?.name ?? ""}
        confirmLabel="Smazat"
        danger
        onConfirm={() =>
          // chybu ukáže toast z `dropView`
          dropView.mutateAsync(current!.id).then(
            () => undefined,
            () => undefined,
          )
        }
      >
        {`Smazat pohled „${current?.name ?? ""}“?`}
      </ConfirmDialog>
      <SaveViewDialog
        mode={saveOpen}
        initialName={saveOpen === "rename" ? (current?.name ?? "") : ""}
        initialShared={saveOpen === "rename" ? !!current?.shared : false}
        loading={saveView.isPending}
        onClose={() => setSaveOpen(null)}
        onSave={(name, shared) =>
          saveView.mutate({ mode: saveOpen === "rename" ? "rename" : "new", name, shared })
        }
      />
    </div>
  );
}

/** Stejné pořadí klíčů a bez prázdných hodnot, aby se „změněno“ nehlásilo kvůli formě zápisu. */
function replacer(_k: string, v: unknown) {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v) && v.length === 0) return undefined;
  if (v && typeof v === "object" && !Array.isArray(v))
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
  return v;
}

function SaveViewDialog({
  mode,
  initialName,
  initialShared,
  loading,
  onClose,
  onSave,
}: {
  mode: null | "new" | "rename";
  initialName: string;
  initialShared: boolean;
  loading: boolean;
  onClose: () => void;
  onSave: (name: string, shared: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  useEffect(() => {
    if (mode) {
      setName(initialName);
      setShared(initialShared);
    }
  }, [mode, initialName, initialShared]);
  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={mode === "rename" ? "Upravit pohled" : "Uložit pohled"}
        description="Pohled si pamatuje filtry, řazení, sloupce a seskupení."
      >
        <form
          className="px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSave(name.trim(), shared);
          }}
        >
          <Field label="Název pohledu" htmlFor="view-name">
            <Input
              id="view-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="např. Moje otevřené zakázky"
            />
          </Field>
          <label className="mb-4 flex cursor-pointer items-center gap-2">
            <Checkbox checked={shared} onCheckedChange={(v) => setShared(!!v)} /> Sdílet s ostatními
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={loading} disabled={!name.trim()}>
              Uložit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type { AttributeDescriptor, FilterGroup };
