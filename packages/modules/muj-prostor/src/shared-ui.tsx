"use client";

import { formatDate } from "@rebar/core/shared";
import {
  Chip,
  Combobox,
  cn,
  errorToast,
  successToast,
  undoToast,
  useCommandMutation,
  useEntityApi,
} from "@rebar/ui";
import { useCallback, useRef, type ReactNode } from "react";
import { EXPIRY_COLORS, expiryState, expiryText } from "./domains/logic";
import type { MarkRenewedResult, ServiceRow } from "./types";

/** Karta s jedním číslem nad seznamem (souhrn). `tone` zvýrazní číslo (kritické / upozornění). */
export function Kpi({
  label,
  value,
  hint,
  tone,
  testId,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "danger" | "warning" | undefined;
  testId?: string;
}) {
  return (
    <div className="card min-w-0 p-3" data-testid={testId}>
      <p className="truncate text-sm font-medium text-muted">{label}</p>
      <p
        className={cn(
          "tabular mt-0.5 text-xl font-semibold",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-sm text-faint">{hint}</p>}
    </div>
  );
}

/** Štítek expirace domény: barva podle `warn_days` (normální šedá, upozornění oranžová, kritická červená). */
export function ExpiryChip({
  expiresOn,
  warnDays,
  today,
}: {
  expiresOn: string | null;
  warnDays: number;
  today: string;
}) {
  const state = expiryState(expiresOn, warnDays, today);
  if (state.level === "unknown") return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular">{formatDate(expiresOn!)}</span>
      <Chip color={EXPIRY_COLORS[state.level]} data-level={state.level} data-testid="expiry-chip">
        {expiryText(state)}
      </Chip>
    </span>
  );
}

/** Štítek stavu obnovy služby: po termínu červený, blíží se oranžový, jinak jen datum. */
export function RenewalCell({
  row,
}: {
  row: Pick<ServiceRow, "nextRenewal" | "renewal" | "daysLeft">;
}) {
  if (!row.nextRenewal) return <span className="text-faint">—</span>;
  const text =
    row.daysLeft === null
      ? null
      : row.daysLeft < 0
        ? `Po termínu ${Math.abs(row.daysLeft)} ${Math.abs(row.daysLeft) === 1 ? "den" : Math.abs(row.daysLeft) <= 4 ? "dny" : "dní"}`
        : row.daysLeft === 0
          ? "Dnes"
          : `Za ${row.daysLeft} ${row.daysLeft === 1 ? "den" : row.daysLeft <= 4 ? "dny" : "dní"}`;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular">{formatDate(row.nextRenewal)}</span>
      {text && row.renewal !== "ok" && row.renewal !== "none" && (
        <Chip color={row.renewal === "overdue" ? "red" : "orange"} data-level={row.renewal}>
          {text}
        </Chip>
      )}
    </span>
  );
}

/**
 * Akce „Označit obnovu jako vyfakturovanou“ (HOST-03, R-47): posune další obnovu o období a nabídne „Zpět“
 * (`muj-prostor.hosting.undoRenewed` vrátí původní datum, jen když se datum mezitím nezměnilo).
 */
export function useMarkRenewed() {
  const undo = useCommandMutation<{ id: string; from: string; to: string }, MarkRenewedResult>(
    "muj-prostor.hosting.undoRenewed",
  );
  const mutation = useCommandMutation<
    { id: string; expectedNextRenewal: string },
    MarkRenewedResult
  >("muj-prostor.hosting.markRenewed", {
    onSuccess: (r) =>
      undoToast(`Další obnova je ${formatDate(r.next)}.`, () =>
        undo.mutate(
          { id: r.id, from: r.next, to: r.previous },
          {
            onSuccess: () => successToast(`Vráceno na ${formatDate(r.previous)}.`),
            onError: (e) => errorToast(e.message),
          },
        ),
      ),
  });
  return {
    pending: mutation.isPending,
    mark: (row: { id: string; nextRenewal: string }) =>
      mutation.mutate(
        { id: row.id, expectedNextRenewal: row.nextRenewal },
        { onError: (e) => errorToast(e.message) },
      ),
  };
}

/** Výběr klienta (firmy) s hledáním na serveru; `label` je popisek už vybrané firmy. */
export function CompanyPicker({
  value,
  label,
  onChange,
  placeholder = "Vybrat klienta…",
  ariaLabel = "Klient",
}: {
  value: string | null;
  label?: string | null | undefined;
  onChange: (id: string | null, label: string | null) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const api = useEntityApi();
  const seen = useRef<Record<string, string>>({});
  const load = useCallback(
    async (q: string) => {
      const options = await api.lookups.records("company", q);
      for (const o of options) seen.current[o.value] = o.label;
      return options;
    },
    [api],
  );
  return (
    <Combobox
      aria-label={ariaLabel}
      load={load}
      value={value}
      selectedLabels={value && label ? { [value]: label } : {}}
      placeholder={placeholder}
      searchPlaceholder="Hledat firmu…"
      clearable
      onChange={(v) => {
        const id = Array.isArray(v) ? (v[0] ?? null) : v;
        onChange(id, id ? (seen.current[id] ?? null) : null);
      }}
    />
  );
}
