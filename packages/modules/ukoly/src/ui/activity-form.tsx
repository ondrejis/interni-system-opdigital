"use client";

/*
  Formulář aktivity (typ jako ikony, název, termín s časem, délka, řešitel, priorita, místo). Používá ho psací panel na
  kartách záznamů, dialog „Nový úkol“ a nabídka další aktivity po dokončení hovoru či schůzky.
*/
import { addDaysIso, localParts } from "@rebar/core/time";
import {
  Checkbox,
  DatePicker,
  Field,
  Icon,
  Input,
  SegmentedControl,
  cn,
  useEntityApi,
} from "@rebar/ui";
import type { CreateTaskInput, NextTaskSuggestion, TaskTypeDto } from "../contract";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from "../tasks/constants";
import { AssigneePicker, selectClass } from "./shared";

/** Hodnoty formuláře aktivity (datum a čas v pražském čase). */
export type ActivityValues = {
  typeKey: string;
  title: string;
  dueDate: string;
  dueTime: string;
  durationMin: number | null;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  place: string;
};

/** Vazby, které aktivita dostane (obchod, organizace, kontakt, zakázka, fáze). */
export type ActivityLinks = {
  dealId?: string | null | undefined;
  companyId?: string | null | undefined;
  personId?: string | null | undefined;
  jobId?: string | null | undefined;
  jobPhaseId?: string | null | undefined;
};

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

/** Výchozí čas nové schůzky či hovoru: příští celá hodina, po 17. hodině zítra v 9:00. */
export function defaultDue(now: Date = new Date()): { date: string; time: string } {
  const { date, time } = localParts(now);
  const hour = Number(time.slice(0, 2));
  if (hour >= 17) return { date: addDaysIso(date, 1), time: "09:00" };
  return { date, time: `${String(hour + 1).padStart(2, "0")}:00` };
}

/** Prázdný formulář: zadaný typ (jinak první), pro kalendářní typ termín nejbližší hodina, řešitel já. */
export function newActivityValues(
  types: readonly TaskTypeDto[],
  me: { id: string; name: string },
  typeKey?: string,
  now: Date = new Date(),
): ActivityValues {
  const type = types.find((t) => t.key === typeKey) ?? types[0];
  const due = type?.isCalendarEvent ? defaultDue(now) : { date: "", time: "" };
  return {
    typeKey: type?.key ?? "task",
    title: "",
    dueDate: due.date,
    dueTime: due.time,
    durationMin: type?.isCalendarEvent ? 30 : null,
    priority: "none",
    assigneeId: me.id,
    assigneeName: me.name,
    place: "",
  };
}

/** Formulář předvyplněný návrhem další aktivity (UKO-07). */
export function valuesFromSuggestion(
  s: NextTaskSuggestion,
  assigneeName: string | null,
): ActivityValues {
  return {
    typeKey: s.typeKey,
    title: s.title,
    dueDate: s.dueDate,
    dueTime: s.dueTime ?? "",
    durationMin: s.durationMin,
    priority: s.priority,
    assigneeId: s.assigneeId,
    assigneeName,
    place: "",
  };
}

/** Hodnoty formuláře → vstup `ukoly.create`. Prázdný název se nahradí názvem typu. */
export function toCreateInput(
  v: ActivityValues,
  types: readonly TaskTypeDto[],
  links: ActivityLinks,
  extra: Partial<CreateTaskInput> = {},
): CreateTaskInput {
  const typeName = types.find((t) => t.key === v.typeKey)?.name ?? "Úkol";
  const pick = <K extends keyof ActivityLinks>(k: K) => (links[k] ? { [k]: links[k] } : {});
  return {
    title: v.title.trim() || typeName,
    typeKey: v.typeKey,
    priority: v.priority,
    assigneeId: v.assigneeId,
    dueDate: v.dueDate || null,
    dueTime: v.dueDate && v.dueTime ? v.dueTime : null,
    durationMin: v.dueDate && v.dueTime ? v.durationMin : null,
    place: v.place.trim() || null,
    ...pick("dealId"),
    ...pick("companyId"),
    ...pick("personId"),
    ...pick("jobId"),
    ...pick("jobPhaseId"),
    ...extra,
  };
}

