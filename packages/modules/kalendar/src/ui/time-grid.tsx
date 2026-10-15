"use client";

import { addDaysIso, todayIso } from "@rebar/core/time";
import { cn, useNav } from "@rebar/ui";
import { Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  HOUR_PX,
  WORK_FROM_MIN,
  WORK_TO_MIN,
  clamp,
  clock,
  cssColor,
  dateOf,
  dayName,
  isStripItem,
  isWeekday,
  layoutDay,
  minFromPx,
  minutesOf,
  moveInstants,
  pxFromMin,
  resizeInstants,
  segmentFor,
  selectionRange,
  snap,
  timeOf,
  touches,
  type Instants,
  type Item,
  type Placed,
} from "./lib";

/*
  Denní a týdenní časová mřížka (KAL-03): pracovní doba 8–18 zvýrazněná, pruh nahoře pro celodenní položky a úkoly
  bez času, kolize vedle sebe, tažení v prázdném místě vytvoří schůzku (KAL-05), tažení bloku ji přesune, tažení
  dolního okraje změní délku (KAL-06). Klávesnice: Enter otevře, Alt+šipky přesune o 15 minut / den, Alt+Shift+šipky
  změní délku.
*/

/** Žádost o novou schůzku vzniklá tažením v prázdném místě mřížky. */
export type CreateRequest = { date: string; startMin: number; endMin: number };

type Props = {
  days: string[];
  items: Item[];
  canWrite: boolean;
  /** Zařízení bez myši (dotyk): bez tažení, událost se jen otevře. */
  coarse: boolean;
  selectedId: string | null;
  onOpen: (it: Item) => void;
  onCreate: (req: CreateRequest) => void;
  onMove: (it: Item, to: Instants) => void;
  onDayClick?: ((day: string) => void) | undefined;
};

type Drag =
  | { kind: "create"; dayIdx: number; anchor: number; cur: number }
  | {
      kind: "move";
      item: Item;
      segDay: string;
      fromIdx: number;
      pointerStart: number;
      startMin: number;
      moved: boolean;
      date: string;
      newStart: number;
    }
  | { kind: "resize"; item: Item; segDay: string; newEnd: number };

