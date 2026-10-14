"use client";

import { formatDate } from "@rebar/core/shared";
import { addDaysIso, eachDayIso, formatInstant, todayIso, weekStartIso } from "@rebar/core/time";
import {
  Button,
  Checkbox,
  Chip,
  Combobox,
  ConfirmDialog,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  IconButton,
  Input,
  Skeleton,
  Textarea,
  cn,
  defineModuleUi,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useModuleUi,
  useNav,
} from "@rebar/ui";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { EVENT_TYPES } from "./catalog";
import { dayComparator } from "./day-order";
import { RECURRENCES } from "./recurrence";

/* ---------- typy a pomocníci ---------- */

type Item = {
  id: string;
  kind: "event" | "busy" | "layer" | "holiday";
  layer: string | null;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  href: string | null;
  eventId: string | null;
  type: string | null;
  location: string | null;
  owner: string | null;
  own: boolean;
  resource: string | null;
  attendees: string[];
  recurring: boolean;
  canEdit: boolean;
};
type RangeData = {
  items: Item[];
  layers: { key: string; label: string; color: string }[];
  canWrite: boolean;
  canSeeAll: boolean;
};

const DAY_NAMES = ["po", "út", "st", "čt", "pá", "so", "ne"];
const dayName = (d: string) => DAY_NAMES[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7]!;
const dateOf = (s: string) => s.slice(0, 10);
const timeOf = (s: string) => (s.length > 10 ? s.slice(11, 16) : "");

/** Poslední den, který položka zasahuje (konec přesně o půlnoci patří předchozímu dni). */
function lastDay(it: Item): string {
  const end = dateOf(it.end);
  if (!it.allDay && timeOf(it.end) === "00:00" && end > dateOf(it.start))
    return addDaysIso(end, -1);
  return end < dateOf(it.start) ? dateOf(it.start) : end;
}
const touches = (it: Item, day: string) => dateOf(it.start) <= day && lastDay(it) >= day;

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

function Err({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error.message}
    </p>
  ) : null;
}

