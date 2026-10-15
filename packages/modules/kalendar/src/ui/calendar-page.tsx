"use client";

import { addDaysIso, eachDayIso, todayIso, weekStartIso } from "@rebar/core/time";
import {
  Button,
  Chip,
  IconButton,
  Notice,
  Skeleton,
  cn,
  errorToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useNav,
} from "@rebar/ui";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AccountState, MoveInput, RangeResult } from "../contract";
import { EventPanel } from "./event-panel";
import {
  LAYER_MINE,
  LAYER_OTHERS,
  clock,
  dateOf,
  dayName,
  instantToLocal,
  layerOf,
  nextFullHour,
  visibleItems,
  type Instants,
  type Item,
} from "./lib";
import { MeetingDialog, type MeetingDraft } from "./meeting-dialog";
import { TimeGrid, type CreateRequest } from "./time-grid";
import { AgendaView, MonthView } from "./views";

/*
  Stránka Kalendář (`/kalendar`): přepínač pohledů Den / Týden (výchozí) / Měsíc / Agenda, vrstvy, náhled události
  v postranním panelu a vytvoření schůzky. Na mobilu je výchozí Agenda a nabízí se jen Agenda a Den; schůzka se tam
  zakládá formulářem (bez tažení).
*/

type View = "day" | "week" | "month" | "agenda";
const VIEWS: { v: View; label: string; mobile: boolean }[] = [
  { v: "day", label: "Den", mobile: true },
  { v: "week", label: "Týden", mobile: false },
  { v: "month", label: "Měsíc", mobile: false },
  { v: "agenda", label: "Agenda", mobile: true },
];

const VIEW_KEY = "kalendar.view";
const HIDDEN_KEY = "kalendar.hiddenLayers";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ukládání je jen pohodlí
  }
}