const GUTTER = "3.25rem";
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function useNowMin() {
  const [now, setNow] = useState<{ date: string; min: number } | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Prague",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(d);
      setNow({ date: todayIso(), min: Number(p.slice(0, 2)) * 60 + Number(p.slice(3, 5)) });
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Styl bloku podle barvy (levý proužek + jemné pozadí). */
const blockStyle = (color: string, busy: boolean): React.CSSProperties => {
  const c = cssColor(color);
  return busy
    ? {
        background:
          "repeating-linear-gradient(135deg, var(--bg-subtle) 0 6px, var(--bg-sunken) 6px 12px)",
        borderLeft: "3px solid var(--line-strong)",
      }
    : {
        background: `color-mix(in oklab, ${c} 16%, var(--bg))`,
        borderLeft: `3px solid ${c}`,
      };
};

function StripItem({
  it,
  onOpen,
  selected,
}: {
  it: Item;
  onOpen: (it: Item) => void;
  selected: boolean;
}) {
  const { Link } = useNav();
  if (it.kind === "holiday")
    return (
      <div className="truncate px-1 text-xs text-danger" title={it.title}>
        {it.title}
      </div>
    );
  const cls = cn(
    "block w-full truncate rounded px-1.5 py-0.5 text-left text-xs",
    selected && "ring-2 ring-accent",
  );
  const style = blockStyle(it.color, it.kind === "busy");
  if (it.kind === "busy")
    return (
      <div
        className={cn(cls, "text-muted")}
        style={style}
        data-testid="calendar-item"
        data-kind="busy"
      >
        {it.title}
      </div>
    );
  if (it.eventId)
    return (
      <button
        type="button"
        className={cls}
        style={style}
        onClick={() => onOpen(it)}
        data-testid="calendar-item"
        data-event-id={it.eventId}
      >
        {it.title}
      </button>
    );
  return it.href ? (
    <Link
      href={it.href}
      className={cls}
      style={style}
      data-testid="calendar-item"
      data-layer={it.layer}
    >
      {it.title}
    </Link>
  ) : (
    <div className={cls} style={style} data-testid="calendar-item" data-layer={it.layer}>
      {it.title}
    </div>
  );
}

export function TimeGrid({
  days,
  items,
  canWrite,
  coarse,
  selectedId,
  onOpen,
  onCreate,
  onMove,
  onDayClick,
}: Props) {
  const n = days.length;
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const now = useNowMin();
  const today = todayIso();

  // při otevření ukáže začátek pracovní doby
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: pxFromMin(WORK_FROM_MIN) - HOUR_PX / 2 });
  }, [n]);

  const cellAt = (clientX: number, clientY: number) => {
    const r = bodyRef.current!.getBoundingClientRect();
    const idx = clamp(Math.floor(((clientX - r.left) / r.width) * n), 0, n - 1);
    return { idx, min: clamp(minFromPx(clientY - r.top), 0, 1440) };
  };

  // tažení běží přes okno, ukazatel smí z mřížky vyjet
  const active = drag !== null;
  useEffect(() => {
    if (!active) return;
    const onMovePtr = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const c = cellAt(e.clientX, e.clientY);
      if (d.kind === "create") setDrag({ ...d, cur: c.min });
      else if (d.kind === "move") {
        const delta = c.min - d.pointerStart;
        const moved = d.moved || Math.abs(delta) * (HOUR_PX / 60) > 4 || c.idx !== d.fromIdx;
        if (!moved) return;
        const dayDelta = c.idx - d.fromIdx;
        setDrag({
          ...d,
          moved: true,
          date: addDaysIso(dateOf(d.item.start), dayDelta),
          newStart: clamp(snap(d.startMin + delta), 0, 1440 - 15),
        });
      } else setDrag({ ...d, newEnd: clamp(snap(c.min), 15, 1440) });
    };
    const finish = (cancel: boolean) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d || cancel) return;
      if (d.kind === "create") {
        const moved = Math.abs(d.cur - d.anchor) * (HOUR_PX / 60) > 5;
        const r = selectionRange(d.anchor, moved ? d.cur : d.anchor);
        onCreate({ date: days[d.dayIdx]!, ...r });
      } else if (d.kind === "move") {
        if (!d.moved) onOpen(d.item);
        else if (d.date !== dateOf(d.item.start) || d.newStart !== minutesOf(d.item.start))
          onMove(d.item, moveInstants(d.item, d.date, d.newStart));
      } else {
        onMove(d.item, resizeInstants(d.item, d.newEnd));
      }
    };
    const up = () => finish(false);
    const cancel = () => finish(true);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("pointermove", onMovePtr);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", onMovePtr);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [active, days, n]);

  const strip = items.filter(isStripItem);
  const timed = items.filter((it) => !isStripItem(it));

  const keyMove = (it: Item, e: React.KeyboardEvent) => {
    if (!e.altKey || !it.eventId || !it.canEdit || !canWrite || it.allDay) return;
    const dy = e.key === "ArrowUp" ? -15 : e.key === "ArrowDown" ? 15 : 0;
    const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!dy && !dx) return;
    e.preventDefault();
    if (e.shiftKey && dy) {
      const endMin = (dateOf(it.end) > dateOf(it.start) ? 1440 : 0) + minutesOf(it.end);
      onMove(it, resizeInstants(it, endMin + dy));
    } else {
      onMove(
        it,
        moveInstants(
          it,
          addDaysIso(dateOf(it.start), dx),
          clamp(minutesOf(it.start) + dy, 0, 1425),
        ),
      );
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-bg"
      data-testid={n === 1 ? "day-grid" : "week-grid"}
    >
      {/* záhlaví dnů a pruh nahoře */}
      <div
        className="grid shrink-0 border-b border-line bg-bg"
        style={{ gridTemplateColumns: `${GUTTER} repeat(${n}, minmax(0, 1fr))` }}
      >
        <div />
        {days.map((d) => (
          <div
            key={d}
            className="min-w-0 border-l border-line px-1 pb-1 pt-1.5"
            data-testid="day-head"
            data-day={d}
          >
            <button
              type="button"
              disabled={!onDayClick}
              onClick={() => onDayClick?.(d)}
              className={cn(
                "mx-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium",
                onDayClick && "hover:bg-hover",
                d === today && "text-accent",
              )}
              aria-label={`${dayName(d)} ${Number(d.slice(8))}. ${Number(d.slice(5, 7))}.`}
            >
              <span className="text-muted">{dayName(d)}</span>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full",
                  d === today && "bg-accent text-accent-fg",
                )}
              >
                {Number(d.slice(8))}
              </span>
            </button>
            <div className="mt-1 min-h-6 space-y-0.5" data-testid="day-strip">
              {strip
                .filter((it) => touches(it, d))
                .map((it) => (
                  <StripItem
                    key={`${it.id}-${d}`}
                    it={it}
                    onOpen={onOpen}
                    selected={selectedId === it.id}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* časová mřížka */}
      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: pxFromMin(1440) }}>
          <div
            className="relative shrink-0 text-right text-[11px] text-faint"
            style={{ width: GUTTER }}
            aria-hidden
          >
            {HOURS.slice(1).map((h) => (
              <div
                key={h}
                className="absolute right-1.5 -translate-y-1/2 tabular"
                style={{ top: pxFromMin(h * 60) }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div
            ref={bodyRef}
            className="relative grid min-w-0 flex-1"
            style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
          >
            {days.map((d, idx) => {
              const placed = layoutDay(
                timed.map((it) => segmentFor(it, d)).filter((s): s is NonNullable<typeof s> => !!s),
              );
              const work = isWeekday(d);
              return (
                <div
                  key={d}
                  data-day={d}
                  data-testid="day-column"
                  className={cn("relative border-l border-line", !work && "bg-subtle")}
                  onPointerDown={(e) => {
                    if (
                      e.button !== 0 ||
                      !canWrite ||
                      coarse ||
                      (e.target as HTMLElement).closest("[data-testid='calendar-item']")
                    )
                      return;
                    const c = cellAt(e.clientX, e.clientY);
                    setDrag({ kind: "create", dayIdx: idx, anchor: c.min, cur: c.min });
                  }}
                >
                  {/* pracovní doba */}
                  {work && (
                    <div
                      data-bg="1"
                      data-testid="work-hours"
                      className="absolute inset-x-0 bg-bg"
                      style={{
                        top: pxFromMin(WORK_FROM_MIN),
                        height: pxFromMin(WORK_TO_MIN - WORK_FROM_MIN),
                      }}
                    />
                  )}
                  {HOURS.slice(1).map((h) => (
                    <div
                      key={h}
                      data-bg="1"
                      className="absolute inset-x-0 border-t border-line-soft"
                      style={{ top: pxFromMin(h * 60) }}
                    />
                  ))}
                  {now && now.date === d && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-danger"
                      style={{ top: pxFromMin(now.min) }}
                      aria-hidden
                    >
                      <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-danger" />
                    </div>
                  )}

                  {placed.map((p) => (
                    <EventBlock
                      key={`${p.item.id}-${d}`}
                      p={p}
                      canWrite={canWrite}
                      coarse={coarse}
                      selected={selectedId === p.item.id}
                      dragging={
                        !!drag &&
                        drag.kind !== "create" &&
                        drag.item.id === p.item.id &&
                        (drag.kind === "resize" || drag.moved)
                      }
                      onKeyDown={keyMove}
                      onOpen={onOpen}
                      onPointerDown={(e, mode) => {
                        e.stopPropagation();
                        const it = p.item;
                        if (mode === "resize") {
                          setDrag({ kind: "resize", item: it, segDay: d, newEnd: p.endMin });
                          return;
                        }
                        const c = cellAt(e.clientX, e.clientY);
                        setDrag({
                          kind: "move",
                          item: it,
                          segDay: d,
                          fromIdx: idx,
                          pointerStart: c.min,
                          startMin: minutesOf(it.start),
                          moved: false,
                          date: dateOf(it.start),
                          newStart: minutesOf(it.start),
                        });
                      }}
                    />
                  ))}

                  {/* náhled výběru nové schůzky */}
                  {drag?.kind === "create" && drag.dayIdx === idx && (
                    <Ghost {...selectionBox(drag)} label="Nová schůzka" />
                  )}
                  {/* náhled přesunu a změny délky */}
                  {drag?.kind === "move" && drag.moved && drag.date === d && (
                    <Ghost
                      startMin={drag.newStart}
                      endMin={drag.newStart + Math.max(15, segLen(drag.item))}
                      label={drag.item.title}
                      color={drag.item.color}
                    />
                  )}
                  {drag?.kind === "resize" && drag.segDay === d && (
                    <Ghost
                      startMin={minutesOf(drag.item.start)}
                      endMin={Math.max(drag.newEnd, minutesOf(drag.item.start) + 15)}
                      label={drag.item.title}
                      color={drag.item.color}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const segLen = (it: Item) => {
  const s = minutesOf(it.start);
  const e = (dateOf(it.end) > dateOf(it.start) ? 1440 : 0) + minutesOf(it.end);
  return Math.max(15, Math.min(e, 1440) - s);
};

function selectionBox(d: Extract<Drag, { kind: "create" }>) {
  const moved = Math.abs(d.cur - d.anchor) * (HOUR_PX / 60) > 5;
  const r = selectionRange(d.anchor, moved ? d.cur : d.anchor);
  return { startMin: r.startMin, endMin: r.endMin };
}

function Ghost({
  startMin,
  endMin,
  label,
  color = "blue",
}: {
  startMin: number;
  endMin: number;
  label: string;
  color?: string;
}) {
  const c = cssColor(color);
  return (
    <div
      className="pointer-events-none absolute inset-x-0.5 z-30 overflow-hidden rounded-md px-1.5 py-0.5 text-xs shadow-float"
      style={{
        top: pxFromMin(startMin),
        height: pxFromMin(endMin - startMin),
        background: `color-mix(in oklab, ${c} 30%, var(--bg))`,
        border: `1px solid ${c}`,
      }}
      data-testid="drag-ghost"
      aria-hidden
    >
      <div className="font-medium">{label}</div>
      <div className="tabular">
        {clock(startMin)}–{clock(endMin)}
      </div>
    </div>
  );
}

function EventBlock({
  p,
  canWrite,
  coarse,
  selected,
  dragging,
  onOpen,
  onKeyDown,
  onPointerDown,
}: {
  p: Placed;
  canWrite: boolean;
  coarse: boolean;
  selected: boolean;
  dragging: boolean;
  onOpen: (it: Item) => void;
  onKeyDown: (it: Item, e: React.KeyboardEvent) => void;
  onPointerDown: (e: React.PointerEvent, mode: "move" | "resize") => void;
}) {
  const { Link } = useNav();
  const it = p.item;
  const busy = it.kind === "busy";
  const interactive = !busy;
  const editable = interactive && !!it.eventId && it.canEdit && canWrite && !coarse && !it.allDay;
  const top = pxFromMin(p.startMin);
  const bottom = pxFromMin(Math.min(1440, Math.max(p.endMin, p.startMin + 25)));
  const height = bottom - top;
  const width = 100 / p.cols;
  const style: React.CSSProperties = {
    top,
    height: height - 1,
    left: `calc(${p.col * width}% + 1px)`,
    width: `calc(${width}% - 3px)`,
    ...blockStyle(it.color, busy),
  };
  const lastSegment =
    dateOf(it.end) === p.day || (minutesOf(it.end) === 0 && dateOf(it.end) > p.day);
  const content = (
    <>
      <div className="flex items-center gap-1 truncate font-medium leading-tight">
        {it.meetUrl && <Video className="size-3 shrink-0" aria-label="Google Meet" />}
        <span className="truncate">{it.title}</span>
      </div>
      {height > 34 && (
        <div className="tabular truncate text-muted">
          {timeOf(it.start)}–{timeOf(it.end)}
        </div>
      )}
      {height > 52 && it.location && <div className="truncate text-muted">{it.location}</div>}
    </>
  );
  const common = cn(
    "absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent",
    selected && "ring-2 ring-accent",
    dragging && "opacity-40",
    editable && "cursor-grab active:cursor-grabbing",
  );
  const label = `${it.title}, ${timeOf(it.start)}–${timeOf(it.end)}${it.location ? `, ${it.location}` : ""}`;
  if (busy)
    return (
      <div
        className={cn(common, "text-muted")}
        style={style}
        data-testid="calendar-item"
        data-kind="busy"
        aria-label={`Obsazeno ${timeOf(it.start)}–${timeOf(it.end)}`}
      >
        <div className="font-medium">{it.title}</div>
        {height > 34 && (
          <div className="tabular">
            {timeOf(it.start)}–{timeOf(it.end)}
          </div>
        )}
      </div>
    );
  if (!it.eventId)
    return it.href ? (
      <Link
        href={it.href}
        className={common}
        style={style}
        data-testid="calendar-item"
        data-layer={it.layer}
        aria-label={label}
      >
        {content}
      </Link>
    ) : (
      <div className={common} style={style} data-testid="calendar-item" data-layer={it.layer}>
        {content}
      </div>
    );
  return (
    <button
      type="button"
      className={common}
      style={style}
      data-testid="calendar-item"
      data-event-id={it.eventId}
      aria-label={label}
      aria-description={
        editable
          ? "Alt a šipky přesune o 15 minut nebo o den, Alt, Shift a šipky nahoru nebo dolů změní délku."
          : undefined
      }
      onKeyDown={(e) => onKeyDown(it, e)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (editable) onPointerDown(e, "move");
      }}
      onClick={(e) => {
        // myš: otevření řeší konec tažení; klávesnice a dotyk: obyčejný klik
        if (editable && e.detail > 0) return;
        onOpen(it);
      }}
    >
      {content}
      {editable && lastSegment && (
        <span
          data-testid="resize-handle"
          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            onPointerDown(e, "resize");
          }}
          aria-hidden
        />
      )}
    </button>
  );
}
