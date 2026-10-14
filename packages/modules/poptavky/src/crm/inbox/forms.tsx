"use client";

import { addDaysIso, todayIso, zonedToUtc } from "@rebar/core/time";
import {
  Button,
  Checkbox,
  Combobox,
  DatePicker,
  Field,
  Input,
  useCommandQuery,
  useEntityApi,
  type ComboboxProps,
} from "@rebar/ui";
import { useState, type ReactNode } from "react";

/** Nabídky pro dialogy schránky a rychlého zadání (`crm.inbox.options`). */
export type InboxOptions = {
  activityTypes: { key: string; name: string; icon: string; defaultDurationMin: number | null }[];
  sources: { value: string; label: string }[];
  inquiryLostReasons: { value: string; label: string }[];
  companyTypes: { value: string; label: string }[];
  jobTypes: { value: string; label: string }[];
  stages: { id: string; name: string; phase: string | null; color: string }[];
};

/** Načte nabídky pro dialogy schránky a rychlého zadání. */
export function useInboxOptions(enabled = true) {
  return useCommandQuery<InboxOptions>("crm.inbox.options", {}, { enabled });
}

/* ---------- první aktivita ---------- */

/** Rozepsaná první aktivita ve formuláři (typ, předmět, termín). */
export type FirstActivityState = {
  typeKey: string;
  subject: string;
  date: string | null;
  time: string;
  allDay: boolean;
  /** Předmět napsal uživatel (změna typu ho pak nepřepíše). */
  subjectTouched: boolean;
};

/** Výchozí první aktivita: „Zavolat zítra v 9:00“. */
export function defaultFirstActivity(): FirstActivityState {
  return {
    typeKey: "call",
    subject: "Zavolat",
    date: addDaysIso(todayIso(), 1),
    time: "09:00",
    allDay: false,
    subjectTouched: false,
  };
}

const SUBJECTS: Record<string, string> = {
  call: "Zavolat",
  meeting: "Schůzka",
  site_visit: "Obhlídka na místě",
  email: "Napsat e-mail",
  task: "Úkol",
  deadline: "Termín",
};

/** Zadání první aktivity pro server; `null`, když není vyplněný předmět nebo termín. */
export function toFirstActivity(s: FirstActivityState) {
  if (!s.subject.trim() || !s.date) return null;
  const dueAt = zonedToUtc(s.date, s.allDay ? "00:00" : s.time || "09:00").toISOString();
  return {
    typeKey: s.typeKey,
    subject: s.subject.trim(),
    dueAt,
    allDay: s.allDay,
  };
}

