"use client";

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AttributeDescriptor, GroupSummary, Labels, RecordRow } from "@rebar/core/shared";
import { formatMinor } from "@rebar/core/shared";
import { getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Group,
  MoreHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/overlay";
import { Skeleton } from "../components/badges";
import { cn } from "../lib/cn";
import { useNav } from "../nav";
import { alignRight, CellValue } from "./cell";
import { CellEditor } from "./editors";
import { GROUPABLE, TYPE_ICONS } from "./type-icons";
import type { Lookups } from "./types";

export const ROW_HEIGHT = 36;
const CHECK_W = 40;

export type SortSpec = { attr: string; dir: "asc" | "desc" }[];

export type DataTableProps = {
  attributes: AttributeDescriptor[];
  /** Klíče viditelných sloupců v pořadí zobrazení. První je „název“ — lepí se vlevo. */
  columns: string[];
  widths: Record<string, number>;
  rows: RecordRow[];
  labels: Labels;
  total: number;
  totals: Record<string, number>;
  sort: SortSpec;
  group: string | null;
  groups: GroupSummary[] | undefined;
  loading: boolean;
  fetchingMore: boolean;
  canWrite: boolean;
  lookups: Lookups;
  selected: ReadonlySet<string>;
  onSelectedChange: (next: Set<string>) => void;
  onSortChange: (next: SortSpec) => void;
  onGroupChange: (attr: string | null) => void;
  onColumnsChange: (next: string[]) => void;
  onWidthsChange: (next: Record<string, number>) => void;
  /** Uloží jednu buňku; vyhodí výjimku, když to server odmítne (tabulka pak ukáže chybu a vrátí hodnotu). */
  onCommit: (rowId: string, attr: string, value: unknown) => Promise<void>;
  onOpen: (id: string) => void;
  /** Adresa záznamu (první sloupec je pak skutečný odkaz); bez ní se záznam otevírá přes `onOpen`. */
  hrefFor?: ((id: string) => string | null) | undefined;
  onEndReached: () => void;
  hasMore: boolean;
  /** Zvýrazněný (otevřený v panelu) záznam. */
  openId?: string | null | undefined;
  emptyState?: React.ReactNode;
};

type Item =
  | {
      kind: "group";
      key: string;
      value: string | boolean | null;
      summary: GroupSummary | undefined;
      collapsed: boolean;
    }
  | { kind: "row"; row: RecordRow; index: number };

type Cell = { row: number; col: number };

export function DataTable(p: DataTableProps) {
  const { Link } = useNav();
  const attrOf = useMemo(() => new Map(p.attributes.map((a) => [a.key, a])), [p.attributes]);
  const cols = useMemo(
    () => p.columns.map((k) => attrOf.get(k)).filter((a): a is AttributeDescriptor => !!a),
    [p.columns, attrOf],
  );
  const baseWidthOf = (a: AttributeDescriptor) => p.widths[a.key] ?? a.width;

  // Sloupce vyplní celou šířku tabulky: přebytek se rozdělí úměrně k nastaveným šířkám.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const read = () => setViewW(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const baseSum = cols.reduce((s, a) => s + baseWidthOf(a), 0);
  const scale = baseSum > 0 && viewW - CHECK_W > baseSum ? (viewW - CHECK_W) / baseSum : 1;
  const widthOf = (a: AttributeDescriptor) => Math.floor(baseWidthOf(a) * scale);

  // TanStack Table drží model sloupců (pořadí, šířky); data a řazení řídí server.
  const columnDefs = useMemo<ColumnDef<RecordRow>[]>(
    () =>
      cols.map((a) => ({
        id: a.key,
        accessorKey: a.key,
        header: a.label,
        size: p.widths[a.key] ?? a.width,
      })),
    [cols, p.widths],
  );
  const table = useReactTable({
    data: p.rows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualFiltering: true,
    getRowId: (r) => r.id,
  });
  const leafCols = table.getVisibleLeafColumns();
  // bez pevné rezervy navíc: šířka se mění plynule, takže se posuvníky nepřepínají sem a tam
  const totalWidth = scale > 1 ? viewW : CHECK_W + baseSum;

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Cell | null>(null);
  const [editing, setEditing] = useState<(Cell & { seed?: string }) | null>(null);
  const [error, setError] = useState<{ row: string; attr: string; message: string } | null>(null);

  // Seskupení: záhlaví skupiny se vloží před první řádek skupiny (řádky už řadí server podle skupiny).
  const items = useMemo<Item[]>(() => {
    if (!p.group) return p.rows.map((row, index) => ({ kind: "row", row, index }));
    const out: Item[] = [];
    let last: string | null | undefined = undefined;
    p.rows.forEach((row, index) => {
      const raw = row[p.group!];
      const key = raw === null || raw === undefined ? "∅" : String(raw);
      if (key !== last) {
        last = key;
        out.push({
          kind: "group",
          key,
          value: (raw ?? null) as string | boolean | null,
          summary: p.groups?.find((g) => (g.value === null ? "∅" : String(g.value)) === key),
          collapsed: collapsed.has(key),
        });
      }
      if (!collapsed.has(key)) out.push({ kind: "row", row, index });
    });
    return out;
  }, [p.rows, p.group, p.groups, collapsed]);

  const virt = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const vItems = virt.getVirtualItems();

  useEffect(() => {
    const last = vItems[vItems.length - 1];
    if (last && last.index >= items.length - 8 && p.hasMore && !p.fetchingMore) p.onEndReached();
  }, [vItems, items.length, p]);

  const itemIndexOfRow = useCallback(
    (rowIndex: number) => items.findIndex((i) => i.kind === "row" && i.index === rowIndex),
    [items],
  );

  const move = useCallback(
    (cell: Cell, dRow: number, dCol: number): Cell => {
      const row = Math.min(Math.max(cell.row + dRow, 0), p.rows.length - 1);
      const col = Math.min(Math.max(cell.col + dCol, 0), cols.length - 1);
      return { row, col };
    },
    [p.rows.length, cols.length],
  );

  const goto = useCallback(
    (cell: Cell) => {
      setActive(cell);
      const i = itemIndexOfRow(cell.row);
      if (i >= 0) virt.scrollToIndex(i, { align: "auto" });
    },
    [itemIndexOfRow, virt],
  );

  const editable = (a: AttributeDescriptor | undefined) =>
    !!a && p.canWrite && !a.readonly && a.type !== "checkbox";

  const toggleCheckbox = useCallback(
    async (cell: Cell) => {
      const row = p.rows[cell.row];
      const a = cols[cell.col];
      if (!row || !a) return;
      await p
        .onCommit(row.id, a.key, !row[a.key])
        .catch((e: Error) => setError({ row: row.id, attr: a.key, message: e.message }));
    },
    [p, cols],
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (editing) return;
    if (!active) {
      if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key) && p.rows.length) {
        e.preventDefault();
        goto({ row: 0, col: 0 });
      }
      return;
    }
    const a = cols[active.col];
    const row = p.rows[active.row];
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return goto(move(active, 1, 0));
      case "ArrowUp":
        e.preventDefault();
        return goto(move(active, -1, 0));
      case "ArrowRight":
        e.preventDefault();
        return goto(move(active, 0, 1));
      case "ArrowLeft":
        e.preventDefault();
        return goto(move(active, 0, -1));
      case "Tab":
        e.preventDefault();
        return goto(move(active, 0, e.shiftKey ? -1 : 1));
      case "Home":
        e.preventDefault();
        return goto({ row: active.row, col: 0 });
      case "End":
        e.preventDefault();
        return goto({ row: active.row, col: cols.length - 1 });
      case "Escape":
        return setActive(null);
      case " ":
        if (row) {
          e.preventDefault();
          const next = new Set(p.selected);
          if (next.has(row.id)) next.delete(row.id);
          else next.add(row.id);
          p.onSelectedChange(next);
        }
        return;
      case "Enter":
      case "F2":
        e.preventDefault();
        if (e.shiftKey && row) return p.onOpen(row.id);
        if (a?.type === "checkbox" && editable({ ...a, type: "text" })) void toggleCheckbox(active);
        else if (editable(a)) setEditing(active);
        else if (row) p.onOpen(row.id);
        return;
      default:
        // Psaní do buňky: první znak přepíše hodnotu (u textu a čísel).
        if (
          e.key.length === 1 &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          editable(a) &&
          ["text", "number", "currency", "email", "url", "phone"].includes(a!.type)
        ) {
          e.preventDefault();
          setEditing({ ...active, seed: e.key });
        }
    }
  }

  async function commit(cell: Cell, value: unknown, nav?: "next" | "prev" | "down") {
    const row = p.rows[cell.row];
    const a = cols[cell.col];
    setEditing(null);
    if (nav === "down") goto(move(cell, 1, 0));
    else if (nav === "next" || nav === "prev") {
      const target = move(cell, 0, nav === "next" ? 1 : -1);
      goto(target);
      if (editable(cols[target.col]) && target.col !== cell.col)
        setTimeout(() => setEditing(target), 0);
    }
    if (!row || !a) return;
    if (JSON.stringify(row[a.key] ?? null) === JSON.stringify(value ?? null)) return;
    setError(null);
    try {
      await p.onCommit(row.id, a.key, value);
    } catch (e) {
      setError({ row: row.id, attr: a.key, message: (e as Error).message });
    }
    scrollRef.current?.focus({ preventScroll: true });
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = p.columns.indexOf(String(e.active.id));
    const to = p.columns.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) p.onColumnsChange(arrayMove(p.columns, from, to));
  }

  function toggleSort(key: string, additive: boolean) {
    const cur = p.sort.find((s) => s.attr === key);
    const rest = additive ? p.sort.filter((s) => s.attr !== key) : [];
    if (!cur) p.onSortChange([...rest, { attr: key, dir: "asc" }]);
    else if (cur.dir === "asc") p.onSortChange([...rest, { attr: key, dir: "desc" }]);
    else p.onSortChange(rest);
  }

  const allSelected = p.rows.length > 0 && p.rows.every((r) => p.selected.has(r.id));
  const someSelected = p.rows.some((r) => p.selected.has(r.id));
  const aggregates = cols.filter((a) => a.aggregate);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="data-table">
      <div
        ref={scrollRef}
        tabIndex={0}
        role="grid"
        aria-rowcount={p.total}
        aria-colcount={cols.length}
        aria-label="Tabulka záznamů"
        onKeyDown={onKeyDown}
        className="scrollbar-thin relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-line)]"
      >
        <div style={{ width: totalWidth, minWidth: "100%" }}>
          {/* záhlaví */}
          <div
            role="row"
            className="sticky top-0 z-20 flex h-9 border-b border-line bg-subtle text-sm text-muted"
            style={{ width: totalWidth }}
          >
            <div
              role="columnheader"
              className="sticky left-0 z-30 flex shrink-0 items-center justify-center border-r border-line bg-subtle"
              style={{ width: CHECK_W }}
            >
              <Checkbox
                aria-label="Vybrat vše"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(v) =>
                  p.onSelectedChange(v ? new Set(p.rows.map((r) => r.id)) : new Set())
                }
              />
            </div>
            <DndContext
              id="table-columns"
              // skrytý živý popisek dnd-kitu (`role="status"`) nesmí ležet uvnitř řádku záhlaví tabulky
              accessibility={{
                container: typeof document === "undefined" ? undefined : document.body,
              }}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={p.columns} strategy={horizontalListSortingStrategy}>
                {leafCols.map((c, i) => {
                  const a = attrOf.get(c.id)!;
                  return (
                    <HeaderCell
                      key={a.key}
                      attr={a}
                      first={i === 0}
                      width={widthOf(a)}
                      sort={p.sort}
                      groupKey={p.group}
                      onSort={toggleSort}
                      onSortDir={(dir) => p.onSortChange(dir ? [{ attr: a.key, dir }] : [])}
                      onGroup={() => p.onGroupChange(p.group === a.key ? null : a.key)}
                      onHide={() => p.onColumnsChange(p.columns.filter((k) => k !== a.key))}
                      onResize={(w) => p.onWidthsChange({ ...p.widths, [a.key]: w })}
                      canHide={cols.length > 1}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
            <div className="flex-1" />
          </div>

          {/* řádky */}
          {p.loading ? (
            <div className="space-y-px p-2">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : p.rows.length === 0 ? (
            <div className="sticky left-0 w-full">{p.emptyState}</div>
          ) : (
            <div style={{ height: virt.getTotalSize(), position: "relative", width: totalWidth }}>
              {vItems.map((v) => {
                const item = items[v.index]!;
                const style = {
                  position: "absolute" as const,
                  top: 0,
                  left: 0,
                  width: totalWidth,
                  height: ROW_HEIGHT,
                  transform: `translateY(${v.start}px)`,
                };
                if (item.kind === "group") {
                  return (
                    <GroupHeader
                      key={`g${item.key}`}
                      style={style}
                      item={item}
                      attr={attrOf.get(p.group!)}
                      labels={p.labels}
                      aggregates={aggregates}
                      widthOf={widthOf}
                      onToggle={() =>
                        setCollapsed((s) => {
                          const n = new Set(s);
                          if (n.has(item.key)) n.delete(item.key);
                          else n.add(item.key);
                          return n;
                        })
                      }
                    />
                  );
                }
                const row = item.row;
                const isSel = p.selected.has(row.id);
                return (
                  <div
                    key={row.id}
                    role="row"
                    aria-selected={isSel}
                    data-row-id={row.id}
                    style={style}
                    className={cn(
                      "group/row flex border-b border-line-soft bg-bg text-base hover:bg-hover",
                      isSel && "bg-accent-soft hover:bg-accent-soft",
                      p.openId === row.id && "bg-accent-soft",
                    )}
                  >
                    <div
                      role="gridcell"
                      className={cn(
                        "sticky left-0 z-10 flex shrink-0 items-center justify-center border-r border-line-soft",
                        isSel || p.openId === row.id
                          ? "bg-accent-soft"
                          : "bg-bg group-hover/row:bg-hover",
                      )}
                      style={{ width: CHECK_W }}
                    >
                      <Checkbox
                        aria-label={`Vybrat řádek`}
                        checked={isSel}
                        onCheckedChange={() => {
                          const n = new Set(p.selected);
                          if (n.has(row.id)) n.delete(row.id);
                          else n.add(row.id);
                          p.onSelectedChange(n);
                        }}
                      />
                    </div>
                    {cols.map((a, ci) => {
                      const isActive = active?.row === item.index && active.col === ci;
                      const isEditing = editing?.row === item.index && editing.col === ci;
                      const err =
                        error && error.row === row.id && error.attr === a.key
                          ? error.message
                          : null;
                      return (
                        <div
                          key={a.key}
                          role="gridcell"
                          data-attr={a.key}
                          aria-selected={isActive}
                          style={{ width: widthOf(a) }}
                          className={cn(
                            "relative flex shrink-0 items-center overflow-hidden border-r border-line-soft px-2",
                            ci === 0 && "sticky left-[40px] z-10 font-medium",
                            ci === 0 &&
                              (isSel || p.openId === row.id
                                ? "bg-accent-soft"
                                : "bg-bg group-hover/row:bg-hover"),
                            alignRight(a) && "justify-end",
                            isActive && "outline-2 -outline-offset-2 outline-accent",
                            err && "bg-danger-soft",
                          )}
                          title={err ?? undefined}
                          onClick={() => {
                            setActive({ row: item.index, col: ci });
                            scrollRef.current?.focus({ preventScroll: true });
                          }}
                          onDoubleClick={() => {
                            if (editable(a)) setEditing({ row: item.index, col: ci });
                            else if (ci === 0) p.onOpen(row.id);
                          }}
                        >
                          {isEditing ? (
                            <CellEditor
                              attr={a}
                              value={row[a.key]}
                              labels={p.labels}
                              lookups={p.lookups}
                              {...(editing?.seed ? { seed: editing.seed } : {})}
                              onCommit={(val, nav) =>
                                void commit({ row: item.index, col: ci }, val, nav)
                              }
                              onCancel={() => {
                                setEditing(null);
                                scrollRef.current?.focus({ preventScroll: true });
                              }}
                            />
                          ) : a.type === "checkbox" ? (
                            <Checkbox
                              aria-label={a.label}
                              disabled={!editable({ ...a, type: "text" })}
                              checked={!!row[a.key]}
                              onCheckedChange={(v) =>
                                void commit({ row: item.index, col: ci }, !!v)
                              }
                            />
                          ) : (
                            <>
                              {ci === 0 ? (
                                // skutečný odkaz: Cmd/Ctrl+klik a prostřední tlačítko otevřou záznam v nové záložce
                                <Link
                                  href={p.hrefFor?.(row.id) ?? "#"}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    if (!p.hrefFor?.(row.id)) {
                                      ev.preventDefault();
                                      p.onOpen(row.id);
                                    }
                                  }}
                                  className="flex min-w-0 max-w-full items-center truncate text-left font-medium hover:text-accent hover:underline"
                                >
                                  <CellValue attr={a} value={row[a.key]} labels={p.labels} />
                                </Link>
                              ) : (
                                <CellValue attr={a} value={row[a.key]} labels={p.labels} />
                              )}
                              {ci === 0 && (
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    p.onOpen(row.id);
                                  }}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded border border-line-strong bg-bg px-1.5 py-0.5 text-xs font-medium text-muted opacity-0 hover:text-fg focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
                                >
                                  Otevřít
                                </button>
                              )}
                            </>
                          )}
                          {err && (
                            <div
                              role="alert"
                              className="absolute left-0 top-full z-30 mt-0.5 max-w-80 rounded-md bg-danger px-2 py-1 text-xs text-white shadow-float"
                            >
                              {err}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          {p.fetchingMore && <div className="px-4 py-2 text-sm text-muted">Načítám další…</div>}
        </div>
      </div>

      {/* patička: počet a součty */}
      <div
        className="flex h-9 shrink-0 items-center border-t border-line bg-subtle text-sm text-muted"
        data-testid="table-footer"
      >
        <div
          className="shrink-0 px-3"
          style={{ width: Math.max(CHECK_W + (cols[0] ? widthOf(cols[0]) : 0), 160) }}
        >
          {p.selected.size > 0
            ? `Vybráno ${p.selected.size} z ${p.total}`
            : `${p.total} ${plural(p.total)}`}
        </div>
        <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-4 overflow-hidden px-2">
          {aggregates.map((a) => (
            <span key={a.key} className="whitespace-nowrap tabular">
              Σ {a.label}:{" "}
              <b className="font-semibold text-fg">
                {a.type === "currency"
                  ? formatMinor(p.totals[a.key] ?? 0)
                  : new Intl.NumberFormat("cs-CZ").format(p.totals[a.key] ?? 0)}
              </b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const plural = (n: number) => (n === 1 ? "záznam" : n >= 2 && n <= 4 ? "záznamy" : "záznamů");

function HeaderCell({
  attr,
  first,
  width,
  sort,
  groupKey,
  onSort,
  onSortDir,
  onGroup,
  onHide,
  onResize,
  canHide,
}: {
  attr: AttributeDescriptor;
  first: boolean;
  width: number;
  sort: SortSpec;
  groupKey: string | null;
  onSort: (key: string, additive: boolean) => void;
  onSortDir: (dir: "asc" | "desc" | null) => void;
  onGroup: () => void;
  onHide: () => void;
  onResize: (w: number) => void;
  canHide: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: attr.key,
  });
  const Icon = TYPE_ICONS[attr.type];
  const idx = sort.findIndex((s) => s.attr === attr.key);
  const dir = idx >= 0 ? sort[idx]!.dir : null;

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) =>
      onResize(Math.min(800, Math.max(70, startW + ev.clientX - startX)));
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={setNodeRef}
      role="columnheader"
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
      data-attr={attr.key}
      style={{
        width,
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className={cn(
        "group/head relative flex shrink-0 items-center border-r border-line bg-subtle",
        first && "sticky left-[40px] z-20",
        isDragging && "z-40",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={!attr.sortable}
        onClick={(e) => attr.sortable && onSort(attr.key, e.shiftKey)}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-left font-medium hover:text-fg"
        title={
          attr.sortable
            ? "Kliknutím seřadíte, Shift přidá další řazení. Tažením přesunete sloupec."
            : "Tažením přesunete sloupec."
        }
      >
        <Icon className="size-3.5 shrink-0 text-faint" />
        <span className="truncate">{attr.label}</span>
        {dir && (
          <span className="flex shrink-0 items-center text-accent">
            {dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
            {sort.length > 1 && <span className="text-xs">{idx + 1}</span>}
          </span>
        )}
        {groupKey === attr.key && <Group className="size-3.5 shrink-0 text-accent" />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Nabídka sloupce ${attr.label}`}
            className="mr-1 hidden size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-hover hover:text-fg group-hover/head:flex data-[state=open]:flex"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {attr.sortable && (
            <>
              <DropdownMenuItem onSelect={() => onSortDir("asc")}>
                <ArrowUp /> Seřadit vzestupně
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSortDir("desc")}>
                <ArrowDown /> Seřadit sestupně
              </DropdownMenuItem>
              {dir && (
                <DropdownMenuItem onSelect={() => onSortDir(null)}>Zrušit řazení</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          {GROUPABLE.includes(attr.type) && (
            <DropdownMenuItem onSelect={onGroup}>
              <Group /> {groupKey === attr.key ? "Zrušit seskupení" : "Seskupit podle sloupce"}
            </DropdownMenuItem>
          )}
          {canHide && (
            <DropdownMenuItem onSelect={onHide}>
              <EyeOff /> Skrýt sloupec
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Změnit šířku sloupce ${attr.label}`}
        onPointerDown={startResize}
        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-accent/40 active:bg-accent"
      />
    </div>
  );
}

function GroupHeader({
  style,
  item,
  attr,
  labels,
  aggregates,
  widthOf,
  onToggle,
}: {
  style: React.CSSProperties;
  item: Extract<Item, { kind: "group" }>;
  attr: AttributeDescriptor | undefined;
  labels: Labels;
  aggregates: AttributeDescriptor[];
  widthOf: (a: AttributeDescriptor) => number;
  onToggle: () => void;
}) {
  const value = item.value;
  return (
    <div
      style={style}
      role="row"
      className="flex items-center border-b border-line bg-subtle text-sm"
      data-testid="group-header"
    >
      <div role="gridcell" className="sticky left-0 h-full">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-full items-center gap-2 px-3 font-medium"
          aria-expanded={!item.collapsed}
        >
          {item.collapsed ? (
            <ChevronRight className="size-4 text-faint" />
          ) : (
            <ChevronDown className="size-4 text-faint" />
          )}
          {attr ? (
            value === null ? (
              <span className="text-muted">Nevyplněno</span>
            ) : attr.type === "checkbox" ? (
              <span>{value ? "Ano" : "Ne"}</span>
            ) : (
              <CellValue attr={attr} value={value} labels={labels} />
            )
          ) : null}
          <span className="tabular text-muted">{item.summary?.count ?? ""}</span>
        </button>
      </div>
      <div role="gridcell" className="ml-auto flex gap-4 pr-4 text-muted">
        {aggregates.map((a) => (
          <span
            key={a.key}
            className="whitespace-nowrap tabular"
            style={{ minWidth: Math.min(widthOf(a), 160) }}
          >
            Σ {a.label}:{" "}
            <b className="text-fg">
              {a.type === "currency"
                ? formatMinor(item.summary?.sums[a.key] ?? 0)
                : new Intl.NumberFormat("cs-CZ").format(item.summary?.sums[a.key] ?? 0)}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}
