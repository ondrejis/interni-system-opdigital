"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type {
  AttributeDescriptor,
  FilterGroup,
  Labels,
  QueryParams,
  RecordRow,
  StageDescriptor,
} from "@rebar/core/shared";
import { formatMinor } from "@rebar/core/shared";
import { useQueries } from "@tanstack/react-query";
import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { Button } from "../components/button";
import { Skeleton } from "../components/badges";
import { cn } from "../lib/cn";
import { Icon } from "../lib/icons";
import { CellValue } from "./cell";
import { useEntityApi } from "./context";
import { keys, useEntityGroups } from "./hooks";
import {
  DEFAULT_SHORTCUT_KEYS,
  isNavKey,
  locateCard,
  moveCardFocus,
  shortcutFor,
} from "./kanban-nav";
import {
  useKanbanExtensions,
  type KanbanCardContext,
  type KanbanCardExtension,
  type KanbanColumnContext,
} from "./module-ui";

const COLUMN_PAGE = 30;

/**
 * Cílový sloupec vedle sloupců stavů (Vyhráno, Prohráno…): objeví se při tahu karty a karta se na něj nepřesouvá,
 * jen se zavolá `onDrop` (modul typicky otevře dialog). Karta zůstane tam, kde byla.
 */
export type KanbanDropTarget = {
  id: string;
  label: string;
  /** Barva štítku (`green`, `red`…); bez ní šedá. */
  color?: string | undefined;
  /** Název ikony z `Icon` (`trophy`, `thumbs-down`). */
  icon?: string | undefined;
  /** Doplňující text pod názvem (např. „nebo klávesa W“). */
  hint?: string | undefined;
  /** Které karty cíl přijímá (výchozí všechny). */
  accepts?: ((row: RecordRow) => boolean) | undefined;
  onDrop: (rowId: string, row: RecordRow) => void | Promise<void>;
};

type Props = {
  entity: string;
  titleKey: string;
  statusAttr: AttributeDescriptor;
  attributes: AttributeDescriptor[];
  cardAttributes: string[];
  params: QueryParams;
  canWrite: boolean;
  onOpen: (id: string) => void;
  /** Přesune záznam do jiného stavu; vyhodí výjimku, když to server odmítne. */
  onMove: (id: string, updatedAt: string, stageId: string) => Promise<void>;
  openId?: string | null | undefined;
  /** Cílové sloupce při tahu karty (Vyhráno / Prohráno); viz `KanbanDropTarget`. */
  dropTargets?: readonly KanbanDropTarget[] | undefined;
  /**
   * Zkratky nad zaostřenou kartou (šipky a Enter fungují vždy). Volá se s malým písmenem klávesy z `shortcutKeys`
   * (výchozí `a`, `w`, `l`); bez této funkce se tyto klávesy nechytají.
   */
  onShortcut?: ((key: string, row: RecordRow) => void) | undefined;
  shortcutKeys?: readonly string[] | undefined;
  /** Tlačítko „+“ pod sloupcem: přidání záznamu rovnou do stavu sloupce. */
  onAddCard?: ((stageId: string) => void) | undefined;
};

const DROP_PREFIX = "drop:";

/**
 * Zkratka (A, W, L) otevře dialog bez tlačítka, které by ho otevřelo, takže Radix po zavření nemá kam vrátit fokus
 * a nechá ho na `<body>`; klávesnice by se musela vracet na nástěnku Tabem. Po zavření dialogu proto vrátíme fokus na kartu.
 * Dialog (Radix portál) se přidává do `<body>`; když se do vteřiny žádný neobjeví, pozorování skončí.
 */
function returnFocusAfterDialog(card: HTMLElement) {
  const isOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"]');
  let seen = false;
  const stop = () => {
    observer.disconnect();
    window.clearTimeout(timer);
  };
  const observer = new MutationObserver(() => {
    if (isOpen()) {
      seen = true;
      window.clearTimeout(timer);
      return;
    }
    if (!seen) return;
    stop();
    const active = document.activeElement;
    if (card.isConnected && (!active || active === document.body)) card.focus();
  });
  const timer = window.setTimeout(stop, 1000);
  observer.observe(document.body, { childList: true });
}