/** Shoda s media query; na serveru `false`. */
function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
function shiftMonth(iso: string, delta: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
const short = (d: string) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}.`;

export function CalendarPage() {
  const can = useCan();
  const { Link } = useNav();
  const canWriteRole = can("kalendar.write");
  const mobile = useMedia("(max-width: 767px)");
  const coarse = useMedia("(pointer: coarse)");
  const [ready, setReady] = useState(false);
  const [view, setViewState] = useState<View>("week");
  const [cursor, setCursor] = useState(todayIso());
  const [hidden, setHidden] = useState<string[]>([LAYER_OTHERS]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<MeetingDraft | null>(null);
  const [override, setOverride] = useState<Record<string, Partial<Item>>>({});

  // uložené nastavení (po připojení klienta kvůli hydrataci)
  useEffect(() => {
    const v = read(VIEW_KEY);
    const h = read(HIDDEN_KEY);
    setViewState(
      VIEWS.some((x) => x.v === v) ? (v as View) : window.innerWidth < 768 ? "agenda" : "week",
    );
    if (h) {
      try {
        const parsed = JSON.parse(h) as unknown;
        if (Array.isArray(parsed))
          setHidden(parsed.filter((x): x is string => typeof x === "string"));
      } catch {
        // poškozené uložení ignoruj
      }
    }
    setReady(true);
  }, []);
  // na mobilu měsíc a týden nejsou: spadne na Agendu
  const effectiveView: View = mobile && (view === "week" || view === "month") ? "agenda" : view;
  const setView = (v: View) => {
    setViewState(v);
    write(VIEW_KEY, v);
  };

  const range =
    effectiveView === "month"
      ? (() => {
          const s = weekStartIso(`${cursor.slice(0, 7)}-01`);
          return { from: s, to: addDaysIso(s, 41) };
        })()
      : effectiveView === "week"
        ? { from: weekStartIso(cursor), to: addDaysIso(weekStartIso(cursor), 6) }
        : effectiveView === "day"
          ? { from: cursor, to: cursor }
          : { from: cursor, to: addDaysIso(cursor, 29) };

  const account = useCommandQuery<AccountState>("kalendar.account", {});
  const others = account.data?.others[0];
  const wantOthers = !!account.data?.canSeeAll && !hidden.includes(LAYER_OTHERS);
  const q = useCommandQuery<RangeResult>(
    "kalendar.range",
    { ...range, who: wantOthers ? "all" : "me" },
    { refetchInterval: 60_000 },
  );
  // poslední data zůstanou vidět, než dorazí nový rozsah (bez blikání kostry při listování)
  const last = useRef<RangeResult | null>(null);
  if (q.data) last.current = q.data;
  const data = q.data ?? last.current;
  useEffect(() => setOverride({}), [q.dataUpdatedAt]);

  const all: Item[] = (data?.items ?? []).map((it) =>
    it.eventId && override[it.eventId] ? { ...it, ...override[it.eventId] } : it,
  );
  const items = visibleItems(all, hidden);
  const selected = all.find((i) => i.id === selectedId) ?? null;
  const lastSelected = useRef<Item | null>(null);
  if (selected) lastSelected.current = selected;
  const canWrite = canWriteRole && (data?.canWrite ?? true);
  const connected = data?.connected ?? true;

  const toggleLayer = (key: string) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    setHidden(next);
    write(HIDDEN_KEY, JSON.stringify(next));
  };

  const moveMut = useCommandMutation<MoveInput>("kalendar.move");
  const doMove = async (it: Item, to: Instants) => {
    if (!it.eventId) return;
    const s = instantToLocal(to.startsAt);
    const e = instantToLocal(to.endsAt);
    const patch: Partial<Item> = it.allDay
      ? { start: s.date, end: addDaysIso(e.date, -1), startsAt: to.startsAt, endsAt: to.endsAt }
      : {
          start: `${s.date}T${clock(s.min)}`,
          end: `${e.date}T${clock(e.min)}`,
          startsAt: to.startsAt,
          endsAt: to.endsAt,
        };
    setOverride((o) => ({ ...o, [it.eventId!]: patch }));
    try {
      await moveMut.mutateAsync({
        eventId: it.eventId,
        startsAt: to.startsAt,
        endsAt: to.endsAt,
        allDay: it.allDay,
      });
    } catch (err) {
      setOverride((o) => {
        const { [it.eventId!]: _drop, ...rest } = o;
        return rest;
      });
      errorToast(err instanceof Error ? err.message : "Přesun se nepovedl.");
    }
  };

  const openNew = (req?: CreateRequest | { date: string }) => {
    if (!canWrite) return;
    if (req && "startMin" in req) return setMeeting(req);
    const date = req?.date ?? (dateOf(cursor) < todayIso() ? todayIso() : cursor);
    const start = nextFullHour(new Date().getHours() * 60);
    setMeeting({ date, startMin: start, endMin: start + 60 });
  };
  // z palety Cmd+K: /kalendar?nova=1
  useEffect(() => {
    if (ready && canWrite && new URLSearchParams(window.location.search).has("nova")) openNew();
  }, [ready, canWrite]);

  const move = (dir: -1 | 1) =>
    setCursor(
      effectiveView === "month"
        ? shiftMonth(cursor, dir)
        : addDaysIso(
            cursor,
            dir * (effectiveView === "week" ? 7 : effectiveView === "day" ? 1 : 30),
          ),
    );
  const title =
    effectiveView === "month"
      ? monthLabel(cursor)
      : effectiveView === "week"
        ? `${short(range.from)} – ${short(range.to)} ${range.to.slice(0, 4)}`
        : effectiveView === "day"
          ? `${dayName(cursor)} ${short(cursor)} ${cursor.slice(0, 4)}`
          : `Od ${short(cursor)}`;

  const layerChips = [
    ...(data?.connected !== false
      ? [{ key: LAYER_MINE, label: "Moje kalendáře", color: "blue" }]
      : []),
    ...(account.data?.canSeeAll && data?.connected !== false
      ? [
          {
            key: LAYER_OTHERS,
            label: `Kalendář: ${others?.userName.split(" ")[0] ?? "druhý"}`,
            color: "purple",
          },
        ]
      : []),
    ...(data?.layers ?? []),
  ];
  const countByLayer = (key: string) => all.filter((i) => layerOf(i) === key).length;
  const mine = account.data?.mine;

  const open = (it: Item) => setSelectedId(it.id);

  return (
    <div
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3 md:p-6"
      data-testid="calendar-page"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <IconButton label="Předchozí" onClick={() => move(-1)}>
              <ChevronLeft />
            </IconButton>
            <h2
              className="min-w-40 text-center text-lg font-semibold capitalize"
              aria-live="polite"
              data-testid="calendar-title"
            >
              {title}
            </h2>
            <IconButton label="Další" onClick={() => move(1)}>
              <ChevronRight />
            </IconButton>
          </div>
          <Button variant="secondary" onClick={() => setCursor(todayIso())}>
            Dnes
          </Button>
          <div
            className="flex min-h-8 gap-1 rounded-md border border-line-strong p-0.5"
            role="group"
            aria-label="Zobrazení"
          >
            {VIEWS.map(({ v, label, mobile: onMobile }) => (
              <button
                key={v}
                type="button"
                aria-pressed={effectiveView === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-3 font-medium",
                  !onMobile && "hidden md:block",
                  effectiveView === v ? "bg-accent text-accent-fg" : "text-muted hover:bg-hover",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {canWrite && (
            <Button
              variant="primary"
              className="sm:ml-auto"
              onClick={() => openNew()}
              data-testid="new-meeting"
            >
              <Plus /> Nová schůzka
            </Button>
          )}
        </div>

        {layerChips.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Vrstvy kalendáře"
          >
            {layerChips.map((l) => {
              const on = !hidden.includes(l.key);
              return (
                <button
                  key={l.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleLayer(l.key)}
                  data-testid={`layer-${l.key}`}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-sm",
                    on ? "border-line-strong" : "border-line text-faint line-through",
                  )}
                >
                  <Chip color={l.color.startsWith("#") ? "indigo" : l.color} dot>
                    {l.label}
                    {on && all.length > 0 && countByLayer(l.key) > 0
                      ? ` · ${countByLayer(l.key)}`
                      : ""}
                  </Chip>
                </button>
              );
            })}
          </div>
        )}

        {data && !data.connected && (
          <Notice tone="info" title="Google Kalendář není připojený">
            Vidíte jen úkoly a schůzky z OPSYS.{" "}
            <Link
              href="/nastaveni/google-kalendar"
              className="font-medium text-accent hover:underline"
            >
              Připojit Google Kalendář
            </Link>
          </Notice>
        )}
        {mine && mine.status !== "ok" && (
          <Notice
            tone="warning"
            title={
              mine.status === "reauth"
                ? "Připojení ke Googlu je třeba obnovit"
                : "Google Kalendář hlásí chybu"
            }
          >
            {mine.lastError ?? ""}{" "}
            <Link
              href="/nastaveni/google-kalendar"
              className="font-medium text-accent hover:underline"
            >
              Otevřít nastavení
            </Link>
          </Notice>
        )}

        {!ready || (!data && q.isLoading) ? (
          <Skeleton className="h-96" />
        ) : effectiveView === "month" ? (
          <MonthView
            cursor={cursor}
            items={items}
            selectedId={selectedId}
            canWrite={canWrite}
            coarse={coarse}
            onDay={(d) => openNew({ date: d })}
            onMore={(d) => {
              setCursor(d);
              setView("day");
            }}
            onOpen={open}
            onMove={doMove}
          />
        ) : effectiveView === "agenda" ? (
          <AgendaView from={range.from} items={items} selectedId={selectedId} onOpen={open} />
        ) : (
          <div className="flex h-[calc(100dvh-15rem)] min-h-[26rem] flex-col">
            <TimeGrid
              days={eachDayIso(range.from, range.to)}
              items={items}
              canWrite={canWrite}
              coarse={coarse}
              selectedId={selectedId}
              onOpen={open}
              onCreate={(req) => openNew(req)}
              onMove={doMove}
              onDayClick={
                effectiveView === "week"
                  ? (d) => {
                      setCursor(d);
                      setView("day");
                    }
                  : undefined
              }
            />
          </div>
        )}
        {q.error && (
          <p role="alert" className="text-sm text-danger">
            {q.error.message}
          </p>
        )}
      </div>

      <EventPanel
        item={selected ?? (selectedId ? lastSelected.current : null)}
        onClose={() => setSelectedId(null)}
      />
      <MeetingDialog draft={meeting} connected={connected} onClose={() => setMeeting(null)} />
    </div>
  );
}
