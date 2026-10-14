"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  WIDGET_WIDTHS,
  MAX_WIDGET_HEIGHT,
  type DashboardFilters,
  type DashboardWidget,
} from "@rebar/core/dashboards-shared";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../lib/cn";
import { WidgetCard } from "./widget-card";

const ROW = 96;
const GAP = 12;
type Layout = "mobile" | "tablet" | "desktop";

/** Rozložení podle šířky okna: telefon jeden sloupec, tablet 6 sloupců, počítač 12. */
export function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>("desktop");
  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const t = window.matchMedia("(max-width: 1023px)");
    const read = () => setLayout(m.matches ? "mobile" : t.matches ? "tablet" : "desktop");
    read();
    m.addEventListener("change", read);
    t.addEventListener("change", read);
    return () => {
      m.removeEventListener("change", read);
      t.removeEventListener("change", read);
    };
  }, []);
  return layout;
}

const spanOf = (w: DashboardWidget, layout: Layout) =>
  layout === "desktop"
    ? w.w
    : layout === "tablet"
      ? Math.min(6, Math.max(3, Math.ceil(w.w / 2)))
      : 1;

const nearestWidth = (cols: number) =>
  WIDGET_WIDTHS.reduce(
    (best, x) => (Math.abs(x - cols) < Math.abs(best - cols) ? x : best),
    12 as number,
  );

type Props = {
  widgets: DashboardWidget[];
  filters: DashboardFilters;
  refreshKey: number;
  autoRefreshMs?: number | undefined;
  editing?: boolean;
  onChange?: ((next: DashboardWidget[]) => void) | undefined;
  onEdit?: ((id: string) => void) | undefined;
  hideMenu?: boolean | undefined;
};

/**
 * Mřížka nástěnky (12 sloupců na počítači, na telefonu jeden). V režimu úprav se widgety přetahují (myš, dotyk i klávesnice)
 * a mění se jejich velikost; jinak se jen zobrazují a každý se načítá samostatně.
 */
export function DashboardGrid({
  widgets,
  filters,
  refreshKey,
  autoRefreshMs,
  editing,
  onChange,
  onEdit,
  hideMenu,
}: Props) {
  const layout = useLayout();
  const gridRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = widgets.findIndex((w) => w.id === e.active.id);
    const to = widgets.findIndex((w) => w.id === e.over!.id);
    if (from < 0 || to < 0) return;
    onChange?.(arrayMove(widgets, from, to));
  }

  const patch = (id: string, p: Partial<DashboardWidget>) =>
    onChange?.(widgets.map((w) => (w.id === id ? { ...w, ...p } : w)));

  const grid = (
    <div
      ref={gridRef}
      data-testid="dashboard-grid"
      className="grid gap-3"
      style={{
        gridTemplateColumns:
          layout === "desktop"
            ? "repeat(12, minmax(0, 1fr))"
            : layout === "tablet"
              ? "repeat(6, minmax(0, 1fr))"
              : "minmax(0, 1fr)",
        gridAutoRows: layout === "mobile" ? "auto" : `${ROW}px`,
      }}
    >
      {widgets.map((w) => (
        <GridItem
          key={w.id}
          widget={w}
          layout={layout}
          filters={filters}
          refreshKey={refreshKey}
          autoRefreshMs={autoRefreshMs}
          editing={!!editing}
          hideMenu={hideMenu}
          gridRef={gridRef}
          onEdit={() => onEdit?.(w.id)}
          onRemove={() => onChange?.(widgets.filter((x) => x.id !== w.id))}
          onResize={(size) => patch(w.id, size)}
        />
      ))}
    </div>
  );
  if (!editing) return grid;
  return (
    <DndContext
      id="dashboard-grid"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
    </DndContext>
  );
}