/** Cíl pod ukazatelem má přednost (malý cílový sloupec by jinak prohrál s velkým sloupcem stavu). */
const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const targets = hits.filter((h) => String(h.id).startsWith(DROP_PREFIX));
  if (targets.length) return targets;
  return hits.length ? hits : rectIntersection(args);
};

/** Přidá do stromu filtrů podmínku „stav je X“ (původní filtr zůstane celý jako jedna podmínka). */
function withStage(filters: FilterGroup | undefined, attr: string, stage: string): FilterGroup {
  const cond = { attr, op: "is" as const, value: stage };
  return filters && filters.conditions.length
    ? { op: "and", conditions: [filters, cond] }
    : { op: "and", conditions: [cond] };
}

export function Kanban({
  entity,
  titleKey,
  statusAttr,
  attributes,
  cardAttributes,
  params,
  canWrite,
  onOpen,
  onMove,
  openId,
  dropTargets,
  onShortcut,
  shortcutKeys = DEFAULT_SHORTCUT_KEYS,
  onAddCard,
}: Props) {
  const api = useEntityApi();
  const ext = useKanbanExtensions(entity);
  const boardRef = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const stages = statusAttr.stages ?? [];
  const [limits, setLimits] = useState<Record<string, number>>({});
  /** Optimisticky přesunuté karty: id → { stav, řádek }. Platí do doběhnutí požadavku. */
  const [moved, setMoved] = useState<Record<string, { stage: string; row: RecordRow }>>({});
  const [dragging, setDragging] = useState<RecordRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queries = useQueries({
    queries: stages.map((s) => {
      const p: QueryParams = {
        ...params,
        filters: withStage(params.filters, statusAttr.key, s.id),
        limit: limits[s.id] ?? COLUMN_PAGE,
        offset: 0,
      };
      return {
        queryKey: keys.kanban(entity, p),
        queryFn: () => api.query(entity, p),
        placeholderData: (prev: unknown) => prev as never,
      };
    }),
  });
  const groups = useEntityGroups(entity, statusAttr.key, params);
  const sumAttr = attributes.find((a) => a.aggregate);

  const labels = useMemo(() => {
    const out: Labels = {};
    for (const q of queries)
      for (const [k, v] of Object.entries(q.data?.labels ?? {})) out[k] = { ...out[k], ...v };
    return out;
  }, [queries]);

  const cardsOf = (stageId: string, i: number): RecordRow[] => {
    const own = (queries[i]?.data?.rows ?? []).filter(
      (r) => !moved[r.id] || moved[r.id]!.stage === stageId,
    );
    const incoming = Object.values(moved)
      .filter((m) => m.stage === stageId && !own.some((r) => r.id === m.row.id))
      .map((m) => ({ ...m.row, [statusAttr.key]: stageId }));
    return [...incoming, ...own];
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function onDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current?.row as RecordRow) ?? null);
  }

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const row = e.active.data.current?.row as RecordRow | undefined;
    const target = e.over?.id ? String(e.over.id) : null;
    if (row && target?.startsWith(DROP_PREFIX)) {
      // cílový sloupec: karta se nepřesouvá, rozhodne modul (dialog Vyhráno / Prohráno)
      const t = dropTargets?.find((x) => DROP_PREFIX + x.id === target);
      if (t && (t.accepts?.(row) ?? true)) {
        setError(null);
        try {
          await t.onDrop(row.id, row);
        } catch (err) {
          setError((err as Error).message);
        }
      }
      return;
    }
    if (!row || !target || (row[statusAttr.key] === target && !moved[row.id])) return;
    const current = moved[row.id]?.stage ?? (row[statusAttr.key] as string);
    if (current === target) return;
    setError(null);
    setMoved((m) => ({ ...m, [row.id]: { stage: target, row } }));
    try {
      await onMove(row.id, row.updatedAt, target);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMoved((m) => {
        const { [row.id]: _drop, ...rest } = m;
        return rest;
      });
    }
  }

  const columns = stages.map((s, i) => cardsOf(s.id, i));
  const allIds = columns.map((c) => c.map((r) => r.id));
  const firstId = allIds.find((c) => c.length)?.[0] ?? null;
  const tabStop = focusId && allIds.some((c) => c.includes(focusId)) ? focusId : firstId;

  /** Šipky mezi kartami a zkratky nad zaostřenou kartou; funguje jen, když fokus leží přímo na kartě. */
  function onBoardKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const id = target.getAttribute("data-card-button") !== null ? target.dataset.cardId : undefined;
    if (!id) return;
    if (isNavKey(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const from = locateCard(allIds, id);
      if (!from) return;
      e.preventDefault();
      const to = moveCardFocus(
        allIds.map((c) => c.length),
        from,
        e.key,
      );
      const nextId = allIds[to.col]?.[to.idx];
      if (!nextId) return;
      const el = boardRef.current?.querySelector<HTMLElement>(
        `[data-card-button][data-card-id="${CSS.escape(nextId)}"]`,
      );
      el?.focus();
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    if (!onShortcut) return;
    const key = shortcutFor(e, shortcutKeys);
    if (!key) return;
    const row = columns.flat().find((r) => r.id === id);
    if (!row) return;
    e.preventDefault();
    onShortcut(key, row);
    returnFocusAfterDialog(target);
  }

  const visibleTargets = dragging
    ? (dropTargets ?? []).filter((t) => t.accepts?.(dragging) ?? true)
    : [];

  return (
    <DndContext
      id="kanban"
      sensors={sensors}
      collisionDetection={collide}
      onDragStart={onDragStart}
      onDragEnd={(e) => void onDragEnd(e)}
      onDragCancel={() => setDragging(null)}
    >
      {error && (
        <div
          role="alert"
          className="mx-4 mt-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={boardRef}
          className="scrollbar-thin flex min-h-0 flex-1 gap-3 overflow-x-auto p-4"
          data-testid="kanban"
          onKeyDown={onBoardKeyDown}
        >
          {stages.map((s, i) => {
            const g = groups.data?.find((x) => x.value === s.id);
            const cards = columns[i]!;
            const base = g?.count ?? queries[i]?.data?.total ?? 0;
            // během přesunu se počty upraví hned, ať sloupec nehlásí „žádné záznamy“ a zároveň „zobrazit další“
            const entering = Object.values(moved).filter(
              (m) => m.stage === s.id && m.row[statusAttr.key] !== s.id,
            ).length;
            const leaving = Object.values(moved).filter(
              (m) => m.stage !== s.id && m.row[statusAttr.key] === s.id,
            ).length;
            const total = Math.max(0, base + entering - leaving);
            const HeaderExt = ext.columnHeader;
            return (
              <Column
                key={s.id}
                stageId={s.id}
                name={s.name}
                color={s.color}
                onAdd={onAddCard ? () => onAddCard(s.id) : undefined}
                count={total}
                sum={sumAttr ? g?.sums[sumAttr.key] : undefined}
                sumAttr={sumAttr}
                extra={
                  HeaderExt ? (
                    <HeaderExt
                      entity={entity}
                      stage={s}
                      count={total}
                      rows={cards}
                      sums={g?.sums}
                      params={params}
                      labels={labels}
                    />
                  ) : undefined
                }
              >
                {queries[i]?.isLoading ? (
                  <>
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                  </>
                ) : cards.length === 0 ? (
                  <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-faint">
                    Žádné záznamy
                  </div>
                ) : (
                  cards.map((r) => (
                    <Card
                      key={r.id}
                      entity={entity}
                      row={r}
                      titleKey={titleKey}
                      attributes={attributes}
                      cardAttributes={cardAttributes}
                      labels={labels}
                      ext={ext.card}
                      draggable={canWrite && !statusAttr.readonly}
                      onOpen={() => onOpen(r.id)}
                      active={openId === r.id}
                      tabStop={tabStop === r.id}
                      onFocusCard={() => setFocusId(r.id)}
                    />
                  ))
                )}
                {total > cards.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setLimits((l) => ({ ...l, [s.id]: (l[s.id] ?? COLUMN_PAGE) + COLUMN_PAGE }))
                    }
                  >
                    Zobrazit další ({total - cards.length})
                  </Button>
                )}
              </Column>
            );
          })}
        </div>
        {visibleTargets.length > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-wrap justify-center gap-3 px-4"
            data-testid="kanban-drop-targets"
          >
            {visibleTargets.map((t) => (
              <DropZone key={t.id} target={t} />
            ))}
          </div>
        )}
      </div>
      <DragOverlay>
        {dragging ? (
          <CardBody
            entity={entity}
            row={dragging}
            titleKey={titleKey}
            attributes={attributes}
            cardAttributes={cardAttributes}
            labels={labels}
            ext={ext.card}
            overlay
            className="rotate-[1.5deg] cursor-grabbing shadow-float"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Barevná dvojice (pozadí, text) štítku; neznámá barva = šedá. */
function toneOf(color: string | undefined) {
  const c = color && /^[a-z]+$/.test(color) ? color : "gray";
  return {
    background: `var(--label-${c}-bg, var(--label-gray-bg))`,
    color: `var(--label-${c}-fg, var(--label-gray-fg))`,
  };
}

function DropZone({ target }: { target: KanbanDropTarget }) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_PREFIX + target.id });
  return (
    <div
      ref={setNodeRef}
      data-drop-target={target.id}
      aria-label={target.label}
      style={toneOf(target.color)}
      className={cn(
        "pointer-events-auto flex h-14 min-w-44 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-current px-4 text-base font-medium shadow-float transition-[transform,opacity]",
        isOver ? "scale-105 border-solid" : "opacity-90",
      )}
    >
      {target.icon && <Icon name={target.icon} className="size-5" />}
      <span className="flex flex-col leading-tight">
        <span>{target.label}</span>
        {target.hint && <span className="text-xs font-normal opacity-80">{target.hint}</span>}
      </span>
    </div>
  );
}