/** `Cmd+Enter` (Ctrl+Enter) odešle formulář. */
export function submitOnModEnter(submit: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };
}

/** Pole formuláře aktivity; řízená komponenta, odeslání řeší volající. */
export function ActivityForm({
  values,
  onChange,
  types,
  idPrefix,
  autoFocus,
  compact,
}: {
  values: ActivityValues;
  onChange: (next: ActivityValues) => void;
  types: readonly TaskTypeDto[];
  idPrefix: string;
  autoFocus?: boolean;
  /** Bez priority a místa. */
  compact?: boolean;
}) {
  const api = useEntityApi();
  const set = <K extends keyof ActivityValues>(k: K, v: ActivityValues[K]) =>
    onChange({ ...values, [k]: v });
  const type = types.find((t) => t.key === values.typeKey);

  function pickType(t: TaskTypeDto) {
    const next = { ...values, typeKey: t.key };
    // kalendářní typ bez termínu dostane nejbližší hodinu, ostatní si ponechají, co uživatel zadal
    if (t.isCalendarEvent && !values.dueDate) {
      const d = defaultDue();
      next.dueDate = d.date;
      next.dueTime = d.time;
      next.durationMin = values.durationMin ?? 30;
    }
    onChange(next);
  }

  return (
    <div className="space-y-3">
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
              <Icon name={t.icon ?? "check-square"} className="size-4" />
            </button>
          );
        })}
        {type && <span className="ml-1.5 text-sm font-medium text-muted">{type.name}</span>}
      </div>

      <Input
        id={`${idPrefix}-title`}
        aria-label="Název aktivity"
        placeholder={type ? `Název, např. ${type.name.toLowerCase()}` : "Název"}
        value={values.title}
        autoFocus={autoFocus ?? false}
        maxLength={300}
        onChange={(e) => set("title", e.target.value)}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-x-3">
        <Field label="Termín">
          <DatePicker
            value={values.dueDate || null}
            onChange={(d) =>
              onChange({ ...values, dueDate: d ?? "", ...(d ? {} : { dueTime: "" }) })
            }
            placeholder="Bez termínu"
          />
        </Field>
        <Field label="Čas" htmlFor={`${idPrefix}-time`}>
          <Input
            id={`${idPrefix}-time`}
            type="time"
            step={300}
            value={values.dueTime}
            disabled={!values.dueDate}
            onChange={(e) => set("dueTime", e.target.value)}
            className="w-28"
          />
        </Field>
        <Field label="Délka" htmlFor={`${idPrefix}-dur`}>
          <select
            id={`${idPrefix}-dur`}
            className={cn(selectClass, "w-28")}
            value={values.durationMin ?? ""}
            disabled={!values.dueTime}
            onChange={(e) => set("durationMin", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">bez délky</option>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d >= 60 ? `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60} min` : ""}` : `${d} min`}
              </option>
            ))}
            {values.durationMin && !DURATIONS.includes(values.durationMin) && (
              <option value={values.durationMin}>{values.durationMin} min</option>
            )}
          </select>
        </Field>
      </div>

      <Field label="Řešitel">
        <AssigneePicker
          value={values.assigneeId}
          name={values.assigneeName}
          onChange={(id) =>
            onChange({
              ...values,
              assigneeId: id,
              assigneeName: id === api.me.id ? api.me.name : null,
            })
          }
        />
      </Field>

      {!compact && (
        <>
          <div>
            <div className="mb-1.5 text-sm font-medium text-muted">Priorita</div>
            <SegmentedControl
              label="Priorita"
              value={values.priority}
              onChange={(p) => set("priority", p)}
              options={TASK_PRIORITIES.map((p) => ({
                value: p,
                label: TASK_PRIORITY_LABELS[p],
                tone: "neutral" as const,
              }))}
            />
          </div>
          <Field label="Místo" htmlFor={`${idPrefix}-place`}>
            <Input
              id={`${idPrefix}-place`}
              value={values.place}
              maxLength={300}
              placeholder="Adresa nebo odkaz na schůzku"
              onChange={(e) => set("place", e.target.value)}
            />
          </Field>
        </>
      )}
    </div>
  );
}

/** Zaškrtávací pole s popiskem (drobnost pro formuláře úkolů). */
export function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-base">
      <Checkbox checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      {children}
    </label>
  );
}