const LAYER_KEY = "kalendar.hiddenLayers";
function loadHidden(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(LAYER_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function saveHidden(v: string[]) {
  try {
    window.localStorage.setItem(LAYER_KEY, JSON.stringify(v));
  } catch {
    // ukládání je jen pohodlí
  }
}

/* ---------- formulář události ---------- */

type Draft = {
  id: string | null;
  title: string;
  type: string;
  allDay: boolean;
  startDate: string | null;
  startTime: string;
  endDate: string | null;
  endTime: string;
  location: string;
  note: string;
  resourceId: string | null;
  jobId: string | null;
  jobTitle: string | null;
  attendees: { id: string; name: string }[];
  recurrence: string | null;
  recurrenceUntil: string | null;
  reminderMinutes: number | null;
};

const blankDraft = (date: string): Draft => ({
  id: null,
  title: "",
  type: "meeting",
  allDay: false,
  startDate: date,
  startTime: "09:00",
  endDate: date,
  endTime: "10:00",
  location: "",
  note: "",
  resourceId: null,
  jobId: null,
  jobTitle: null,
  attendees: [],
  recurrence: null,
  recurrenceUntil: null,
  reminderMinutes: null,
});

type EventData = {
  id: string;
  title: string;
  type: string;
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  endDate: string;
  endTime: string | null;
  location: string | null;
  note: string | null;
  resourceId: string | null;
  jobId: string | null;
  jobTitle: string | null;
  attendees: { id: string; name: string }[];
  recurrence: string | null;
  recurrenceUntil: string | null;
  reminderMinutes: number | null;
  canEdit: boolean;
};

function EventForm({
  draft: initial,
  readOnly,
  onDone,
}: {
  draft: Draft;
  readOnly: boolean;
  onDone: () => void;
}) {
  const api = useEntityApi();
  const hasJobs = useModuleUi().has("zakazky");
  const options = useCommandQuery<{ resources: { id: string; name: string }[] }>(
    "kalendar.options",
    {},
  );
  const [d, setD] = useState(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const save = useCommandMutation<Record<string, unknown>>("kalendar.event.save", {
    onSuccess: () => {
      successToast(d.id ? "Událost uložena." : "Událost vytvořena.");
      onDone();
    },
  });
  const del = useCommandMutation<{ id: string }>("kalendar.event.delete", {
    onSuccess: () => {
      successToast("Událost zrušena.");
      onDone();
    },
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (readOnly) return;
        save.mutate({
          ...(d.id ? { id: d.id } : {}),
          title: d.title,
          type: d.type,
          allDay: d.allDay,
          startDate: d.startDate,
          startTime: d.allDay ? null : d.startTime,
          endDate: d.endDate,
          endTime: d.allDay ? null : d.endTime,
          location: d.location || null,
          note: d.note || null,
          resourceId: d.resourceId,
          jobId: d.jobId,
          attendeeIds: d.attendees.map((a) => a.id),
          recurrence: d.recurrence,
          recurrenceUntil: d.recurrence ? d.recurrenceUntil : null,
          reminderMinutes: d.reminderMinutes,
        });
      }}
    >
      <fieldset disabled={readOnly} className="space-y-3">
        <Field label="Název" htmlFor="ev-title">
          <Input id="ev-title" value={d.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Typ">
            <Combobox
              options={EVENT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              value={d.type}
              onChange={(v) => v && set("type", v as string)}
              aria-label="Typ události"
            />
          </Field>
          <label className="mb-3 flex h-8 cursor-pointer items-center gap-2 self-end">
            <Checkbox checked={d.allDay} onCheckedChange={(v) => set("allDay", !!v)} /> Celý den
          </label>
        </div>
        <div className="grid grid-cols-[1fr_6.5rem] gap-x-3">
          <Field label="Začátek">
            <DatePicker
              value={d.startDate}
              onChange={(v) => {
                set("startDate", v);
                if (v && (!d.endDate || d.endDate < v)) set("endDate", v);
              }}
              clearable={false}
            />
          </Field>
          {!d.allDay && (
            <Field label="v" htmlFor="ev-start-time">
              <Input
                id="ev-start-time"
                type="time"
                value={d.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </Field>
          )}
          <Field label="Konec">
            <DatePicker value={d.endDate} onChange={(v) => set("endDate", v)} clearable={false} />
          </Field>
          {!d.allDay && (
            <Field label="v" htmlFor="ev-end-time">
              <Input
                id="ev-end-time"
                type="time"
                value={d.endTime}
                onChange={(e) => set("endTime", e.target.value)}
              />
            </Field>
          )}
        </div>
        <Field label="Místo" htmlFor="ev-location">
          <Input
            id="ev-location"
            value={d.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </Field>
        <Field label="Účastníci">
          <Combobox
            multiple
            load={(s) => api.lookups.users(s)}
            value={d.attendees.map((a) => a.id)}
            selectedLabels={Object.fromEntries(d.attendees.map((a) => [a.id, a.name]))}
            onChange={(v) => {
              const ids = v as string[];
              set(
                "attendees",
                ids.map((id) => ({
                  id,
                  name: d.attendees.find((a) => a.id === id)?.name ?? id,
                })),
              );
            }}
            aria-label="Účastníci"
            placeholder="Jen já"
          />
        </Field>
        <div className="grid gap-x-3 sm:grid-cols-2">
          {(options.data?.resources.length ?? 0) > 0 && (
            <Field
              label="Zdroj"
              hint="Místnost nebo vybavení; hlídá se, aby nebyl obsazený dvakrát."
            >
              <Combobox
                options={(options.data?.resources ?? []).map((r) => ({
                  value: r.id,
                  label: r.name,
                }))}
                value={d.resourceId}
                onChange={(v) => set("resourceId", v as string | null)}
                aria-label="Zdroj"
                placeholder="Bez zdroje"
                clearable
              />
            </Field>
          )}
          {hasJobs && (
            <Field label="Zakázka">
              <Combobox
                load={(s) => api.lookups.records("job", s)}
                value={d.jobId}
                selectedLabels={d.jobId && d.jobTitle ? { [d.jobId]: d.jobTitle } : {}}
                onChange={(v) => set("jobId", v as string | null)}
                aria-label="Zakázka"
                placeholder="Bez zakázky"
                clearable
              />
            </Field>
          )}
          <Field label="Opakování">
            <Combobox
              options={RECURRENCES.map((r) => ({ value: r.value, label: r.label }))}
              value={d.recurrence}
              onChange={(v) => set("recurrence", v as string | null)}
              aria-label="Opakování"
              placeholder="Neopakovat"
              clearable
            />
          </Field>
          {d.recurrence && (
            <Field label="Opakovat do">
              <DatePicker
                value={d.recurrenceUntil}
                onChange={(v) => set("recurrenceUntil", v)}
                placeholder="Bez konce"
              />
            </Field>
          )}
          <Field label="Připomenutí">
            <Combobox
              options={[
                { value: "15", label: "15 minut předem" },
                { value: "60", label: "1 hodinu předem" },
                { value: "1440", label: "Den předem" },
              ]}
              value={d.reminderMinutes === null ? null : String(d.reminderMinutes)}
              onChange={(v) => set("reminderMinutes", v ? Number(v) : null)}
              aria-label="Připomenutí"
              placeholder="Bez připomenutí"
              clearable
            />
          </Field>
        </div>
        <Field label="Poznámka" htmlFor="ev-note">
          <Textarea
            id="ev-note"
            className="min-h-16"
            value={d.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
      </fieldset>
      <Err error={save.error ?? del.error} />
      <div className="flex items-center justify-between gap-2">
        {d.id && !readOnly ? (
          <Button
            type="button"
            variant="ghost"
            className="text-danger"
            loading={del.isPending}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 /> Zrušit událost
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            {readOnly ? "Zavřít" : "Zpět"}
          </Button>
          {!readOnly && (
            <Button type="submit" variant="primary" loading={save.isPending}>
              Uložit
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Zrušit událost"
        description={d.title}
        confirmLabel="Zrušit událost"
        cancelLabel="Ponechat"
        danger
        onConfirm={() =>
          // chybu ukáže `Err` ve formuláři, dialog se zavře
          del.mutateAsync({ id: d.id! }).then(
            () => undefined,
            () => undefined,
          )
        }
      >
        Zrušit tuto událost? Opakovaná událost se zruší celá.
      </ConfirmDialog>
    </form>
  );
}

function EventDialog({
  target,
  onClose,
}: {
  target: { eventId: string | null; date: string } | null;
  onClose: () => void;
}) {
  const q = useCommandQuery<EventData>(
    "kalendar.event.get",
    { id: target?.eventId },
    { enabled: !!target?.eventId },
  );
  const open = !!target;
  const draft =
    target?.eventId && q.data
      ? ({
          id: q.data.id,
          title: q.data.title,
          type: q.data.type,
          allDay: q.data.allDay,
          startDate: q.data.startDate,
          startTime: q.data.startTime ?? "09:00",
          endDate: q.data.endDate,
          endTime: q.data.endTime ?? "10:00",
          location: q.data.location ?? "",
          note: q.data.note ?? "",
          resourceId: q.data.resourceId,
          jobId: q.data.jobId,
          jobTitle: q.data.jobTitle,
          attendees: q.data.attendees,
          recurrence: q.data.recurrence,
          recurrenceUntil: q.data.recurrenceUntil,
          reminderMinutes: q.data.reminderMinutes,
        } satisfies Draft)
      : null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={target?.eventId ? "Událost" : "Nová událost"}
        className="w-[min(40rem,calc(100vw-2rem))]"
      >
        {open &&
          (target?.eventId ? (
            draft ? (
              <EventForm
                key={draft.id}
                draft={draft}
                readOnly={!q.data!.canEdit}
                onDone={onClose}
              />
            ) : (
              <Skeleton className="m-5 h-64" />
            )
          ) : (
            <EventForm
              draft={blankDraft(target?.date ?? todayIso())}
              readOnly={false}
              onDone={onClose}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- odběr a import ---------- */

function SubscribePanel({ onClose }: { onClose: () => void }) {
  const status = useCommandQuery<{ exists: boolean; lastFetchAt: string | null }>(
    "kalendar.feed.status",
    {},
  );
  const imports = useCommandQuery<
    {
      id: string;
      name: string;
      lastSyncAt: string | null;
      lastError: string | null;
      eventCount: number;
    }[]
  >("kalendar.import.list", {});
  const [url, setUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const regenerate = useCommandMutation<Record<string, never>, { url: string }>(
    "kalendar.feed.regenerate",
    { onSuccess: (r) => setUrl(r.url) },
  );
  const add = useCommandMutation<{ name: string; url: string }, { count: number }>(
    "kalendar.import.add",
    {
      onSuccess: (r) => {
        successToast(`Kalendář připojen, načteno událostí: ${r.count}.`);
        setName("");
        setAddress("");
      },
    },
  );
  const sync = useCommandMutation<{ id: string }, { count: number }>("kalendar.import.sync", {
    onSuccess: (r) => successToast(`Synchronizováno, událostí: ${r.count}.`),
  });
  const remove = useCommandMutation<{ id: string }>("kalendar.import.delete");
  const [disconnect, setDisconnect] = useState<{ id: string; name: string } | null>(null);
  return (
    <div className="space-y-4 px-5 py-4">
      <section className="space-y-2">
        <h3 className="font-semibold">Odebírat kalendář v telefonu nebo e-mailu</h3>
        <p className="text-muted">
          Vytvoří tajný odkaz, který vložíte v Googlu, Apple Kalendáři nebo Outlooku jako „přidat
          kalendář z adresy“. Uvidíte v něm své události a ty, na které jste pozvaní.
        </p>
        {url && (
          <div className="space-y-1" data-testid="feed-url">
            <Input
              readOnly
              aria-label="Adresa odběru"
              value={url}
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="text-sm text-warning">
              Adresu si teď zkopírujte, znovu se nezobrazí. Kdo ji zná, vidí váš kalendář.
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            loading={regenerate.isPending}
            onClick={() => regenerate.mutate({})}
          >
            {status.data?.exists ? "Vytvořit nový odkaz" : "Vytvořit odkaz"}
          </Button>
          {status.data?.exists && (
            <span className="text-sm text-muted">
              {status.data.lastFetchAt
                ? `Naposledy staženo ${formatInstant(status.data.lastFetchAt, { year: true })}`
                : "Zatím nikdo nestáhl"}
              . Nový odkaz zneplatní starý.
            </span>
          )}
        </div>
        <Err error={regenerate.error} />
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Připojit cizí kalendář</h3>
        <p className="text-muted">
          Vložte tajnou adresu iCal z Googlu nebo iCloudu. Vaše schůzky se u vás zobrazí jako
          „obsazeno“, nikam se dál neposílají.
        </p>
        {(imports.data ?? []).length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line" data-testid="imports">
            {imports.data!.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-32 flex-1 font-medium">{i.name}</span>
                {i.lastError ? (
                  <Chip color="red">{i.lastError}</Chip>
                ) : (
                  <span className="text-sm text-muted">
                    {i.eventCount} událostí
                    {i.lastSyncAt ? `, ${formatInstant(i.lastSyncAt, { year: true })}` : ""}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  loading={sync.isPending}
                  onClick={() => sync.mutate({ id: i.id })}
                >
                  Obnovit
                </Button>
                <IconButton
                  label={`Odpojit ${i.name}`}
                  onClick={() => setDisconnect({ id: i.id, name: i.name })}
                >
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate({ name, url: address });
          }}
        >
          <Input
            aria-label="Název kalendáře"
            placeholder="Název"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            aria-label="Adresa kalendáře"
            placeholder="https://… nebo webcal://…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Button type="submit" variant="primary" loading={add.isPending}>
            Připojit
          </Button>
        </form>
        <Err error={add.error ?? sync.error ?? remove.error} />
      </section>
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Zavřít
        </Button>
      </div>
      <ConfirmDialog
        open={disconnect !== null}
        onOpenChange={(o) => !o && setDisconnect(null)}
        title="Odpojit kalendář"
        description={disconnect?.name ?? ""}
        confirmLabel="Odpojit"
        danger
        onConfirm={() =>
          remove.mutateAsync({ id: disconnect!.id }).then(
            () => undefined,
            () => undefined,
          )
        }
      >
        {`Odpojit kalendář „${disconnect?.name ?? ""}“?`}
      </ConfirmDialog>
    </div>
  );
}

/* ---------- zobrazení ---------- */

function ItemChip({ it, onOpen }: { it: Item; onOpen: (it: Item) => void }) {
  const { Link } = useNav();
  const label = (
    <>
      {!it.allDay && it.kind !== "holiday" && (
        <span className="tabular mr-1">{timeOf(it.start)}</span>
      )}
      {it.title}
    </>
  );
  const cls = cn(
    "block w-full truncate rounded px-1.5 py-0.5 text-left text-xs",
    it.kind === "busy" && "opacity-70",
  );
  if (it.kind === "holiday")
    return (
      <div className="truncate px-1 text-xs text-danger" title={it.title}>
        {it.title}
      </div>
    );
  const chip = (
    <Chip color={it.color} className={cls} title={it.title}>
      {label}
    </Chip>
  );
  if (it.kind === "event" || it.kind === "busy")
    return (
      <button
        type="button"
        className="block w-full"
        onClick={() => it.eventId && onOpen(it)}
        data-testid="calendar-item"
        aria-label={`${it.title}${it.allDay ? "" : ` ${timeOf(it.start)}`}`}
      >
        {chip}
      </button>
    );
  return it.href ? (
    <Link href={it.href} className="block w-full" data-testid="calendar-item">
      {chip}
    </Link>
  ) : (
    <div data-testid="calendar-item">{chip}</div>
  );
}

function MonthView({
  cursor,
  items,
  onDay,
  onMore,
  onOpen,
}: {
  cursor: string;
  items: Item[];
  onDay: (d: string) => void;
  onMore: (d: string) => void;
  onOpen: (it: Item) => void;
}) {
  const first = `${cursor.slice(0, 7)}-01`;
  const start = weekStartIso(first);
  const days = eachDayIso(start, addDaysIso(start, 41));
  const today = todayIso();
  return (
    <div className="overflow-hidden rounded-lg border border-line" data-testid="month-grid">
      <div className="grid grid-cols-7 bg-subtle text-center text-sm text-muted">
        {DAY_NAMES.map((n) => (
          <div key={n} className="py-1.5 font-medium">
            {n}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 divide-x divide-y divide-line">
        {days.map((d) => {
          const here = items.filter((it) => touches(it, d)).sort(sortDay(d));
          const other = d.slice(0, 7) !== first.slice(0, 7);
          return (
            <div
              key={d}
              className={cn("min-h-24 p-1", other && "bg-subtle/50 text-muted")}
              data-day={d}
            >
              <button
                type="button"
                aria-label={`Nová událost ${formatDate(d)}`}
                onClick={() => onDay(d)}
                className={cn(
                  "mb-1 ml-auto flex size-6 items-center justify-center rounded-full text-sm hover:bg-hover",
                  d === today && "bg-accent font-semibold text-accent-fg hover:bg-accent",
                )}
              >
                {Number(d.slice(8))}
              </button>
              <div className="space-y-0.5">
                {here.slice(0, 3).map((it) => (
                  <ItemChip key={`${it.id}-${d}`} it={it} onOpen={onOpen} />
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

/** Právě teď v místním čase (`YYYY-MM-DDTHH:mm`), tak jako časy položek. */
function nowLocalIso() {
  const n = new Date();
  const p = (v: number) => String(v).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}T${p(n.getHours())}:${p(n.getMinutes())}`;
}
const sortDay = (day: string) => dayComparator(day, nowLocalIso());

function WeekView({
  start,
  items,
  onDay,
  onOpen,
}: {
  start: string;
  items: Item[];
  onDay: (d: string) => void;
  onOpen: (it: Item) => void;
}) {
  const today = todayIso();
  return (
    <div className="grid gap-2 sm:grid-cols-7" data-testid="week-grid">
      {eachDayIso(start, addDaysIso(start, 6)).map((d) => (
        <section
          key={d}
          aria-label={formatDate(d)}
          className={cn(
            "min-h-40 rounded-lg border border-line p-2",
            d === today && "border-accent",
          )}
        >
          <button
            type="button"
            className="mb-2 text-sm font-medium hover:underline"
            onClick={() => onDay(d)}
          >
            {dayName(d)} {Number(d.slice(8))}.
          </button>
          <div className="space-y-1">
            {items
              .filter((it) => touches(it, d))
              .sort(sortDay(d))
              .map((it) => (
                <ItemChip key={`${it.id}-${d}`} it={it} onOpen={onOpen} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AgendaView({
  from,
  items,
  onOpen,
}: {
  from: string;
  items: Item[];
  onOpen: (it: Item) => void;
}) {
  const days = eachDayIso(from, addDaysIso(from, 29)).filter((d) =>
    items.some((it) => touches(it, d) && it.kind !== "holiday"),
  );
  if (!days.length) return <p className="text-muted">V příštích 30 dnech nic není.</p>;
  return (
    <div className="space-y-3" data-testid="agenda">
      {days.map((d) => (
        <section key={d}>
          <h3 className="mb-1 font-semibold">
            {dayName(d)} {formatDate(d)}
          </h3>
          <ul className="space-y-1">
            {items
              .filter((it) => touches(it, d) && it.kind !== "holiday")
              .sort(sortDay(d))
              .map((it) => (
                <li key={`${it.id}-${d}`} className="flex items-center gap-2">
                  <span className="tabular w-24 shrink-0 text-muted">
                    {it.allDay ? "Celý den" : `${timeOf(it.start)}–${timeOf(it.end)}`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <ItemChip it={it} onOpen={onOpen} />
                  </div>
                  <span className="hidden truncate text-sm text-muted sm:inline">
                    {[it.location, it.resource, it.owner].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CalendarPage() {
  const can = useCan();
  const [view, setView] = useState<"month" | "week" | "agenda">("month");
  const [cursor, setCursor] = useState(todayIso());
  const [who, setWho] = useState<"me" | "all">("me");
  const [hidden, setHidden] = useState<string[]>(loadHidden);
  const [dialog, setDialog] = useState<{ eventId: string | null; date: string } | null>(null);
  const [subscribe, setSubscribe] = useState(false);

  const range =
    view === "month"
      ? (() => {
          const s = weekStartIso(`${cursor.slice(0, 7)}-01`);
          return { from: s, to: addDaysIso(s, 41) };
        })()
      : view === "week"
        ? { from: weekStartIso(cursor), to: addDaysIso(weekStartIso(cursor), 6) }
        : { from: cursor, to: addDaysIso(cursor, 29) };
  const q = useCommandQuery<RangeData>("kalendar.range", { ...range, who });

  const items = (q.data?.items ?? []).filter((it) => !it.layer || !hidden.includes(it.layer));
  const move = (dir: -1 | 1) =>
    setCursor(
      view === "month"
        ? shiftMonth(cursor, dir)
        : addDaysIso(cursor, dir * (view === "week" ? 7 : 30)),
    );
  const title =
    view === "month"
      ? monthLabel(cursor)
      : view === "week"
        ? `${formatDate(range.from)} – ${formatDate(range.to)}`
        : `Od ${formatDate(cursor)}`;
  const toggle = (key: string) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    setHidden(next);
    saveHidden(next);
  };
  const open = (it: Item) =>
    it.eventId && setDialog({ eventId: it.eventId, date: dateOf(it.start) });

  return (
    <div
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
      data-testid="calendar-page"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <IconButton label="Předchozí" onClick={() => move(-1)}>
              <ChevronLeft />
            </IconButton>
            <h2
              className="min-w-44 text-center text-lg font-semibold capitalize"
              aria-live="polite"
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
            {(
              [
                ["month", "Měsíc"],
                ["week", "Týden"],
                ["agenda", "Agenda"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-3 font-medium",
                  view === v ? "bg-accent text-accent-fg" : "text-muted hover:bg-hover",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {q.data?.canSeeAll && (
            <Button
              variant={who === "all" ? "primary" : "secondary"}
              aria-pressed={who === "all"}
              onClick={() => setWho(who === "all" ? "me" : "all")}
            >
              Všichni
            </Button>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="secondary" onClick={() => setSubscribe(true)}>
              Odběr a import
            </Button>
            {can("kalendar.write") && (
              <Button variant="primary" onClick={() => setDialog({ eventId: null, date: cursor })}>
                Nová událost
              </Button>
            )}
          </div>
        </div>

        {(q.data?.layers.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Vrstvy kalendáře">
            {q.data!.layers.map((l) => {
              const on = !hidden.includes(l.key);
              return (
                <button
                  key={l.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(l.key)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-sm",
                    on ? "border-line-strong" : "border-line text-faint line-through",
                  )}
                >
                  <Chip color={l.color} dot>
                    {l.label}
                  </Chip>
                </button>
              );
            })}
          </div>
        )}

        {q.isLoading ? (
          <Skeleton className="h-96" />
        ) : view === "month" ? (
          <MonthView
            cursor={cursor}
            items={items}
            onMore={(d) => {
              setCursor(d);
              setView("week");
            }}
            onDay={(d) => can("kalendar.write") && setDialog({ eventId: null, date: d })}
            onOpen={open}
          />
        ) : view === "week" ? (
          <WeekView
            start={range.from}
            items={items}
            onDay={(d) => can("kalendar.write") && setDialog({ eventId: null, date: d })}
            onOpen={open}
          />
        ) : (
          <AgendaView from={range.from} items={items} onOpen={open} />
        )}
        <Err error={q.error} />
      </div>

      <EventDialog target={dialog} onClose={() => setDialog(null)} />
      <Dialog open={subscribe} onOpenChange={(o) => !o && setSubscribe(false)}>
        <DialogContent title="Odběr a import kalendáře" className="w-[min(40rem,calc(100vw-2rem))]">
          {subscribe && <SubscribePanel onClose={() => setSubscribe(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const ui = defineModuleUi({
  pages: [{ path: "/kalendar", render: () => <CalendarPage /> }],
});