function Column({
  stageId,
  name,
  color,
  count,
  sum,
  sumAttr,
  extra,
  onAdd,
  children,
}: {
  stageId: string;
  name: string;
  color: string;
  count: number;
  sum: number | undefined;
  sumAttr: AttributeDescriptor | undefined;
  /** Doplňující řádek z modulu pod názvem sloupce. */
  extra?: ReactNode;
  /** Tlačítko „+“ pod kartami. */
  onAdd?: (() => void) | undefined;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  const sumText =
    sumAttr && sum !== undefined && sum !== 0
      ? sumAttr.type === "currency"
        ? formatMinor(sum)
        : new Intl.NumberFormat("cs-CZ").format(sum)
      : null;
  const sumTitle = sumAttr ? `Součet: ${sumAttr.label}` : undefined;
  return (
    <section
      ref={setNodeRef}
      aria-label={name}
      data-stage={stageId}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg bg-subtle transition-colors",
        isOver && "bg-accent-soft ring-2 ring-[var(--accent-line)]",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3">
        <span className="chip min-w-0 whitespace-nowrap" data-color={color}>
          <span className="chip-dot shrink-0" />
          <span className="truncate">{name}</span>
        </span>
        <span className="tabular shrink-0 text-sm text-muted" data-testid="column-count">
          {count}
        </span>
      </header>
      {(sumText || extra) && (
        <div className="tabular px-3 pb-1 pt-1" data-testid="column-summary">
          {sumText && (
            <div className="text-sm font-medium text-fg" title={sumTitle} data-testid="column-sum">
              {sumText}
            </div>
          )}
          {extra && (
            <div
              className="flex flex-wrap items-center gap-x-1.5 text-xs text-faint"
              data-testid="column-extra"
            >
              {extra}
            </div>
          )}
        </div>
      )}
      <div className="scrollbar-thin flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 pt-1.5">
        {children}
      </div>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          data-testid="column-add"
          aria-label={`Přidat do sloupce ${name}`}
          className="mx-2 mb-2 flex h-8 items-center justify-center gap-1.5 rounded-md text-sm text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <Icon name="plus" className="size-4" /> Přidat
        </button>
      )}
    </section>
  );
}

