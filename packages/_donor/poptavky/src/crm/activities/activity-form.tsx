"use client";

import { addDaysIso, localParts } from "@rebar/core/time";
import {
  Checkbox,
  Combobox,
  DatePicker,
  Field,
  Icon,
  Input,
  SegmentedControl,
  Textarea,
  cn,
  useEntityApi,
} from "@rebar/ui";
import { useRef, type KeyboardEvent } from "react";
import { dueFromInput, dueToInput } from "./logic";
import type { ActivityTarget } from "./ui-shared";
import {
  PRIORITY_LABELS,
  type ActivityDraft,
  type ActivityDto,
  type ActivityPriority,
  type ActivityTypeDto,
  type NextActivitySuggestion,
} from "./types";

/** Hodnoty formuláře aktivity (datum a čas v pražském čase, ne ISO). */
export type FormValues = {
  typeKey: string;
  subject: string;
  date: string;
  time: string;
  allDay: boolean;
  durationMin: number | null;
  priority: ActivityPriority;
  location: string;
  note: string;
  assigneeId: string | null;
  /** Jméno přiřazeného pro popisek výběru (když není mezi načtenými možnostmi). */
  assigneeName: string | null;
};

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

const selectClass =
  "h-8 w-full rounded-md border border-line-strong bg-bg px-2 text-base text-fg transition-colors hover:border-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] disabled:opacity-50";

/** Výchozí termín nové aktivity: dnes v nejbližší celou hodinu, po 18. hodině zítra v 9:00. */
export function defaultDue(now: Date = new Date()): { date: string; time: string } {
  const { date, time } = localParts(now);
  const hour = Number(time.slice(0, 2));
  if (hour >= 17) return { date: addDaysIso(date, 1), time: "09:00" };
  return { date, time: `${String(hour + 1).padStart(2, "0")}:00` };
}

/** Prázdný formulář: první typ (nebo zadaný klíč), termín nejbližší hodina, přiřazeno mně. */
export function newValues(
  types: readonly ActivityTypeDto[],
  me: { id: string; name: string },
  typeKey?: string,
): FormValues {
  const type = types.find((t) => t.key === typeKey) ?? types[0];
  return {
    typeKey: type?.key ?? "task",
    subject: "",
    ...defaultDue(),
    allDay: false,
    durationMin: type?.defaultDurationMin ?? null,
    priority: "normal",
    location: "",
    note: "",
    assigneeId: me.id,
    assigneeName: me.name,
  };
}

/** Formulář předvyplněný ze stávající aktivity (úprava). */
export function valuesFromActivity(a: ActivityDto): FormValues {
  const due = dueToInput(a.dueAt, a.allDay);
  return {
    typeKey: a.typeKey,
    subject: a.subject,
    date: due.date,
    time: due.time,
    allDay: a.allDay,
    durationMin: a.durationMin,
    priority: a.priority,
    location: a.location ?? "",
    note: a.note ?? "",
    assigneeId: a.assigneeId,
    assigneeName: a.assigneeName,
  };
}

/** Formulář předvyplněný návrhem další aktivity po dokončení. */
export function valuesFromSuggestion(
  s: NextActivitySuggestion,
  assigneeName: string | null,
): FormValues {
  const due = dueToInput(s.dueAt, s.allDay);
  return {
    typeKey: s.typeKey,
    subject: s.subject,
    date: due.date,
    time: due.time,
    allDay: s.allDay,
    durationMin: s.durationMin,
    priority: s.priority,
    location: s.location ?? "",
    note: "",
    assigneeId: s.assigneeId,
    assigneeName,
  };
}

/** Hodnoty formuláře → vstup příkazu `crm.activity.create`. Prázdný předmět se nahradí názvem typu. */
export function toDraft(
  v: FormValues,
  types: readonly ActivityTypeDto[],
  target: ActivityTarget,
): ActivityDraft {
  const typeName = types.find((t) => t.key === v.typeKey)?.name ?? "Aktivita";
  return {
    typeKey: v.typeKey,
    subject: v.subject.trim() || typeName,
    dueAt: v.date ? dueFromInput(v.date, v.time, v.allDay) : null,
    allDay: v.allDay && !!v.date,
    durationMin: v.allDay ? null : v.durationMin,
    priority: v.priority,
    location: v.location.trim() || null,
    note: v.note.trim() || null,
    assigneeId: v.assigneeId,
    ...(target.jobId ? { jobId: target.jobId } : {}),
    ...(target.companyId ? { companyId: target.companyId } : {}),
    ...(target.personId ? { personId: target.personId } : {}),
  };
}

/** `Cmd+Enter` (na Windows `Ctrl+Enter`) odešle formulář. */
export function submitOnModEnter(submit: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };
}

/**
 * Pole formuláře aktivity: typ jako ikony, předmět, datum a čas (nebo celý den), délka, přiřazeno a v rozbalení priorita,
 * místo a poznámka. Řízená komponenta; odeslání (`Cmd+Enter`, tlačítko) řeší volající.
 */
