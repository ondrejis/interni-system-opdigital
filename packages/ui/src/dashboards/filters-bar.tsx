"use client";

import {
  PERIOD_LABELS,
  PERIOD_PRESETS,
  type DashboardFilters,
  type PeriodPreset,
} from "@rebar/core/dashboards-shared";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRef } from "react";
import { Combobox } from "../components/combobox";
import { DatePicker } from "../components/date-picker";
import { useEntityApi } from "../data/context";

const selectCls =
  "h-8 rounded-md border border-line-strong bg-bg px-2 text-base text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]";

/** Filtry nástěnky: období, zakázka, osoba. Propisují se do widgetů a do adresy (sdílitelný odkaz). */
export function FiltersBar({
  value,
  onChange,
  jobsAvailable,
}: {
  value: DashboardFilters;
  onChange: (f: DashboardFilters) => void;
  /** Zakázky jsou k dispozici (zapnutý modul a oprávnění). */
  jobsAvailable: boolean;
}) {
  const api = useEntityApi();
  const known = useRef<Record<string, string>>({});
  const set = (p: Partial<DashboardFilters>) => onChange({ ...value, ...p });
  // z adresy se načte jen id; popisek vybrané zakázky se dohledá
  useQuery({
    queryKey: ["dashboards", "label", "job", value.jobId],
    queryFn: async () => {
      const r = await api.get("job", value.jobId!);
      known.current[value.jobId!] = String(r.row.title ?? r.row.number ?? "");
      return known.current[value.jobId!];
    },
    enabled: !!value.jobId && !known.current[value.jobId],
    staleTime: Infinity,
  });
  useQuery({
    queryKey: ["dashboards", "label", "user", value.userId],
    queryFn: async () => {
      const list = await api.lookups.users("");
      for (const o of list) known.current[o.value] = o.label;
      return known.current[value.userId!] ?? "Vybraná osoba";
    },
    enabled: !!value.userId && !known.current[value.userId],
    staleTime: Infinity,
  });
  const remember = (list: { value: string; label: string }[]) => {
    for (const o of list) known.current[o.value] = o.label;
    return list;
  };
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Filtry nástěnky"
      data-testid="dashboard-filters"
    >
      <label className="sr-only" htmlFor="dash-period">
        Období
      </label>
      <select
        id="dash-period"
        className={selectCls}
        value={value.period}
        onChange={(e) => {
          const period = e.target.value as PeriodPreset;
          onChange({
            period,
            ...(period === "custom" && value.from ? { from: value.from } : {}),
            ...(period === "custom" && value.to ? { to: value.to } : {}),
            ...(value.jobId ? { jobId: value.jobId } : {}),
            ...(value.userId ? { userId: value.userId } : {}),
          });
        }}
      >
        {PERIOD_PRESETS.map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABELS[p]}
          </option>
        ))}
      </select>
      {value.period === "custom" && (
        <>
          <DatePicker
            value={value.from ?? null}
            onChange={(d) => set({ from: d ?? undefined })}
            placeholder="Od"
          />
          <span className="text-muted" aria-hidden>
            –
          </span>
          <DatePicker
            value={value.to ?? null}
            onChange={(d) => set({ to: d ?? undefined })}
            placeholder="Do"
          />
        </>
      )}
      {jobsAvailable && (
        <Combobox
          value={value.jobId ?? null}
          selectedLabels={known.current}
          load={async (q) => remember(await api.lookups.records("job", q))}
          onChange={(v) => set({ jobId: (v as string | null) ?? undefined })}
          clearable
          placeholder="Všechny zakázky"
          searchPlaceholder="Hledat zakázku…"
          aria-label="Zakázka"
          className="w-52"
        />
      )}
      <Combobox
        value={value.userId ?? null}
        selectedLabels={known.current}
        load={async (q) => remember(await api.lookups.users(q))}
        onChange={(v) => set({ userId: (v as string | null) ?? undefined })}
        clearable
        placeholder="Všechny osoby"
        searchPlaceholder="Hledat osobu…"
        aria-label="Osoba"
        className="w-48"
      />
      {(value.period !== "all" || value.jobId || value.userId) && (
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted hover:bg-hover hover:text-fg"
          onClick={() => onChange({ period: "all" })}
        >
          <X className="size-3.5" aria-hidden /> Zrušit filtry
        </button>
      )}
    </div>
  );
}
