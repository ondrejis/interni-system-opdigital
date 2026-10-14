"use client";

import {
  addDaysIso,
  diffDaysIso,
  eachDayIso,
  holidayName,
  isWorkday,
  isoWeekday,
  todayIso,
} from "@rebar/core/time";
import { Avatar, Chip, cn } from "@rebar/ui";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { StateIcon } from "./schedule-parts";
import { endAfter, lengthInWorkdays, shiftDependents, toWorkday } from "./schedule";
import {
  STATE_LABEL,
  STATE_TONE,
  WEEKDAY_SHORT,
  dayWidth,
  fmtRange,
  monthShort,
  phaseState,
  workdaysLabel,
  type GanttPhase,
  type Zoom,
} from "./schedule-shared";

export type { GanttPhase } from "./schedule-shared";

const ROW_H = 44;
const BAR_H = 26;
const BAR_TOP = (ROW_H - BAR_H) / 2;
const HEAD_TOP = 26;
const HEAD_BOT = 38;
const HEAD_H = HEAD_TOP + HEAD_BOT;
const MONTHS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

type Mode = "move" | "left" | "right";
type Drag = {
  id: string;
  mode: Mode;
  startX: number;
  startScroll: number;
  delta: number;
  active: boolean;
};

/** Nové termíny po tažení: začátek i konec se zarovnají na pracovní dny, délka v pracovních dnech se při posunu zachová. */
export function dragResult(
  p: Pick<GanttPhase, "startDate" | "endDate" | "milestone">,
  mode: Mode,
  delta: number,
) {
  if (mode === "move") {
    const start = toWorkday(addDaysIso(p.startDate, delta));
    const len = lengthInWorkdays(p.startDate, p.endDate);
    return { start, end: p.milestone ? start : endAfter(start, len) };
  }
  if (mode === "left") {
    const start = toWorkday(addDaysIso(p.startDate, delta));
    return { start: start > p.endDate ? p.endDate : start, end: p.endDate };
  }
  let end = addDaysIso(p.endDate, delta);
  while (!isWorkday(end) && end > p.startDate) end = addDaysIso(end, -1);
  return { start: p.startDate, end: end < p.startDate ? p.startDate : end };
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Gantt harmonogramu. Jeden posuvný panel (názvy fází se drží vlevo, záhlaví nahoře), dny jsou sloupce, víkendy a svátky
 * jsou zašedlé, „dnes“ má svislou čáru. Pruh se dá přetáhnout (posun i s navazujícími fázemi, které se v náhledu hýbou
 * s ním) nebo natáhnout za okraje; po puštění se termíny zarovnají na pracovní dny. Na klávesnici: ←/→ posun o pracovní
 * den, Shift+←/→ změna konce, ↑/↓ další fáze, Enter otevře úpravu. Na dotyku se pruhy jen otevírají (táhnutí by
 * překáželo posouvání).
 */
export function Gantt({
  phases,
  zoom = "month",
  readOnly,
  todayToken = 0,
  onMove,
  onOpen,
}: {
  phases: GanttPhase[];
  zoom?: Zoom;
  readOnly?: boolean;
  /** Při každé změně se časová osa plynule posune na dnešek. */
  todayToken?: number;
  onMove: (id: string, start: string, end: string) => void;
  onOpen: (id: string) => void;
}) {
  const today = todayIso();
  const dayW = dayWidth(zoom);
  const uid = useId().replace(/:/g, "");
  const scroller = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const dragRef = useRef<Drag | null>(null);
  const justDragged = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tipId, setTipId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [box, setBox] = useState(0);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox(el.clientWidth));
    ro.observe(el);
    setBox(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const labelW = box === 0 ? 248 : box < 520 ? 112 : box < 860 ? 200 : 248;
  const showAvatar = labelW >= 200;

  /* ---------- rozsah osy ---------- */
  const from = useMemo(() => {
    const first = [
      today,
      ...phases.flatMap((p) => [p.startDate, p.baselineStart ?? p.startDate]),
    ].sort()[0]!;
    return zoom === "quarter"
      ? `${first.slice(0, 7)}-01`
      : addDaysIso(first, -(isoWeekday(first) - 1) - 7);
  }, [phases, today, zoom]);

  /** Náhled tažení: nové termíny tažené fáze a fází, které se s ní posunou (stejně jako po uložení na serveru). */
  const preview = useMemo(() => {
    const map = new Map<string, { start: string; end: string }>();
    if (!drag?.active) return map;
    const p = phases.find((x) => x.id === drag.id);
    if (!p) return map;
    const r = dragResult(p, drag.mode, drag.delta);
    map.set(p.id, { start: r.start, end: r.end });
    const changed = phases.map((x) =>
      x.id === p.id ? { ...x, startDate: r.start, endDate: r.end } : x,
    );
    for (const m of shiftDependents(changed, p.id))
      map.set(m.id, { start: m.startDate, end: m.endDate });
    return map;
  }, [drag, phases]);

  const days = useMemo(() => {
    const ends = [
      addDaysIso(today, 28),
      ...phases.flatMap((p) => [p.endDate, p.baselineEnd ?? p.endDate]),
      ...[...preview.values()].map((v) => v.end),
    ];
    const last = ends.sort().reverse()[0]!;
    let to = addDaysIso(last, 14);
    const need = Math.ceil(Math.max(0, box - labelW) / dayW) + 1;
    if (diffDaysIso(from, to) + 1 < need) to = addDaysIso(from, need);
    return eachDayIso(from, to);
  }, [phases, preview, today, from, box, labelW, dayW]);

  const x = useCallback((d: string) => diffDaysIso(from, d) * dayW, [from, dayW]);
  const tw = days.length * dayW;
  const bodyH = phases.length * ROW_H;

  /* ---------- záhlaví, mřížka, volné dny ---------- */
  const head = useMemo(() => {
    const top: { key: string; label: string; x: number; w: number }[] = [];
    const bottom: {
      key: string;
      label: string;
      x: number;
      w: number;
      title?: string | undefined;
      today?: boolean;
      weekend?: boolean;
    }[] = [];
    const lines: { x: number; strong: boolean }[] = [];
    const off: { x: number; w: number; holiday: boolean }[] = [];
    days.forEach((d, i) => {
      const px = i * dayW;
      // horní řádek: měsíce (čtvrtletí: roky)
      const key = zoom === "quarter" ? d.slice(0, 4) : d.slice(0, 7);
      const last = top[top.length - 1];
      if (last?.key === key) last.w += dayW;
      else
        top.push({
          key,
          label:
            zoom === "quarter"
              ? d.slice(0, 4)
              : `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`,
          x: px,
          w: dayW,
        });
      const wd = isoWeekday(d);
      if (zoom === "week") {
        bottom.push({
          key: d,
          label: String(Number(d.slice(8))),
          title: holidayName(d) ?? undefined,
          x: px,
          w: dayW,
          today: d === today,
          weekend: !isWorkday(d),
        });
        lines.push({ x: px, strong: wd === 1 });
      } else if (zoom === "month") {
        if (wd === 1) {
          bottom.push({ key: d, label: `${Number(d.slice(8))}.`, x: px, w: 7 * dayW });
          lines.push({ x: px, strong: true });
        }
      } else {
        const mk = d.slice(0, 7);
        const lb = bottom[bottom.length - 1];
        if (lb?.key === mk) lb.w += dayW;
        else {
          bottom.push({ key: mk, label: "", x: px, w: dayW });
          lines.push({ x: px, strong: Number(d.slice(5, 7)) % 3 === 1 });
        }
        if (bottom[bottom.length - 1]!.key === mk) bottom[bottom.length - 1]!.label = d.slice(5, 7);
      }
      if (!isWorkday(d)) {
        const prev = off[off.length - 1];
        if (prev && prev.x + prev.w === px) {
          prev.w += dayW;
          prev.holiday ||= !!holidayName(d);
        } else off.push({ x: px, w: dayW, holiday: !!holidayName(d) });
      }
    });
    return { top, bottom, lines, off };
  }, [days, dayW, zoom, today]);

  /* ---------- posuny osy ---------- */
  const centerRef = useRef(today);
  const onScroll = () => {
    const el = scroller.current;
    if (el)
      centerRef.current = addDaysIso(
        from,
        Math.round((el.scrollLeft + (el.clientWidth - labelW) / 2) / dayW),
      );
  };

  const inited = useRef(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (inited.current || !el || !box || phases.length === 0) return;
    inited.current = true;
    const first = phases.map((p) => p.startDate).sort()[0]!;
    const last = phases
      .map((p) => p.endDate)
      .sort()
      .reverse()[0]!;
    const visible = el.clientWidth - labelW;
    el.scrollLeft = Math.max(
      0,
      today >= first && today <= addDaysIso(last, 7)
        ? x(today) - visible * 0.3
        : x(first) - 2 * dayW,
    );
  }, [box, phases, today, labelW, dayW, x]);

  // když se začátek osy posune (fáze přeplánovaná před dosavadní začátek), pohled zůstane tam, kde byl
  const fromState = useRef({ from, zoom });
  useLayoutEffect(() => {
    const prev = fromState.current;
    fromState.current = { from, zoom };
    const el = scroller.current;
    if (!el || prev.zoom !== zoom || prev.from === from) return;
    el.scrollLeft += diffDaysIso(from, prev.from) * dayW;
  }, [from, zoom, dayW]);

  const prevZoom = useRef(zoom);
  useLayoutEffect(() => {
    if (prevZoom.current === zoom) return;
    prevZoom.current = zoom;
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, x(centerRef.current) - (el.clientWidth - labelW) / 2);
  }, [zoom, x, labelW]);

  const prevToken = useRef(todayToken);
  useEffect(() => {
    if (prevToken.current === todayToken) return;
    prevToken.current = todayToken;
    const el = scroller.current;
    el?.scrollTo({
      left: Math.max(0, x(today) - (el.clientWidth - labelW) / 2),
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }, [todayToken, today, x, labelW]);

  /* ---------- tažení ---------- */
  const shown = (p: GanttPhase) => {
    const v = preview.get(p.id);
    return v ?? { start: p.startDate, end: p.endDate };
  };

  const placeTip = useCallback(() => {
    const el = tipRef.current;
    if (!el) return;
    const { x: px, y: py } = pointer.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = px + 14;
    if (left + w > window.innerWidth - 8) left = Math.max(8, px - w - 14);
    let top = py + 18;
    if (top + h > window.innerHeight - 8) top = Math.max(8, py - h - 12);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, []);
  useLayoutEffect(() => {
    if (tipId || drag?.active) placeTip();
  });

  function onPointerDown(e: PointerEvent<HTMLElement>, p: GanttPhase) {
    justDragged.current = false;
    if (e.button !== 0 || e.pointerType === "touch" || readOnly) return;
    const handle = (e.target as HTMLElement).dataset.handle as Mode | undefined;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      id: p.id,
      mode: p.milestone ? "move" : (handle ?? "move"),
      startX: e.clientX,
      startScroll: scroller.current?.scrollLeft ?? 0,
      delta: 0,
      active: false,
    };
  }
  function onPointerMove(e: PointerEvent<HTMLElement>, p: GanttPhase) {
    pointer.current = { x: e.clientX, y: e.clientY };
    const d = dragRef.current;
    if (!d || d.id !== p.id) return placeTip();
    const el = scroller.current;
    if (!el) return;
    if (!d.active && Math.abs(e.clientX - d.startX) < 4) return;
    let delta = Math.round((e.clientX - d.startX + (el.scrollLeft - d.startScroll)) / dayW);
    if (d.mode !== "right") delta = Math.max(delta, diffDaysIso(p.startDate, from));
    if (!d.active || delta !== d.delta) {
      const next = { ...d, active: true, delta };
      dragRef.current = next;
      setDrag(next);
    }
    placeTip();
    // u okraje panelu se osa posouvá s tažením
    const r = el.getBoundingClientRect();
    if (e.clientX > r.right - 48) el.scrollLeft += 14;
    else if (e.clientX < r.left + labelW + 48) el.scrollLeft -= 14;
  }
  function onPointerUp(p: GanttPhase) {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d?.active) return;
    justDragged.current = true;
    const r = dragResult(p, d.mode, d.delta);
    if (r.start !== p.startDate || r.end !== p.endDate) onMove(p.id, r.start, r.end);
  }
  function cancelDrag() {
    dragRef.current = null;
    setDrag(null);
  }
  function onClick(p: GanttPhase) {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    onOpen(p.id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>, p: GanttPhase, i: number) {
    if (e.key === "Escape" && dragRef.current) return cancelDrag();
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return onOpen(p.id);
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const other = phases[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (other)
        scroller.current?.querySelector<HTMLElement>(`[data-phase="${other.id}"]`)?.focus();
      return;
    }
    if (readOnly || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    if (e.shiftKey && !p.milestone) {
      // změna konce o pracovní den
      let end = addDaysIso(p.endDate, step);
      while (!isWorkday(end)) end = addDaysIso(end, step);
      if (end >= p.startDate) onMove(p.id, p.startDate, end);
      return;
    }
    let start = addDaysIso(p.startDate, step);
    while (!isWorkday(start)) start = addDaysIso(start, step);
    const r = dragResult(p, "move", diffDaysIso(p.startDate, start));
    onMove(p.id, r.start, r.end);
  }

  const byId = useMemo(() => new Map(phases.map((p, i) => [p.id, { p, i }])), [phases]);
  const active = drag?.active ? drag.id : (hoverId ?? focusId);
  const tipPhase = drag?.active ? byId.get(drag.id)?.p : tipId ? byId.get(tipId)?.p : undefined;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg" data-testid="gantt">
      <div
        ref={scroller}
        onScroll={onScroll}
        role="group"
        aria-label="Ganttův diagram harmonogramu"
        className="scrollbar-thin relative overflow-auto md:max-h-[calc(100vh-14rem)]"
      >
        <div className="flex" style={{ width: labelW + tw }}>
          {/* názvy fází (drží se vlevo) */}
          <div
            className="sticky left-0 z-30 shrink-0 border-r border-line bg-bg"
            style={{ width: labelW }}
          >
            <div
              className="sticky top-0 z-10 flex items-end justify-between border-b border-line bg-subtle px-3 pb-2 text-xs font-medium text-muted"
              style={{ height: HEAD_H }}
            >
              <span>Fáze</span>
              <span className="tabular">{phases.length}</span>
            </div>
            {phases.map((p) => {
              const st = phaseState(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  title={p.name}
                  onClick={() => onOpen(p.id)}
                  onMouseEnter={() => setHoverId(p.id)}
                  onMouseLeave={() => setHoverId(null)}
                  className={cn(
                    "flex w-full items-center gap-2 border-b border-line px-3 text-left outline-none transition-colors duration-150 focus-visible:bg-hover",
                    active === p.id ? "bg-hover" : "bg-bg",
                  )}
                  style={{ height: ROW_H }}
                >
                  <StateIcon state={st} milestone={p.milestone} />
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  {showAvatar && p.responsibleName && <Avatar name={p.responsibleName} size={20} />}
                </button>
              );
            })}
          </div>

          {/* časová osa */}
          <div className="relative shrink-0" style={{ width: tw, height: HEAD_H + bodyH }}>
            {/* záhlaví */}
            <div
              className="sticky top-0 z-20 border-b border-line bg-subtle"
              style={{ height: HEAD_H }}
            >
              <div
                className="relative border-b border-line text-xs font-medium text-muted"
                style={{ height: HEAD_TOP }}
              >
                {head.top.map((m) => (
                  <span
                    key={m.key}
                    className="absolute top-0 flex items-center border-l border-line first:border-l-0"
                    style={{ left: m.x, width: m.w, height: HEAD_TOP }}
                  >
                    <span className="sticky truncate px-2 capitalize" style={{ left: labelW + 4 }}>
                      {m.label}
                    </span>
                  </span>
                ))}
              </div>
              <div className="relative text-xs text-muted" style={{ height: HEAD_BOT }}>
                {head.bottom.map((c) => (
                  <span
                    key={c.key}
                    title={c.title}
                    className={cn(
                      "tabular absolute top-0 flex flex-col items-center justify-center border-l border-line/60 leading-tight first:border-l-0",
                      c.weekend && "bg-hover/70",
                      c.title && "bg-warning-soft text-warning",
                    )}
                    style={{ left: c.x, width: c.w, height: HEAD_BOT }}
                  >
                    {zoom === "week" ? (
                      <>
                        <span className="text-[11px] uppercase leading-none text-muted">
                          {WEEKDAY_SHORT[isoWeekday(c.key) - 1]}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 flex size-5 items-center justify-center rounded-full",
                            c.today && "bg-accent font-semibold text-accent-fg",
                          )}
                        >
                          {c.label}
                        </span>
                      </>
                    ) : zoom === "month" ? (
                      <span className="self-start pl-1.5">{c.label}</span>
                    ) : (
                      <span className="capitalize">
                        {c.w >= 80 ? MONTHS[Number(c.label) - 1] : monthShort(`${c.key}-01`)}
                      </span>
                    )}
                  </span>
                ))}
                {zoom !== "week" && (
                  <span
                    className="absolute top-1 z-10 -translate-x-1/2 rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-4 text-accent-fg"
                    style={{ left: x(today) + dayW / 2 }}
                  >
                    Dnes
                  </span>
                )}
              </div>
            </div>

            {/* volné dny, mřížka, řádky */}
            {head.off.map((b) => (
              <div
                key={b.x}
                aria-hidden
                className={cn("absolute", b.holiday ? "bg-warning-soft/60" : "bg-hover/60")}
                style={{ left: b.x, width: b.w, top: HEAD_H, bottom: 0 }}
              />
            ))}
            {head.lines.map((l) => (
              <div
                key={l.x}
                aria-hidden
                className={cn("absolute w-px", l.strong ? "bg-line" : "bg-line/50")}
                style={{ left: l.x, top: HEAD_H, bottom: 0 }}
              />
            ))}
            {phases.map((p, i) => (
              <div
                key={p.id}
                aria-hidden
                className={cn(
                  "absolute inset-x-0 border-b border-line transition-colors duration-150",
                  active === p.id && "bg-hover/60",
                )}
                style={{ top: HEAD_H + i * ROW_H, height: ROW_H }}
              />
            ))}
            <div
              aria-hidden
              className="absolute z-[2] w-0.5 bg-accent/70"
              style={{ left: x(today) + dayW / 2 - 1, top: HEAD_H, bottom: 0 }}
            />

            {/* návaznosti */}
            <svg
              className="pointer-events-none absolute left-0 z-[3]"
              style={{ top: HEAD_H }}
              width={tw}
              height={bodyH}
              aria-hidden
            >
              <defs>
                {(["n", "a", "d"] as const).map((k) => (
                  <marker
                    key={k}
                    id={`${uid}-${k}`}
                    viewBox="0 0 8 8"
                    refX="7"
                    refY="4"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                  >
                    <path
                      d="M0,0.5 L7,4 L0,7.5 z"
                      fill={
                        k === "a"
                          ? "var(--accent)"
                          : k === "d"
                            ? "var(--danger)"
                            : "var(--fg-subtle)"
                      }
                    />
                  </marker>
                ))}
              </defs>
              {phases.map((p, i) => {
                const dep = p.dependsOnId ? byId.get(p.dependsOnId) : undefined;
                if (!dep) return null;
                const a = shown(dep.p);
                const b = shown(p);
                const x1 = dep.p.milestone ? x(a.start) + dayW / 2 + 9 : x(a.end) + dayW - 1;
                const x2 = p.milestone ? x(b.start) + dayW / 2 - 10 : x(b.start) + 1;
                const y1 = dep.i * ROW_H + ROW_H / 2;
                const y2 = i * ROW_H + ROW_H / 2;
                const conflict = b.start <= a.end && p.status !== "done";
                const hot = active === p.id || active === dep.p.id;
                const gap = 8;
                const ymid = y1 + (y2 >= y1 ? 1 : -1) * (ROW_H / 2);
                const d =
                  x2 >= x1 + gap * 2
                    ? `M${x1},${y1} H${x1 + gap} V${y2} H${x2}`
                    : `M${x1},${y1} H${x1 + gap} V${ymid} H${x2 - gap} V${y2} H${x2}`;
                const k = conflict ? "d" : hot ? "a" : "n";
                return (
                  <path
                    key={p.id}
                    d={d}
                    fill="none"
                    strokeLinejoin="round"
                    strokeWidth={hot ? 1.75 : 1.25}
                    stroke={conflict ? "var(--danger)" : hot ? "var(--accent)" : "var(--fg-subtle)"}
                    strokeOpacity={hot || conflict ? 1 : 0.75}
                    markerEnd={`url(#${uid}-${k})`}
                  />
                );
              })}
            </svg>

            {/* pruhy a milníky */}
            {phases.map((p, i) => {
              const s = shown(p);
              const st = phaseState(p);
              const tone = STATE_TONE[st];
              const rowTop = HEAD_H + i * ROW_H;
              const dragging = drag?.active && drag.id === p.id;
              const moved = preview.has(p.id) && !dragging;
              const label = `${p.name}, ${p.milestone ? `milník ${fmtRange(s.start, s.end)}` : fmtRange(s.start, s.end)}, ${
                p.progress
              } %${p.delay ? `, zpoždění ${workdaysLabel(p.delay)}` : ""}`;
              const common = {
                role: "button" as const,
                tabIndex: 0,
                "data-phase": p.id,
                "aria-label": label,
                onPointerDown: (e: PointerEvent<HTMLElement>) => onPointerDown(e, p),
                onPointerMove: (e: PointerEvent<HTMLElement>) => onPointerMove(e, p),
                onPointerUp: () => onPointerUp(p),
                onPointerCancel: cancelDrag,
                onPointerEnter: (e: PointerEvent<HTMLElement>) => {
                  pointer.current = { x: e.clientX, y: e.clientY };
                  if (e.pointerType === "touch") return;
                  setHoverId(p.id);
                  setTipId(p.id);
                },
                onPointerLeave: () => {
                  setHoverId((h) => (h === p.id ? null : h));
                  setTipId((h) => (h === p.id ? null : h));
                },
                onFocus: () => setFocusId(p.id),
                onBlur: () => setFocusId((h) => (h === p.id ? null : h)),
                onClick: () => onClick(p),
                onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(e, p, i),
              };
              const grab = readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing";

              if (p.milestone) {
                const cx = x(s.start) + dayW / 2;
                return (
                  <div key={p.id}>
                    <div
                      {...common}
                      className={cn(
                        "absolute z-[4] flex size-6 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        grab,
                        dragging && "z-[6]",
                      )}
                      style={{
                        left: cx - 12,
                        top: rowTop + (ROW_H - 24) / 2,
                        minHeight: 0,
                        touchAction: "pan-x pan-y",
                      }}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "block size-4 rotate-45 rounded-[3px] border-2 transition-[box-shadow] duration-150",
                          (dragging || active === p.id) && "shadow-float",
                          moved && "opacity-80",
                        )}
                        style={{ background: tone.fill, borderColor: tone.edge }}
                      />
                    </div>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute z-[4] truncate text-xs font-medium"
                      style={{
                        left: cx + 16,
                        top: rowTop + (ROW_H - 16) / 2,
                        maxWidth: 220,
                        lineHeight: "16px",
                      }}
                    >
                      {p.name}
                    </span>
                  </div>
                );
              }

              const left = x(s.start) + 1;
              const w = Math.max((diffDaysIso(s.start, s.end) + 1) * dayW - 2, 8);
              return (
                <div key={p.id}>
                  {p.baselineStart &&
                    p.baselineEnd &&
                    (p.baselineStart !== p.startDate || p.baselineEnd !== p.endDate) && (
                      <div
                        aria-hidden
                        className="absolute z-[2] h-[3px] rounded-full bg-faint/70"
                        style={{
                          left: x(p.baselineStart) + 1,
                          width: (diffDaysIso(p.baselineStart, p.baselineEnd) + 1) * dayW - 2,
                          top: rowTop + BAR_TOP + BAR_H + 3,
                        }}
                      />
                    )}
                  <div
                    {...common}
                    className={cn(
                      "group absolute z-[4] flex items-center overflow-hidden rounded-md text-xs font-medium outline-none transition-[box-shadow,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
                      grab,
                      (dragging || active === p.id) && "shadow-float",
                      dragging && "z-[6]",
                      moved && "opacity-80",
                    )}
                    style={{
                      left,
                      width: w,
                      top: rowTop + BAR_TOP,
                      height: BAR_H,
                      minHeight: 0,
                      background: tone.track,
                      boxShadow: `inset 0 0 0 1px ${tone.edge}`,
                      touchAction: "pan-x pan-y",
                    }}
                  >
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-0"
                      style={{ width: `${p.progress}%`, background: tone.fill }}
                    />
                    {w >= 56 && (
                      <span className="tabular pointer-events-none relative whitespace-nowrap px-2 text-fg">
                        {st === "done" ? "Hotovo" : `${p.progress} %`}
                      </span>
                    )}
                    {!readOnly && (
                      <>
                        <span
                          aria-hidden
                          data-handle="left"
                          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-fg/10 [@media(pointer:coarse)]:hidden"
                        />
                        <span
                          aria-hidden
                          data-handle="right"
                          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-fg/10 [@media(pointer:coarse)]:hidden"
                        />
                      </>
                    )}
                  </div>
                  {st === "late" && p.delay > 0 && (
                    <span
                      aria-hidden
                      className="tabular pointer-events-none absolute z-[4] text-xs font-semibold text-danger"
                      style={{
                        left: left + w + 6,
                        top: rowTop + (ROW_H - 16) / 2,
                        lineHeight: "16px",
                      }}
                    >
                      +{p.delay} d
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {tipPhase && (
        <div
          ref={tipRef}
          role="tooltip"
          className="pointer-events-none fixed left-0 top-0 z-50 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-bg p-3 text-sm shadow-float"
        >
          <PhaseTip
            p={tipPhase}
            start={shown(tipPhase).start}
            end={shown(tipPhase).end}
            dependsOn={tipPhase.dependsOnId ? byId.get(tipPhase.dependsOnId)?.p.name : undefined}
            dragging={!!drag?.active}
            shifted={Math.max(0, preview.size - 1)}
          />
        </div>
      )}
    </div>
  );
}

function PhaseTip({
  p,
  start,
  end,
  dependsOn,
  dragging,
  shifted,
}: {
  p: GanttPhase;
  start: string;
  end: string;
  dependsOn: string | undefined;
  dragging: boolean;
  shifted: number;
}) {
  const st = phaseState(p);
  const baselineChanged =
    p.baselineStart &&
    p.baselineEnd &&
    (p.baselineStart !== p.startDate || p.baselineEnd !== p.endDate);
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <b className="min-w-0 font-semibold">{p.name}</b>
        <Chip color={STATE_TONE[st].chip} dot>
          {p.milestone && st === "done" ? "Splněno" : STATE_LABEL[st]}
        </Chip>
      </div>
      <p className="tabular text-muted">
        {fmtRange(start, end)}
        {!p.milestone && ` · ${workdaysLabel(lengthInWorkdays(start, end))}`}
      </p>
      {!p.milestone && <p className="tabular text-muted">Postup {p.progress} %</p>}
      {dragging && shifted > 0 && (
        <p className="text-warning">Posunou se i navazující fáze ({shifted}).</p>
      )}
      {!dragging && (
        <>
          {p.responsibleName && <p className="text-muted">Odpovídá: {p.responsibleName}</p>}
          {dependsOn && <p className="text-muted">Navazuje na: {dependsOn}</p>}
          {p.delay > 0 && st !== "done" && (
            <p className="text-danger">Zpoždění {workdaysLabel(p.delay)}</p>
          )}
          {baselineChanged && (
            <p className="tabular text-muted">
              Výchozí plán: {fmtRange(p.baselineStart!, p.baselineEnd!)}
            </p>
          )}
          {p.note && <p className="line-clamp-2 text-muted">{p.note}</p>}
        </>
      )}
    </div>
  );
}