export function ActivityForm({
  values,
  onChange,
  types,
  autoFocus,
  selectSubject,
  idPrefix,
  compact,
}: {
  values: FormValues;
  onChange: (next: FormValues) => void;
  types: readonly ActivityTypeDto[];
  autoFocus?: boolean;
  /** Při zaměření označí celý předmět (návrh další aktivity se přepíše psaním). */
  selectSubject?: boolean;
  idPrefix: string;
  compact?: boolean;
}) {
  const api = useEntityApi();
  const durationTouched = useRef(false);
  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) =>
    onChange({ ...values, [k]: v });
  const type = types.find((t) => t.key === values.typeKey);

  function pickType(t: ActivityTypeDto) {
    onChange({
      ...values,
      typeKey: t.key,
      durationMin: durationTouched.current ? values.durationMin : (t.defaultDurationMin ?? null),
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <div
          className="flex flex-wrap items-center gap-1"
          role="radiogroup"
          aria-label="Typ aktivity"
        >
          {types.map((t) => {
            const on = t.key === values.typeKey;
            return (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={t.name}
                title={t.name}
                onClick={() => pickType(t)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md border transition-colors pointer-coarse:size-11",
                  on
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line-strong text-muted hover:bg-hover hover:text-fg",
                )}
              >
                <Icon name={t.icon} className="size-4" />
              </button>
            );
          })}
          {type && <span className="ml-1.5 text-sm font-medium text-muted">{type.name}</span>}
        </div>
      </div>

      <Input
        id={`${idPrefix}-subject`}
        aria-label="Předmět aktivity"
        placeholder={type ? `Předmět, např. ${type.name.toLowerCase()}` : "Předmět"}
        value={values.subject}
        autoFocus={autoFocus ?? false}
        maxLength={200}
        onFocus={(e) => selectSubject && e.currentTarget.select()}
        onChange={(e) => set("subject", e.target.value)}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3">
        <Field label="Termín">
          <DatePicker
            value={values.date || null}
            onChange={(d) => set("date", d ?? "")}
            placeholder="Bez termínu"
          />
        </Field>
        {!values.allDay && (
          <Field label="Čas" htmlFor={`${idPrefix}-time`}>
            <Input
              id={`${idPrefix}-time`}
              type="time"
              step={300}
              value={values.time}
              disabled={!values.date}
              onChange={(e) => set("time", e.target.value)}
              className="w-28"
            />
          </Field>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-base">
          <Checkbox
            checked={values.allDay}
            disabled={!values.date}
            onCheckedChange={(c) => set("allDay", c === true)}
          />
          Celý den
        </label>
        {!values.allDay && (
          <label className="flex items-center gap-2 text-base">
            <span className="text-muted">Délka</span>
            <select
              aria-label="Délka aktivity"
              className={cn(selectClass, "w-28")}
              value={values.durationMin ?? ""}
              onChange={(e) => {
                durationTouched.current = true;
                set("durationMin", e.target.value ? Number(e.target.value) : null);
              }}
            >
              <option value="">bez délky</option>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d >= 60
                    ? `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60} min` : ""}`
                    : `${d} min`}
                </option>
              ))}
              {values.durationMin && !DURATIONS.includes(values.durationMin) && (
                <option value={values.durationMin}>{values.durationMin} min</option>
              )}
            </select>
          </label>
        )}
      </div>

      <Field label="Přiřazeno">
        <Combobox
          aria-label="Přiřazeno"
          load={api.lookups.users}
          value={values.assigneeId}
          selectedLabels={
            values.assigneeId && values.assigneeName
              ? { [values.assigneeId]: values.assigneeName }
              : {}
          }
          onChange={(v) => {
            const id = (v as string | null) ?? null;
            onChange({
              ...values,
              assigneeId: id,
              assigneeName: id === api.me.id ? api.me.name : null,
            });
          }}
          placeholder="Nepřiřazeno"
          searchPlaceholder="Hledat uživatele…"
          clearable
        />
      </Field>

      {!compact && (
        <details className="group rounded-md border border-line">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-muted hover:text-fg">
            <Icon
              name="chevron-right"
              className="size-3.5 transition-transform group-open:rotate-90"
            />
            Další údaje
          </summary>
          <div className="space-y-3 border-t border-line p-2.5">
            <div>
              <div className="mb-1.5 text-sm font-medium text-muted">Priorita</div>
              <SegmentedControl
                label="Priorita"
                value={values.priority}
                onChange={(p) => set("priority", p)}
                options={(Object.keys(PRIORITY_LABELS) as ActivityPriority[]).map((p) => ({
                  value: p,
                  label: PRIORITY_LABELS[p],
                  tone: "neutral" as const,
                }))}
              />
            </div>
            <Field label="Místo" htmlFor={`${idPrefix}-location`}>
              <Input
                id={`${idPrefix}-location`}
                value={values.location}
                maxLength={300}
                placeholder="Adresa nebo odkaz na schůzku"
                onChange={(e) => set("location", e.target.value)}
              />
            </Field>
            <Field label="Poznámka" htmlFor={`${idPrefix}-note`}>
              <Textarea
                id={`${idPrefix}-note`}
                rows={3}
                value={values.note}
                maxLength={5000}
                onChange={(e) => set("note", e.target.value)}
              />
            </Field>
          </div>
        </details>
      )}
    </div>
  );
}
