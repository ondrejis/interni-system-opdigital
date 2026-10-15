"use client";

import { Combobox, useEntityApi, type ComboOption } from "@rebar/ui";
import { useCallback, useEffect, useState } from "react";
import type { JobRef, JobsOutput } from "../contract";
import { formatDuration, type DurationFormat } from "../logic/parse-time";

/** Chyba příkazu pod formulářem. */
export function Err({ error }: { error: Error | null | undefined }) {
  return error ? (
    <p role="alert" className="mt-2 text-sm text-danger">
      {error.message}
    </p>
  ) : null;
}

const KEY = "opsys.hodiny.format";

/** Zvolený způsob zobrazení času (`1:30` / `1,5`); jen pohodlí prohlížeče, bez něj se ukáže `1:30`. */
export function useDurationFormat(): [DurationFormat, (f: DurationFormat) => void] {
  const [format, setFormat] = useState<DurationFormat>("hm");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === "decimal") setFormat("decimal");
    } catch {
      /* úložiště nemusí být k dispozici */
    }
  }, []);
  const set = useCallback((f: DurationFormat) => {
    setFormat(f);
    try {
      window.localStorage.setItem(KEY, f);
    } catch {
      /* ignorováno */
    }
  }, []);
  return [format, set];
}

/** Čas pro tabulky: nula je pomlčka. */
export const showMinutes = (minutes: number, format: DurationFormat) =>
  minutes > 0 ? formatDuration(minutes, format) : "–";

/** Název zakázky s číslem. */
export const jobLabel = (j: Pick<JobRef, "number" | "title">) =>
  j.number ? `${j.number} · ${j.title}` : j.title;

/** Výběr zakázky s hledáním na serveru (příkaz `hodiny.jobs`). */
export function JobPicker({
  value,
  label,
  onChange,
  placeholder = "Vybrat zakázku…",
  includeClosed,
  className,
}: {
  value: string | null;
  label?: string | undefined;
  onChange: (job: JobRef | null) => void;
  placeholder?: string;
  includeClosed?: boolean;
  className?: string;
}) {
  const api = useEntityApi();
  const [known, setKnown] = useState<Map<string, JobRef>>(new Map());
  const load = useCallback(
    async (q: string): Promise<ComboOption[]> => {
      const jobs = await api.command<unknown, JobsOutput>("hodiny.jobs", {
        ...(q ? { q } : {}),
        ...(includeClosed ? { includeClosed: true } : {}),
      });
      setKnown((m) => new Map([...m, ...jobs.map((j) => [j.id, j] as const)]));
      return jobs.map((j) => ({ value: j.id, label: jobLabel(j) }));
    },
    [api, includeClosed],
  );
  return (
    <Combobox
      aria-label="Zakázka"
      load={load}
      value={value}
      {...(value && label ? { selectedLabels: { [value]: label } } : {})}
      onChange={(v) => onChange(typeof v === "string" ? (known.get(v) ?? null) : null)}
      placeholder={placeholder}
      searchPlaceholder="Hledat zakázku…"
      emptyText="Žádná zakázka"
      {...(className ? { className } : {})}
    />
  );
}
