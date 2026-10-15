"use client";

import { formatInstant } from "@rebar/core/time";
import {
  formatDate,
  type AttributeDescriptor,
  type EntityDescriptor,
  type Labels,
  type RecordRow,
} from "@rebar/core/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CheckSquare,
  Download,
  ExternalLink,
  MoreHorizontal,
  Paperclip,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Avatar, Chip, EmptyState, Skeleton } from "../components/badges";
import { Button, IconButton } from "../components/button";
import { ScrollTabsList } from "../components/scroll-tabs";
import { Combobox } from "../components/combobox";
import { Card, CardBody, CardHeader, FieldList, FieldRow } from "../components/surface";
import { DatePicker } from "../components/date-picker";
import { Input } from "../components/input";
import {
  Checkbox,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsTrigger,
} from "../components/overlay";
import { errorToast, successToast, undoToast } from "../components/toast";
import type { PaletteItem } from "../components/command-palette";
import { usePaletteActions } from "../components/palette-actions";
import { cn } from "../lib/cn";
import { Icon } from "../lib/icons";
import { useNav } from "../nav";
import { useRecordExtensions, type RecordDialogExt, type TopTab } from "./module-ui";
import { SegmentedControl } from "../components/segmented-control";
import type { ActivityResult, TimelineItem } from "./api";
import { CellValue } from "./cell";
import { useEntityApi } from "./context";
import { CellEditor } from "./editors";
import { keys, useInvalidateEntity, useUpdateAttribute } from "./hooks";
import { TYPE_ICONS } from "./type-icons";

type Props = {
  entity: EntityDescriptor;
  id: string;
  /**
   * `panel` = boční panel nad seznamem, `page` = vlastní stránka záznamu, `dialog` = pop-up (`RecordDialog`):
   * obsah jako na stránce (dvousloupcový přehled), ale úzký a bez vlastního záhlaví stránky.
   */
  mode: "panel" | "page" | "dialog";
  onClose?: (() => void) | undefined;
  /** Po smazání (seznam se obnoví, panel zavře). */
  onDeleted?: (() => void) | undefined;
  /** Obsah karty Přehled navíc (související záznamy z modulu: osoby firmy, zakázky…). */
  overview?: ReactNode;
  /** Záložka (`?tab=`) a její podzáložka (`?sub=`) z adresy při otevření stránky záznamu. */
  initialTab?: string | undefined;
  initialSub?: string | undefined;
  /** Vlastní hlavička, Přehled a lišta záložek modulu; platí jen v režimu `dialog` (stránka záznamu se nemění). */
  dialogExt?: RecordDialogExt | undefined;
};

const MENTION = /@\[([^\]]*)\]\([0-9a-f-]{36}\)/gi;