function Card({
  entity,
  row,
  titleKey,
  attributes,
  cardAttributes,
  labels,
  ext,
  draggable,
  onOpen,
  active,
  tabStop,
  onFocusCard,
}: {
  entity: string;
  row: RecordRow;
  titleKey: string;
  attributes: AttributeDescriptor[];
  cardAttributes: string[];
  labels: Labels;
  ext: KanbanCardExtension | undefined;
  draggable: boolean;
  onOpen: () => void;
  active: boolean;
  tabStop: boolean;
  onFocusCard: () => void;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: row.id,
    data: { row },
    disabled: !draggable,
  });
  return (
    <div ref={setNodeRef} {...listeners} className={cn(isDragging && "opacity-40")}>
      <CardBody
        entity={entity}
        row={row}
        titleKey={titleKey}
        attributes={attributes}
        cardAttributes={cardAttributes}
        labels={labels}
        ext={ext}
        onClick={onOpen}
        tabStop={tabStop}
        onFocus={onFocusCard}
        className={active ? "border-accent ring-1 ring-accent" : undefined}
      />
    </div>
  );
}

/**
 * Obal interaktivního prvku na kartě (tlačítko, popover): klik, tah ani klávesa v něm kartu neotevřou ani nepřesunou.
 * Použije ho modul v `footer` karty; sloty `topRight` / `bottomRight` jím jsou obalené samy.
 */