/** Políčka první aktivity: typ, předmět, datum a čas s rychlou volbou „Dnes / Zítra / Za týden“. */
export function FirstActivityFields({
  value,
  onChange,
  types,
}: {
  value: FirstActivityState;
  onChange: (v: FirstActivityState) => void;
  types: InboxOptions["activityTypes"];
}) {
  const set = (patch: Partial<FirstActivityState>) => onChange({ ...value, ...patch });
  const today = todayIso();
  const quick: [string, string][] = [
    ["Dnes", today],
    ["Zítra", addDaysIso(today, 1)],
    ["Za týden", addDaysIso(today, 7)],
  ];
  return (
    <div data-testid="first-activity">
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Typ aktivity">
          <Combobox
            aria-label="Typ aktivity"
            options={types.map((t) => ({ value: t.key, label: t.name }))}
            value={value.typeKey}
            onChange={(v) => {
              const key = (v as string | null) ?? "call";
              set({
                typeKey: key,
                ...(value.subjectTouched ? {} : { subject: SUBJECTS[key] ?? value.subject }),
              });
            }}
          />
        </Field>
        <Field label="Předmět">
          <Input
            value={value.subject}
            onChange={(e) => set({ subject: e.target.value, subjectTouched: true })}
            placeholder="např. Zavolat a domluvit obhlídku"
            maxLength={200}
          />
        </Field>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Termín">
          <DatePicker
            value={value.date}
            onChange={(d) => set({ date: d })}
            placeholder="Vybrat den"
            clearable={false}
          />
        </Field>
        <Field label="Čas">
          <Input
            type="time"
            value={value.time}
            disabled={value.allDay}
            onChange={(e) => set({ time: e.target.value })}
            aria-label="Čas aktivity"
          />
        </Field>
      </div>
      <div className="-mt-1 mb-3 flex flex-wrap items-center gap-2">
        {quick.map(([label, date]) => (
          <Button
            key={label}
            size="sm"
            variant={value.date === date ? "primary" : "secondary"}
            onClick={() => set({ date })}
          >
            {label}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-sm text-muted">
          <Checkbox
            checked={value.allDay}
            onCheckedChange={(c) => set({ allDay: !!c })}
            aria-label="Na celý den"
          />
          Na celý den
        </label>
      </div>
    </div>
  );
}

/* ---------- výběr existující firmy nebo osoby ---------- */

/** Vybraná existující firma nebo osoba. */
export type ContactHit = { id: string; label: string; hint?: string };

/** Výběr existující firmy nebo osoby s hledáním na serveru (jméno bez diakritiky, IČO, telefon, e-mail). */
export function ContactCombobox({
  kind,
  value,
  selectedLabel,
  onChange,
  placeholder,
  ariaLabel,
}: {
  kind: "company" | "person";
  value: string | null;
  selectedLabel?: string | undefined;
  onChange: (hit: ContactHit | null) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const api = useEntityApi();
  const [last, setLast] = useState<Record<string, ContactHit>>({});
  const load: NonNullable<ComboboxProps["load"]> = async (q) => {
    const r = await api.command<
      unknown,
      {
        companies: { id: string; name: string; ico: string | null; city: string | null }[];
        persons: {
          id: string;
          name: string;
          companyName: string | null;
          phone: string | null;
          email: string | null;
        }[];
      }
    >("kontakty.search", { q, kinds: [kind], limit: 8 });
    const hits: ContactHit[] =
      kind === "company"
        ? r.companies.map((c) => ({
            id: c.id,
            label: c.name,
            hint: [c.ico, c.city].filter(Boolean).join(" · "),
          }))
        : r.persons.map((p) => ({
            id: p.id,
            label: p.name,
            hint: [p.companyName, p.phone ?? p.email].filter(Boolean).join(" · "),
          }));
    setLast(Object.fromEntries(hits.map((h) => [h.id, h])));
    return hits.map((h) => ({ value: h.id, label: h.label, ...(h.hint ? { hint: h.hint } : {}) }));
  };
  return (
    <Combobox
      aria-label={ariaLabel}
      load={load}
      value={value}
      {...(value && selectedLabel ? { selectedLabels: { [value]: selectedLabel } } : {})}
      onChange={(v) =>
        onChange(v ? (last[v as string] ?? { id: v as string, label: selectedLabel ?? "" }) : null)
      }
      placeholder={placeholder}
      searchPlaceholder="Jméno, IČO, telefon nebo e-mail…"
      emptyText="Nic nenalezeno"
      clearable
    />
  );
}

/* ---------- IČO a doplnění z ARES ---------- */

/** Údaje firmy z ARES, které formulář převezme. */
export type AresCompany = {
  ico: string;
  name: string;
  dic: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
};
type AresResult =
  | { ok: true; company: AresCompany; cached: boolean }
  | { ok: false; reason: string; message: string };

/** Pole IČO s tlačítkem „Doplnit z ARES“. Bez sítě nebo při chybě jen ukáže větu; firmu jde vždy vyplnit ručně. */
export function IcoField({
  value,
  onChange,
  onFound,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onFound: (c: AresCompany) => void;
  disabled?: boolean;
}) {
  const api = useEntityApi();
  const [state, setState] = useState<{ busy: boolean; note: string | null; ok: boolean }>({
    busy: false,
    note: null,
    ok: false,
  });
  async function lookup() {
    if (!value.trim()) return setState({ busy: false, ok: false, note: "Vyplňte IČO." });
    setState({ busy: true, ok: false, note: null });
    try {
      const r = await api.command<unknown, AresResult>("kontakty.ares", { ico: value });
      if (r.ok) {
        onFound(r.company);
        setState({ busy: false, ok: true, note: `Doplněno z ARES: ${r.company.name}` });
      } else setState({ busy: false, ok: false, note: r.message });
    } catch (e) {
      setState({ busy: false, ok: false, note: (e as Error).message });
    }
  }
  return (
    <Field label="IČO">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          placeholder="8 číslic"
          maxLength={20}
          disabled={disabled}
          onKeyDown={(e) => {
            // Enter v poli IČO doplní z ARES a nesmí odeslat celý formulář
            if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void lookup();
            }
          }}
        />
        <Button onClick={() => void lookup()} loading={state.busy} disabled={disabled}>
          Doplnit z ARES
        </Button>
      </div>
      {state.note && (
        <p
          role={state.ok ? "status" : "alert"}
          className={state.ok ? "mt-1.5 text-sm text-success" : "mt-1.5 text-sm text-warning"}
        >
          {state.note}
        </p>
      )}
    </Field>
  );
}

/** Rámeček sekce v dialogu: nadpis malými kapitálkami a obsah. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-1">
      <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-faint">{title}</h3>
      {children}
    </section>
  );
}

/** Odpověď serveru „záznam se stejným … už existuje“ (volba použít / založit novou). */
export const isDuplicateMessage = (m: string) =>
  /už existuje\./.test(m) && /^(Firma|Osoba) „/.test(m);