function GridItem({
  widget,
  layout,
  filters,
  refreshKey,
  autoRefreshMs,
  editing,
  hideMenu,
  gridRef,
  onEdit,
  onRemove,
  onResize,
}: {
  widget: DashboardWidget;
  layout: Layout;
  filters: DashboardFilters;
  refreshKey: number;
  autoRefreshMs: number | undefined;
  editing: boolean;
  hideMenu: boolean | undefined;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onEdit: () => void;
  onRemove: () => void;
  onResize: (size: { w: number; h: number }) => void;
}) {
  const sortable = useSortable({ id: widget.id, disabled: !editing });
  const style: React.CSSProperties = {
    gridColumn: `span ${spanOf(widget, layout)} / span ${spanOf(widget, layout)}`,
    ...(layout === "mobile"
      ? { minHeight: widget.h * ROW + (widget.h - 1) * GAP }
      : { gridRow: `span ${widget.h} / span ${widget.h}` }),
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    zIndex: sortable.isDragging ? 20 : undefined,
    opacity: sortable.isDragging ? 0.85 : undefined,
  };

  return (
    <WidgetCard
      widget={widget}
      filters={filters}
      refreshKey={refreshKey}
      autoRefreshMs={autoRefreshMs}
      editing={editing}
      hideMenu={hideMenu}
      onEdit={onEdit}
      onRemove={onRemove}
      nodeRef={sortable.setNodeRef}
      style={style}
      dragProps={editing ? { ...sortable.attributes, ...sortable.listeners } : undefined}
      resizeHandle={
        editing ? (
          <ResizeHandle widget={widget} layout={layout} gridRef={gridRef} onResize={onResize} />
        ) : null
      }
    />
  );
}

/** Rukojeť pro změnu velikosti: tažením myší / prstem (po sloupcích a řádcích mřížky) nebo šipkami na klávesnici. */
function ResizeHandle({
  widget,
  layout,
  gridRef,
  onResize,
}: {
  widget: DashboardWidget;
  layout: Layout;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onResize: (size: { w: number; h: number }) => void;
}) {
  const start = useRef<{ x: number; y: number; w: number; h: number; colPx: number } | null>(null);

  function down(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    const width = gridRef.current?.clientWidth ?? 1200;
    const cols = layout === "desktop" ? 12 : 6;
    start.current = {
      x: e.clientX,
      y: e.clientY,
      w: widget.w,
      h: widget.h,
      colPx: (width + GAP) / cols,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLButtonElement>) {
    const s = start.current;
    if (!s) return;
    const dCols = Math.round((e.clientX - s.x) / s.colPx) * (layout === "desktop" ? 1 : 2);
    const dRows = Math.round((e.clientY - s.y) / (ROW + GAP));
    const w = nearestWidth(s.w + dCols);
    const h = Math.min(MAX_WIDGET_HEIGHT, Math.max(1, s.h + dRows));
    if (w !== widget.w || h !== widget.h) onResize({ w, h });
  }
  function key(e: KeyboardEvent<HTMLButtonElement>) {
    const idx = WIDGET_WIDTHS.indexOf(widget.w as (typeof WIDGET_WIDTHS)[number]);
    if (e.key === "ArrowRight" && idx < WIDGET_WIDTHS.length - 1)
      onResize({ w: WIDGET_WIDTHS[idx + 1]!, h: widget.h });
    else if (e.key === "ArrowLeft" && idx > 0)
      onResize({ w: WIDGET_WIDTHS[idx - 1]!, h: widget.h });
    else if (e.key === "ArrowDown" && widget.h < MAX_WIDGET_HEIGHT)
      onResize({ w: widget.w, h: widget.h + 1 });
    else if (e.key === "ArrowUp" && widget.h > 1) onResize({ w: widget.w, h: widget.h - 1 });
    else return;
    e.preventDefault();
  }
  return (
    <button
      type="button"
      data-testid="widget-resize"
      aria-label={`Změnit velikost widgetu „${widget.title}“ (šipky; nyní ${widget.w} z 12 sloupců, ${widget.h} řádků)`}
      className={cn(
        "absolute bottom-0.5 right-0.5 size-5 touch-none cursor-nwse-resize rounded-sm text-faint hover:text-fg",
        layout === "mobile" && "hidden",
      )}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onKeyDown={key}
    >
      <svg viewBox="0 0 12 12" className="size-full" aria-hidden>
        <path
          d="M11 3v8H3M11 7v4H7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
