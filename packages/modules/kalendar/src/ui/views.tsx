"use client";

import { addDaysIso, eachDayIso, todayIso, weekStartIso } from "@rebar/core/time";
import { cn, useNav } from "@rebar/ui";
import { Video } from "lucide-react";
import { dayComparator } from "../day-order";
import {
  DAY_NAMES,
  cssColor,
  dateOf,
  dayName,
  moveAllDay,
  moveInstants,
  minutesOf,
  timeOf,
  touches,
  type Instants,
  type Item,
} from "./lib";

/** Právě teď v místním čase (`YYYY-MM-DDTHH:mm`), tak jako časy položek. */
function nowLocalIso() {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  return p.replace(" ", "T");
}
const sortDay = (day: string) => dayComparator(day, nowLocalIso());

const chipStyle = (it: Item): React.CSSProperties => {
  const c = cssColor(it.color);
  return it.kind === "busy"
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

/** Položka v měsíční mřížce nebo agendě: událost (otevře náhled, jde přetáhnout na jiný den), vrstva (odkaz), obsazeno. */
export function ItemChip({
  it,
  day,
  selected,
  onOpen,
  draggable,
  withTime = true,
}: {
  it: Item;
  day: string;
  selected: boolean;
  onOpen: (it: Item) => void;
  draggable: boolean;
  withTime?: boolean;
}) {
  const { Link } = useNav();
  if (it.kind === "holiday")
    return (
      <div className="truncate px-1 text-xs text-danger" title={it.title}>
        {it.title}
      </div>
    );
  const cls = cn(
    "flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-xs",
    it.kind === "busy" && "text-muted",
    selected && "ring-2 ring-accent",
  );
  const label = (
    <>
      {withTime && !it.allDay && <span className="tabular shrink-0">{timeOf(it.start)}</span>}
      {it.meetUrl && <Video className="size-3 shrink-0" aria-label="Google Meet" />}
      <span className="truncate">{it.title}</span>
    </>
  );
  const aria = `${it.title}${it.allDay ? "" : ` ${timeOf(it.start)}`}`;
  if (it.kind === "busy")
    return (
      <div
        className={cls}
        style={chipStyle(it)}
        data-testid="calendar-item"
        data-kind="busy"
        aria-label={aria}
      >
        {label}
      </div>
    );
  if (it.eventId)
    return (
      <button
        type="button"
        className={cn(cls, draggable && "cursor-grab")}
        style={chipStyle(it)}
        onClick={() => onOpen(it)}
        data-testid="calendar-item"
        data-event-id={it.eventId}
        aria-label={aria}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/x-kalendar-event", `${it.eventId}|${day}`);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        {label}
      </button>
    );
  return it.href ? (
    <Link
      href={it.href}
      className={cls}
      style={chipStyle(it)}
      data-testid="calendar-item"
      data-layer={it.layer}
    >
      {label}
    </Link>
  ) : (
    <div className={cls} style={chipStyle(it)} data-testid="calendar-item" data-layer={it.layer}>
      {label}
    </div>
  );
}

export function MonthView({
  cursor,
  items,
  selectedId,
  canWrite,
  coarse,
  onDay,
  onMore,
  onOpen,
  onMove,
}: {
  cursor: string;
  items: Item[];
  selectedId: string | null;
  canWrite: boolean;
  coarse: boolean;
  onDay: (d: string) => void;
  onMore: (d: string) => void;
  onOpen: (it: Item) => void;
  onMove: (it: Item, to: Instants) => void;
}) {
  const first = `${cursor.slice(0, 7)}-01`;
  const start = weekStartIso(first);
  const days = eachDayIso(start, addDaysIso(start, 41));
  const today = todayIso();
  const drop = (e: React.DragEvent, d: string) => {
    const raw = e.dataTransfer.getData("text/x-kalendar-event");
    if (!raw) return;
    e.preventDefault();
    const [id, from] = raw.split("|");
    const it = items.find((x) => x.eventId === id);
    if (!it || !from || from === d) return;
    const delta = Math.round(
      (Date.parse(`${d}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
    );
    onMove(
      it,
      it.allDay
        ? moveAllDay(it, delta)
        : moveInstants(it, addDaysIso(dateOf(it.start), delta), minutesOf(it.start)),
    );
  };
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg" data-testid="month-grid">
      <div className="grid grid-cols-7 bg-subtle text-center text-sm text-muted">
        {DAY_NAMES.map((n) => (
          <div key={n} className="py-1.5 font-medium">
            {n}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 divide-x divide-y divide-line">
        {days.map((d) => {
          const here = items.filter((it) => touches(it, d)).sort(dayComparator(d, nowLocalIso()));
          const other = d.slice(0, 7) !== first.slice(0, 7);
          return (
            <div
              key={d}
              className={cn("min-h-24 min-w-0 p-1", other && "bg-subtle/60 text-muted")}
              data-day={d}
              onDragOver={(e) => canWrite && e.preventDefault()}
              onDrop={(e) => canWrite && drop(e, d)}
            >
              <button
                type="button"
                aria-label={
                  canWrite
                    ? `Nová schůzka ${Number(d.slice(8))}. ${Number(d.slice(5, 7))}.`
                    : `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}.`
                }
                disabled={!canWrite}
                onClick={() => onDay(d)}
                className={cn(
                  "mb-1 ml-auto flex size-6 items-center justify-center rounded-full text-sm hover:bg-hover disabled:hover:bg-transparent",
                  d === today && "bg-accent font-semibold text-accent-fg hover:bg-accent",
                )}
              >
                {Number(d.slice(8))}
              </button>
              <div className="space-y-0.5">
                {here.slice(0, 3).map((it) => (
                  <ItemChip
                    key={`${it.id}-${d}`}
                    it={it}
                    day={d}
                    selected={selectedId === it.id}
                    onOpen={onOpen}
                    draggable={canWrite && !coarse && it.canEdit && !!it.eventId}
                  />
                ))}
                {here.length > 3 && (
                  <button
                    type="button"
                    className="px-1 text-xs text-muted hover:underline"
                    onClick={() => onMore(d)}
                  >
                    + {here.length - 3} další
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaView({
  from,
  days = 30,
  items,
  selectedId,
  onOpen,
}: {
  from: string;
  days?: number;
  items: Item[];
  selectedId: string | null;
  onOpen: (it: Item) => void;
}) {
  const list = eachDayIso(from, addDaysIso(from, days - 1)).filter((d) =>
    items.some((it) => touches(it, d) && it.kind !== "holiday"),
  );
  const today = todayIso();
  if (!list.length)
    return (
      <p
        className="rounded-lg border border-line bg-bg p-6 text-center text-muted"
        data-testid="agenda"
      >
        V příštích {days} dnech nic není.
      </p>
    );
  return (
    <div className="space-y-4" data-testid="agenda">
      {list.map((d) => (
        <section
          key={d}
          aria-label={`${dayName(d)} ${Number(d.slice(8))}. ${Number(d.slice(5, 7))}.`}
        >
          <h3 className={cn("mb-1 text-sm font-semibold", d === today && "text-accent")}>
            {d === today ? "Dnes · " : ""}
            {dayName(d)} {Number(d.slice(8))}. {Number(d.slice(5, 7))}.
          </h3>
          <ul className="divide-y divide-line-soft rounded-lg border border-line bg-bg">
            {items
              .filter((it) => touches(it, d) && it.kind !== "holiday")
              .sort(sortDay(d))
              .map((it) => (
                <li key={`${it.id}-${d}`} className="flex items-center gap-3 px-3 py-2">
                  <span className="tabular w-24 shrink-0 text-sm text-muted">
                    {it.allDay ? "Celý den" : `${timeOf(it.start)}–${timeOf(it.end)}`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <ItemChip
                      it={it}
                      day={d}
                      selected={selectedId === it.id}
                      onOpen={onOpen}
                      draggable={false}
                      withTime={false}
                    />
                    {(it.location || it.owner) && it.kind !== "busy" && (
                      <p className="mt-0.5 truncate px-1.5 text-xs text-muted">
                        {[it.location, it.own ? null : it.owner].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {it.meetUrl && it.kind === "event" && (
                    <a
                      href={it.meetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-accent hover:bg-hover sm:flex"
                      aria-label={`Otevřít Google Meet: ${it.title}`}
                    >
                      <Video className="size-4" /> Meet
                    </a>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