export function RecordView({
  entity,
  id,
  mode,
  onClose,
  onDeleted,
  overview,
  initialTab,
  initialSub,
  dialogExt,
}: Props) {
  const api = useEntityApi();
  const nav = useNav();
  const dlg = mode === "dialog" ? dialogExt : undefined;
  const invalidate = useInvalidateEntity(entity.key);
  const q = useQuery({
    queryKey: keys.record(entity.key, id),
    queryFn: () => api.get(entity.key, id),
  });
  const update = useUpdateAttribute(entity.key);
  const [editing, setEditing] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const row = q.data?.row;
  const labels = q.data?.labels ?? {};
  const titleAttr = entity.attributes.find((a) => a.key === entity.titleKey);
  const statusAttr = entity.attributes.find((a) => a.key === entity.statusKey);

  async function save(attr: AttributeDescriptor, value: unknown) {
    if (!row) return;
    setEditing(null);
    if (JSON.stringify(row[attr.key] ?? null) === JSON.stringify(value ?? null)) return;
    setError(null);
    try {
      await update.mutateAsync({ id, attr: attr.key, value, updatedAt: row.updatedAt });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const del = useMutation({
    mutationFn: () => api.remove(entity.key, [id]),
    onSuccess: () => {
      void invalidate();
      // smazání je vratné (soft delete), proto toast „Zpět“ místo potvrzovacího dialogu
      undoToast(
        `Smazáno: ${row ? String(row[entity.titleKey] ?? entity.label.one) : entity.label.one}.`,
        async () => {
          try {
            await api.restore(entity.key, [id]);
            void invalidate();
          } catch (e) {
            errorToast((e as Error).message);
          }
        },
      );
      onDeleted?.();
    },
    onError: (e: Error) => errorToast(e.message),
  });

  const ext = useRecordExtensions(entity.key);
  // Lišta záložek: Přehled, záložky a skupiny modulů, základní Aktivita/Soubory (podle `order`); úkoly a poznámky přidává modul `ukoly`.
  const tops = useMemo<TopTab[]>(() => {
    const core: TopTab[] = [
      { id: "prehled", label: "Přehled", order: 0, tabs: [] },
      {
        id: "aktivita",
        label: "Aktivita",
        icon: "message-square",
        order: 800,
        tabs: [],
      },
      { id: "soubory", label: "Soubory", icon: "paperclip", order: 820, tabs: [] },
    ].filter(
      (t) =>
        !ext.hiddenCore.has(
          (t.id === "aktivita" ? "activity" : "files") as never,
        ) || t.id === "prehled",
    );
    return [...core, ...ext.topTabs(row)]
      .filter((t) => !dlg?.tabs || dlg.tabs.includes(t.id))
      .map((t, i) => ({ t, i }))
      .sort((a, b) => a.t.order - b.t.order || a.i - b.i)
      .map((x) => x.t);
  }, [ext, row, dlg]);
  const [tab, setTab] = useState(initialTab ?? "prehled");
  const [subs, setSubs] = useState<Record<string, string>>({});
  const top = tops.some((t) => t.id === tab) ? tab : "prehled";
  // Aktivní záložka je v adrese (`?tab=rozpocet&sub=polozky`), takže odkaz vede přímo na ni.
  const syncUrl = (nextTab: string, nextSub?: string) => {
    if (mode === "panel" || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (nextTab === "prehled") url.searchParams.delete("tab");
    else url.searchParams.set("tab", nextTab);
    if (nextSub) url.searchParams.set("sub", nextSub);
    else url.searchParams.delete("sub");
    window.history.replaceState(window.history.state, "", url);
  };
  const selectTab = (next: string) => {
    setTab(next);
    syncUrl(next, subs[next]);
  };
  const selectSub = (group: string, sub: string) => {
    setSubs((s) => ({ ...s, [group]: sub }));
    syncUrl(group, sub);
  };
  const selectTabSub = (next: string, sub?: string) => {
    setTab(next);
    if (sub) setSubs((s) => ({ ...s, [next]: sub }));
    syncUrl(next, sub ?? subs[next]);
  };
  const [dialogAction, setDialogAction] = useState<string | null>(null);
  const { mutate: deleteRecord } = del;
  const href = api.hrefFor(entity.key, id);
  const recordTitle = row ? String(row[entity.titleKey] ?? "") : "";
  const paletteActions = useMemo<PaletteItem[] | null>(() => {
    if (!row) return null;
    return [
      ...(mode !== "page" && href
        ? [
            {
              id: "record-page",
              label: "Otevřít záznam na celé stránce",
              onSelect: () => nav.push(href),
            },
          ]
        : []),
      ...(href
        ? [
            {
              id: "record-link",
              label: "Kopírovat odkaz na záznam",
              onSelect: () => {
                void navigator.clipboard?.writeText(location.origin + href);
                successToast("Odkaz zkopírován.");
              },
            },
          ]
        : []),
      ...(entity.can.delete
        ? [
            {
              id: "record-delete",
              label: "Smazat tento záznam",
              keywords: "odstranit",
              onSelect: () => deleteRecord(),
            },
          ]
        : []),
    ];
  }, [row, href, mode, entity.can.delete, recordTitle, deleteRecord, nav]);
  usePaletteActions(paletteActions);

  if (q.isLoading)
    return (
      <div className="space-y-3 p-4 sm:p-5">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40" />
      </div>
    );
  if (q.error || !row)
    return (
      <div className="p-4 sm:p-5">
        <EmptyState
          title="Záznam nenalezen"
          description="Možná byl smazán, nebo k němu nemáte přístup."
        />
      </div>
    );

  // Přehled s kartami modulů (zakázka): vlevo karty a aktivita, vpravo údaje a tým (Attio).
  const cards = ext.overviewCards(row);
  const activityHidden = ext.hiddenCore.has("activity");
  const richOverview = cards.length > 0 || activityHidden;
  const mainCards = cards.filter((c) => c.column !== "side");
  const sideCards = cards.filter((c) => c.column === "side");
  const renderCard = (c: (typeof cards)[number]) => (
    <div key={c.id} data-testid={`overview-card-${c.id}`}>
      {c.render({ entity, id, row, openTab: selectTabSub })}
    </div>
  );

  const attrs = entity.attributes.filter((a) => a.key !== entity.titleKey);
  const filled = attrs.filter((a) => !isEmpty(row[a.key]));
  const empty = attrs.filter((a) => isEmpty(row[a.key]));
  const shown = showEmpty ? attrs : filled;

  const attributesPanel = (
    <div data-testid="attributes-panel">
      <FieldList
        className={cn(
          mode === "page" &&
            !richOverview &&
            "xl:grid xl:grid-cols-2 xl:gap-x-6 xl:[&>.field-row]:border-b xl:[&>.field-row]:border-t-0 xl:[&>.field-row]:border-line-soft",
        )}
      >
        {shown.map((a) => {
          const TypeIcon = TYPE_ICONS[a.type];
          const canEdit = entity.can.write && !a.readonly;
          const isEditing = editing === a.key;
          const blank = isEmpty(row[a.key]) && a.type !== "checkbox";
          return (
            <FieldRow
              key={a.key}
              label={a.label}
              icon={<TypeIcon />}
              empty={blank}
              data-attr={a.key}
              className="group/attr hover:bg-hover/60"
            >
              <div className="relative flex min-h-7 min-w-0 items-center py-0.5 pointer-coarse:min-h-11">
                {isEditing ? (
                  <div className="relative h-7 w-full">
                    <CellEditor
                      attr={a}
                      value={row[a.key]}
                      labels={labels}
                      lookups={api.lookups}
                      onCommit={(v) => void save(a, v)}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : a.type === "checkbox" ? (
                  <Checkbox
                    aria-label={a.label}
                    checked={!!row[a.key]}
                    disabled={!canEdit}
                    onCheckedChange={(v) => void save(a, !!v)}
                  />
                ) : a.type === "record" && row[a.key] ? (
                  <RecordLink attr={a} row={row} labels={labels} />
                ) : (
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setEditing(a.key)}
                    className={cn(
                      "flex min-h-7 w-full min-w-0 items-center rounded px-1 text-left",
                      canEdit && "hover:bg-bg-active",
                    )}
                    aria-label={`Upravit ${a.label}`}
                  >
                    {isEmpty(row[a.key]) ? (
                      <span className="text-faint">{canEdit ? "Vyplnit…" : "—"}</span>
                    ) : (
                      <CellValue
                        attr={a}
                        value={row[a.key]}
                        labels={labels}
                        wrap
                        className="min-w-0 [overflow-wrap:anywhere]"
                      />
                    )}
                  </button>
                )}
              </div>
            </FieldRow>
          );
        })}
      </FieldList>
      {empty.length > 0 && (
        <button
          type="button"
          onClick={() => setShowEmpty((s) => !s)}
          className="mt-1 px-4 py-1 text-sm text-accent hover:underline"
        >
          {showEmpty ? "Skrýt prázdná pole" : `Zobrazit prázdná pole (${empty.length})`}
        </button>
      )}
    </div>
  );

  const title = String(row[entity.titleKey] ?? "");

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col max-sm:overflow-y-auto",
        // pop-up: sloupce přehledu se řídí šířkou okna, ne obrazovky
        mode === "dialog" && "@container",
      )}
      data-testid="record-view"
    >
      {dlg?.header ? (
        <dlg.header
          entity={entity}
          id={id}
          row={row}
          labels={labels}
          onClose={onClose ?? (() => undefined)}
          openTab={selectTabSub}
          remove={entity.can.delete ? () => deleteRecord() : undefined}
        />
      ) : (
        <header className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-line px-4 py-3 lg:flex-nowrap sm:px-5">
          <div className="min-w-0 basis-full lg:flex-1 lg:basis-0">
            <div className="mb-0.5 text-sm text-muted">{entity.label.one}</div>
            {editing === "__title" && titleAttr ? (
              <div className="relative h-9">
                <CellEditor
                  attr={titleAttr}
                  value={row[entity.titleKey]}
                  labels={labels}
                  lookups={api.lookups}
                  onCommit={(v) => void save(titleAttr, v)}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <h2
                className={cn(
                  "-mx-1 rounded px-1 text-xl font-semibold [overflow-wrap:anywhere]",
                  entity.can.write && "cursor-text hover:bg-hover",
                )}
                onClick={() => entity.can.write && !titleAttr?.readonly && setEditing("__title")}
                title={entity.can.write ? "Kliknutím upravíte název" : undefined}
              >
                {title || "Bez názvu"}
              </h2>
            )}
            {statusAttr && !ext.header && (
              <div className="mt-2 flex items-center gap-2">
                <Combobox
                  options={(statusAttr.stages ?? []).map((s) => ({
                    value: s.id,
                    label: s.name,
                    color: s.color,
                  }))}
                  value={(row[statusAttr.key] as string | null) ?? null}
                  onChange={(v) => v && void save(statusAttr, v)}
                  disabled={!entity.can.write || statusAttr.readonly}
                  trigger={
                    <button
                      type="button"
                      aria-label="Změnit stav"
                      className="rounded-full"
                      disabled={!entity.can.write || statusAttr.readonly}
                    >
                      <CellValue attr={statusAttr} value={row[statusAttr.key]} />
                    </button>
                  }
                />
              </div>
            )}
          </div>
          <div className="scrollbar-thin flex min-w-0 max-w-full shrink-0 items-center gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible [&>*]:shrink-0">
            {ext.actions
              .filter((a) => !a.visible || a.visible(row))
              .map((a) => (
                <Button
                  key={a.id}
                  variant={a.primary ? "primary" : "secondary"}
                  onClick={() => {
                    if (a.dialog) return setDialogAction(a.id);
                    void a.run?.({ entity, id, row, api, push: nav.push, refresh: nav.refresh });
                  }}
                >
                  {a.label}
                </Button>
              ))}
            {mode !== "page" && api.hrefFor(entity.key, id) && (
              <IconButton
                label="Otevřít na celé stránce"
                variant="ghost"
                onClick={() => nav.push(api.hrefFor(entity.key, id)!)}
              >
                <ExternalLink />
              </IconButton>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label="Další akce" variant="ghost">
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onSelect={() => {
                    const h = api.hrefFor(entity.key, id);
                    if (h) void navigator.clipboard?.writeText(location.origin + h);
                    successToast("Odkaz zkopírován.");
                  }}
                >
                  Kopírovat odkaz
                </DropdownMenuItem>
                {entity.can.delete && (
                  <DropdownMenuItem danger onSelect={() => del.mutate()}>
                    <Trash2 /> Smazat
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {onClose && (
              <IconButton label="Zavřít" variant="ghost" onClick={onClose}>
                <X />
              </IconButton>
            )}
          </div>
        </header>
      )}
      {error && (
        <div
          role="alert"
          className="border-b border-line bg-danger-soft px-4 py-2 text-sm text-danger sm:px-5"
        >
          {error}
        </div>
      )}

      {!dlg?.header && ext.header && row && (
        <div className="border-b border-line px-4 py-3 sm:px-5" data-testid="record-header">
          <ext.header entity={entity} id={id} row={row} labels={labels} />
        </div>
      )}
      <Tabs
        value={top}
        onValueChange={(v) => selectTab(v)}
        className={cn("flex min-h-0 flex-1 flex-col max-sm:flex-none")}
      >
        <ScrollTabsList
          className="px-1 sm:px-2"
          wrapperClassName="max-sm:sticky max-sm:top-0 max-sm:z-20 max-sm:bg-bg"
        >
          {tops.map((t) => {
            const icon = t.icon ?? TAB_ICONS[t.id];
            return (
              <TabsTrigger key={t.id} value={t.id}>
                {icon && <Icon name={icon} className="mr-1.5 inline size-3.5" />}
                {t.label}
              </TabsTrigger>
            );
          })}
        </ScrollTabsList>
        <div
          className={cn(
            "scrollbar-thin min-h-0 flex-1 sm:overflow-y-auto",
            // Přehled: karty leží na podkladu o stupeň tmavším než karta, aby se odlišily od okolí
            top === "prehled" && mode !== "panel" && "bg-sunken",
          )}
        >
          <TabsContent
            value="prehled"
            className={cn(
              dlg?.overview ? "h-full p-0 outline-none" : "p-4 outline-none sm:p-5",
              !dlg?.overview &&
                mode === "page" &&
                (richOverview
                  ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_clamp(22rem,32%,27rem)]"
                  : "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_clamp(20rem,30%,24rem)]"),
              !dlg?.overview &&
                mode === "dialog" &&
                (richOverview
                  ? "grid items-start gap-4 @[44rem]:grid-cols-[minmax(0,1fr)_clamp(20rem,36%,24rem)]"
                  : "grid items-start gap-4 @[44rem]:grid-cols-[minmax(0,1fr)_clamp(19rem,36%,22rem)]"),
            )}
          >
            {dlg?.overview ? (
              <dlg.overview
                entity={entity}
                id={id}
                row={row}
                labels={labels}
                onClose={onClose ?? (() => undefined)}
                openTab={selectTabSub}
                remove={entity.can.delete ? () => deleteRecord() : undefined}
              />
            ) : mode !== "panel" && richOverview ? (
              <>
                <div className="min-w-0 space-y-4 lg:order-1" data-testid="overview-main">
                  {overview}
                  {mainCards.map(renderCard)}
                  {activityHidden && (
                    <Card aria-label="Aktivita" data-testid="overview-activity">
                      <CardHeader title="Aktivita" />
                      <CardBody>
                        <ActivityTab entity={entity.key} id={id} />
                      </CardBody>
                    </Card>
                  )}
                </div>
                <aside aria-label="Údaje a tým" className="min-w-0 space-y-4 lg:order-2">
                  <Card aria-label="Údaje">
                    <CardHeader title="Údaje" />
                    <CardBody flush className="pb-1">
                      {attributesPanel}
                    </CardBody>
                  </Card>
                  {sideCards.map(renderCard)}
                </aside>
              </>
            ) : mode !== "panel" ? (
              <>
                <div className="min-w-0 space-y-6">
                  <Card aria-label="Údaje">
                    <CardHeader title="Údaje" />
                    <CardBody flush className="pb-1">
                      {attributesPanel}
                    </CardBody>
                  </Card>
                  {overview}
                </div>
                <aside aria-label="Poslední dění" className="min-w-0">
                  <Card className="p-4">
                    <RecentActivity entity={entity.key} id={id} showEmpty />
                  </Card>
                </aside>
              </>
            ) : (
              <div className="space-y-6">
                {attributesPanel}
                {overview}
                {[...mainCards, ...sideCards].map(renderCard)}
                {activityHidden ? (
                  <ActivityTab entity={entity.key} id={id} />
                ) : (
                  <RecentActivity entity={entity.key} id={id} />
                )}
              </div>
            )}
          </TabsContent>
          <TabsContent value="aktivita" className="p-4 outline-none sm:p-5">
            <ActivityTab entity={entity.key} id={id} />
          </TabsContent>
          <TabsContent value="soubory" className="p-4 outline-none sm:p-5">
            <FilesTab entity={entity.key} id={id} canWrite={entity.can.write} />
          </TabsContent>
          {tops
            .filter((t) => t.tabs.length)
            .map((t) => {
              const activeId = subs[t.id] ?? (t.id === initialTab ? initialSub : undefined);
              const active = t.tabs.find((x) => x.id === activeId) ?? t.tabs[0]!;
              return (
                <TabsContent key={t.id} value={t.id} className="p-4 outline-none sm:p-5">
                  {t.tabs.length > 1 && (
                    <div className="mb-4">
                      <SegmentedControl
                        label={t.label}
                        value={active.id}
                        onChange={(v) => selectSub(t.id, v)}
                        options={t.tabs.map((x) => ({ value: x.id, label: x.label }))}
                      />
                    </div>
                  )}
                  {row && active.render({ entity, id, row, openTab: selectTabSub })}
                </TabsContent>
              );
            })}
        </div>
      </Tabs>
      {ext.actions.map(
        (a) =>
          a.dialog && (
            <Dialog
              key={a.id}
              open={dialogAction === a.id}
              onOpenChange={(o) => !o && setDialogAction(null)}
            >
              <DialogContent title={a.dialog.title}>
                {a.dialog.render({
                  entity,
                  id,
                  row,
                  api,
                  push: nav.push,
                  refresh: nav.refresh,
                  close: () => setDialogAction(null),
                })}
              </DialogContent>
            </Dialog>
          ),
      )}
    </div>
  );
}

/** Ikony záložek modulů podle jejich id (záložka bez ikony se ukáže jen s textem). */
const TAB_ICONS: Record<string, string> = {
  polozky: "clipboard-list",
  platby: "banknote",
  faktury: "receipt",
  harmonogram: "gantt",
  denik: "file-text",
  predani: "clipboard-check",
  vady: "alert-triangle",
  stav: "package",
  zasoby: "package",
  pocitani: "clipboard-list",
  material: "package",
  rozpocet: "banknote",
  ekonomika: "dashboard",
  viceprace: "file-stack",
  tym: "users",
  kniha: "truck",
  tankovani: "fuel",
  servis: "wrench",
  rezervace: "calendar",
  naklady: "banknote",
  stroje: "truck",
  poptavky: "handshake",
};

const isEmpty = (v: unknown) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function RecordLink({
  attr,
  row,
  labels,
}: {
  attr: AttributeDescriptor;
  row: RecordRow;
  labels: Labels;
}) {
  const api = useEntityApi();
  const { Link } = useNav();
  const target = String(row[attr.key]);
  const href = api.hrefFor(attr.record?.entityType ?? "", target);
  const label = labels[attr.key]?.[target]?.label ?? "…";
  const chip = (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-bg px-1.5 py-0.5 hover:border-line-strong">
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      {href && <ArrowUpRight className="size-3.5 shrink-0 text-faint" />}
    </span>
  );
  return href ? (
    <Link href={href} className="min-w-0">
      {chip}
    </Link>
  ) : (
    chip
  );
}

function useActivity(entity: string, id: string) {
  const api = useEntityApi();
  return useQuery<ActivityResult>({
    queryKey: keys.activity(entity, id),
    queryFn: () => api.activity(entity, id),
  });
}

function RecentActivity({
  entity,
  id,
  showEmpty,
}: {
  entity: string;
  id: string;
  showEmpty?: boolean;
}) {
  const a = useActivity(entity, id);
  const recent = (a.data?.timeline ?? []).slice(0, 4);
  if (!recent.length)
    return showEmpty ? (
      <div>
        <h3 className="mb-2 text-sm font-semibold">Poslední dění</h3>
        <p className="text-sm text-muted">Zatím tu nic není. Změny se objeví tady.</p>
      </div>
    ) : null;
  return (
    <section aria-label="Poslední dění" className="space-y-4">
      {recent.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted">Poslední aktivita</h3>
          <Timeline items={recent} />
        </div>
      )}
    </section>
  );
}

const when = (iso: string) => formatInstant(iso);

function renderBody(body: string) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION)) {
    parts.push(body.slice(last, m.index));
    parts.push(
      <span key={m.index} className="rounded bg-accent-soft px-1 text-accent">
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  parts.push(body.slice(last));
  return parts;
}

const show = (v: unknown) =>
  v === null || v === undefined || v === ""
    ? "—"
    : typeof v === "boolean"
      ? v
        ? "ano"
        : "ne"
      : typeof v === "number"
        ? new Intl.NumberFormat("cs-CZ").format(v)
        : String(v);

function Timeline({
  items,
  onDeleteComment,
  meId,
}: {
  items: TimelineItem[];
  onDeleteComment?: (id: string) => void;
  meId?: string;
}) {
  return (
    <ol className="space-y-3">
      {items.map((it) => (
        <li key={`${it.kind}-${it.id}`} className="flex gap-2">
          <Avatar name={it.actor} size={22} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-sm">
              <b className="font-medium">{it.actor}</b>
              <span className="text-faint">{when(it.at)}</span>
              {it.kind === "comment" && meId === it.actorId && onDeleteComment && (
                <button
                  type="button"
                  className="ml-auto text-faint hover:text-danger"
                  onClick={() => onDeleteComment(it.id)}
                  aria-label="Smazat komentář"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
            {it.kind === "comment" ? (
              <p className="mt-0.5 whitespace-pre-wrap rounded-md bg-subtle px-2.5 py-1.5">
                {renderBody(it.body)}
              </p>
            ) : (
              <div className="mt-0.5 text-sm text-muted">
                {it.action === "create"
                  ? "Vytvořil(a) záznam."
                  : it.action === "delete"
                    ? "Smazal(a) záznam."
                    : it.action === "restore"
                      ? "Obnovil(a) záznam."
                      : it.summary && !it.changes.length
                        ? it.summary
                        : null}
                {it.action !== "create" &&
                  it.action !== "delete" &&
                  it.changes.map((c) => (
                    <div key={c.field}>
                      <span className="text-fg">{c.field}</span>:{" "}
                      <span className="text-muted line-through">{show(c.old)}</span> →{" "}
                      <span className="text-fg">{show(c.new)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ActivityTab({ entity, id }: { entity: string; id: string }) {
  const api = useEntityApi();
  const qc = useQueryClient();
  const a = useActivity(entity, id);
  const [body, setBody] = useState("");
  const [mention, setMention] = useState<string | null>(null);
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);

  const add = useMutation({
    mutationFn: (b: string) => api.addComment(entity, id, b),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: keys.activity(entity, id) });
    },
    onError: (e: Error) => errorToast(e.message),
  });
  const del = useMutation({
    mutationFn: (cid: string) => api.deleteComment(cid),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.activity(entity, id) }),
    onError: (e: Error) => errorToast(e.message),
  });

  function onChange(v: string, caret: number) {
    setBody(v);
    const m = /(?:^|\s)@([^\s@]{0,30})$/.exec(v.slice(0, caret));
    if (m) {
      setMention(m[1]!);
      void api.lookups.users(m[1]!).then(setUsers);
    } else setMention(null);
  }
  function insert(u: { value: string; label: string }) {
    const caret = ref.current?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@[^\s@]{0,30}$/, `@[${u.label}](${u.value}) `);
    setBody(before + body.slice(caret));
    setMention(null);
    ref.current?.focus();
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <textarea
          ref={ref}
          value={body}
          aria-label="Nový komentář"
          placeholder="Napište komentář… @ označí kolegu"
          onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim())
              add.mutate(body.trim());
            if (e.key === "Escape") setMention(null);
          }}
          className="min-h-20 w-full resize-y rounded-md border border-line-strong bg-bg px-2.5 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-[var(--accent-line)]"
        />
        {mention !== null && users.length > 0 && (
          <ul
            role="listbox"
            aria-label="Označit uživatele"
            className="absolute left-2 top-full z-20 mt-1 max-h-48 w-64 overflow-auto rounded-md border border-line bg-bg p-1 shadow-float"
          >
            {users.map((u) => (
              <li key={u.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insert(u);
                  }}
                >
                  <Avatar name={u.label} size={18} />
                  {u.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex justify-end">
          <Button
            variant="primary"
            disabled={!body.trim()}
            loading={add.isPending}
            onClick={() => add.mutate(body.trim())}
          >
            Okomentovat
          </Button>
        </div>
      </div>
      {a.isLoading ? (
        <Skeleton className="h-24" />
      ) : a.data?.timeline.length ? (
        <Timeline
          items={a.data.timeline}
          meId={api.me.id}
          onDeleteComment={(cid) => del.mutate(cid)}
        />
      ) : (
        <p className="text-muted">Zatím tu nic není.</p>
      )}
    </div>
  );
}

const bytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${Math.round(n / 1024)} kB`
      : `${(n / 1048576).toFixed(1).replace(".", ",")} MB`;

function FilesTab({ entity, id, canWrite }: { entity: string; id: string; canWrite: boolean }) {
  const api = useEntityApi();
  const qc = useQueryClient();
  const a = useActivity(entity, id);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.activity(entity, id) });
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const f of files) await api.uploadFile(entity, id, f);
    },
    onSuccess: () => void refresh(),
    onError: (e: Error) => errorToast(e.message),
  });
  const detach = useMutation({
    mutationFn: (aid: string) => api.detachFile(aid),
    onSuccess: () => void refresh(),
    onError: (e: Error) => errorToast(e.message),
  });
  return (
    <div className="space-y-4">
      {canWrite && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            upload.mutate([...e.dataTransfer.files]);
          }}
          className={cn(
            "flex items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-6 text-muted",
            drag ? "border-accent bg-accent-soft" : "border-line",
          )}
        >
          <Upload className="size-5" /> Přetáhněte soubory sem, nebo
          <Button loading={upload.isPending} onClick={() => input.current?.click()}>
            Vyberte soubory
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) upload.mutate([...e.target.files]);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {a.isLoading ? (
        <Skeleton className="h-16" />
      ) : !a.data?.files.length ? (
        <p className="text-muted">Žádné soubory.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
          {a.data.files.map((f) => (
            <li
              key={f.id}
              className="group/file relative overflow-hidden rounded-md border border-line"
            >
              {f.hasThumb ? (
                <img
                  src={`/api/files/${f.fileId}?thumb=1`}
                  alt={f.name}
                  loading="lazy"
                  className="h-24 w-full object-cover"
                />
              ) : (
                <div className="flex h-24 items-center justify-center bg-subtle">
                  <Paperclip className="size-6 text-faint" />
                </div>
              )}
              <div className="px-2 py-1.5">
                <div className="truncate text-sm" title={f.name}>
                  {f.name}
                </div>
                <div className="text-xs text-faint">{bytes(f.size)}</div>
              </div>
              <div className="absolute right-1 top-1 hidden gap-1 group-hover/file:flex">
                <a
                  href={`/api/files/${f.fileId}?download=1`}
                  aria-label={`Stáhnout ${f.name}`}
                  className="rounded bg-bg p-1 shadow-float"
                >
                  <Download className="size-3.5" />
                </a>
                {canWrite && (
                  <button
                    type="button"
                    aria-label={`Odebrat ${f.name}`}
                    className="rounded bg-bg p-1 text-danger shadow-float"
                    onClick={() => detach.mutate(f.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