export function KanbanInteractive({
  className,
  children,
}: {
  className?: string | undefined;
  children: ReactNode;
}) {
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <div className={className} onPointerDown={stop} onClick={stop} onKeyDown={stop}>
      {children}
    </div>
  );
}

/** Obal slotu na kartě (absolutně umístěný v rohu). */
function Slot({ className, children }: { className: string; children: ReactNode }) {
  return (
    <KanbanInteractive className={cn("absolute z-10", className)}>{children}</KanbanInteractive>
  );
}

function CardBody({
  entity,
  row,
  titleKey,
  attributes,
  cardAttributes,
  labels,
  ext,
  onClick,
  onFocus,
  tabStop = true,
  overlay = false,
  className,
}: {
  entity: string;
  row: RecordRow;
  titleKey: string;
  attributes: AttributeDescriptor[];
  cardAttributes: string[];
  labels: Labels;
  ext?: KanbanCardExtension | undefined;
  onClick?: (() => void) | undefined;
  onFocus?: (() => void) | undefined;
  /** Kartou, na kterou míří Tab (ostatní se ovládají šipkami). */
  tabStop?: boolean;
  /** Kopie karty pod ukazatelem při tahu: nenese `data-card-id` (na stránce je pořád jen jedna karta záznamu) a není v pořadí Tabu. */
  overlay?: boolean;
  className?: string | undefined;
}) {
  const defaultBody = (
    <div className="space-y-1">
      <div className="line-clamp-2 font-medium leading-snug">
        {String(row[titleKey] ?? "Bez názvu")}
      </div>
      {cardAttributes.map((k) => {
        const a = attributes.find((x) => x.key === k);
        if (!a || row[k] === null || row[k] === undefined || row[k] === "") return null;
        return (
          <div key={k} className="flex items-center gap-1.5 text-sm text-muted">
            <span className="shrink-0 text-faint">{a.label}:</span>
            <CellValue attr={a} value={row[k]} labels={labels} />
          </div>
        );
      })}
    </div>
  );
  const ctx: KanbanCardContext = {
    entity,
    row,
    labels,
    titleKey,
    attributes,
    cardAttributes,
    defaultBody,
  };
  const Body = ext?.body;
  const TopRight = ext?.topRight;
  const BottomRight = ext?.bottomRight;
  const Footer = ext?.footer;
  const rotting = ext?.rotting?.(row) ?? false;
  const gutter = !!(TopRight || BottomRight);
  return (
    <div
      role="button"
      tabIndex={tabStop && !overlay ? 0 : -1}
      {...(overlay ? {} : { "data-card-button": "", "data-card-id": row.id })}
      data-rotting={rotting ? "" : undefined}
      onClick={onClick}
      onFocus={onFocus}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick && e.target === e.currentTarget) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        // klidná karta: jemný rám, žádná barva; „zhnilá“ je čip v patičce, ne rám
        "relative cursor-grab rounded-lg border border-line bg-bg p-3 text-base shadow-xs transition-[border-color,box-shadow]",
        "hover:border-line-strong hover:shadow-sm active:cursor-grabbing",
        gutter && "pr-9 pointer-coarse:pr-14",
        className,
      )}
    >
      {Body ? <Body {...ctx} /> : defaultBody}
      {typeof rotting === "string" && <span className="sr-only">{rotting}</span>}
      {Footer && (
        <div className="mt-2">
          <Footer {...ctx} />
        </div>
      )}
      {TopRight && (
        <Slot className="right-1.5 top-1.5">
          <TopRight {...ctx} />
        </Slot>
      )}
      {BottomRight && (
        <Slot className="bottom-1.5 right-1.5">
          <BottomRight {...ctx} />
        </Slot>
      )}
    </div>
  );
}

export type { KanbanCardContext, KanbanCardExtension, KanbanColumnContext, StageDescriptor };
