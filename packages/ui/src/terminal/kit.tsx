"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";
import { Icon } from "../lib/icons";
import { useNav } from "../nav";
import { useEntityApi } from "../data/context";

/*
  Stavební kameny terminálu řemeslníka: velké dotykové prvky (min. 48 px), jedna ruka, žádné tabulky. Dlaždice modulů
  skládají obrazovky jen z nich, takže vypadají a chovají se stejně.
*/

/** Karta dlaždice na úvodní obrazovce terminálu. */
export function TerminalCard({
  title,
  icon,
  href,
  children,
  testId,
  tone = "default",
  bare,
}: {
  title: string;
  icon: string;
  /** Odkaz na celou obrazovku dlaždice („Otevřít“). */
  href?: string | null;
  children: ReactNode;
  testId?: string;
  tone?: "default" | "active";
  /** Bez záhlaví (obrazovka dlaždice už má vlastní nadpis). */
  bare?: boolean;
}) {
  const { Link } = useNav();
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className={cn(
        "rounded-2xl border bg-bg p-4",
        tone === "active" ? "border-accent-line bg-accent-soft" : "border-line",
      )}
    >
      {!bare && (
        <header className="mb-3 flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Icon name={icon} className="size-5" />
          </span>
          <h2 className="min-w-0 flex-1 truncate text-xl font-semibold">{title}</h2>
          {href && (
            <Link
              href={href}
              className="-mr-2 inline-flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-accent"
            >
              Otevřít
            </Link>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

type BigButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  block?: boolean;
  className?: string;
};

/** Velké tlačítko pro ovládání jednou rukou (výška 56 px). */
export function BigButton({
  variant = "secondary",
  loading,
  block = true,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: BigButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-14 items-center justify-center gap-2 rounded-xl px-5 text-[18px] font-semibold transition-colors disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
        block && "w-full",
        variant === "primary" && "bg-accent text-accent-fg active:bg-[var(--accent-hover)]",
        variant === "secondary" && "border border-line-strong bg-bg text-fg active:bg-hover",
        variant === "danger" && "bg-danger text-white active:opacity-90",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Odkaz vzhledem jako velké tlačítko (telefonát, navigace, otevření obrazovky dlaždice). */
export function ButtonLink({
  href,
  children,
  variant = "secondary",
  external,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  /** Cizí adresa (mapa) se otevře v nové záložce; `tel:` a `mailto:` nikdy. */
  external?: boolean;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className">) {
  const { Link } = useNav();
  const cls = cn(
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[17px] font-semibold [&_svg]:size-5 [&_svg]:shrink-0",
    variant === "primary"
      ? "bg-accent text-accent-fg active:bg-[var(--accent-hover)]"
      : "border border-line-strong bg-bg text-fg active:bg-hover",
    className,
  );
  return external || /^(tel|mailto):/.test(href) ? (
    <a
      href={href}
      className={cls}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      {...rest}
    >
      {children}
    </a>
  ) : (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

/** Pole s popiskem nad ním; popisek je vždy vidět (v terénu se nehádá z placeholderu). */
export function TouchField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-base font-medium text-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export const TOUCH_FIELD =
  "w-full rounded-xl border border-line-strong bg-bg px-3.5 text-[17px] text-fg placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] disabled:opacity-50";

/** Výběr z možností; nativní výběr se na telefonu otevře systémovým kolečkem, což je nejpohodlnější. */
export function TouchSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(TOUCH_FIELD, "h-14 appearance-none bg-no-repeat pr-10")}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Přepínač 2–3 možností s velkými tlačítky. */
export function TouchChoice<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-14 rounded-xl border px-3 text-base font-semibold transition-colors",
            value === o.value
              ? "border-accent bg-accent text-accent-fg"
              : "border-line-strong bg-bg text-fg active:bg-hover",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Odznak „čeká na odeslání“ u zápisu, který ještě není potvrzený serverem. */
export function PendingBadge({ children = "Čeká na odeslání" }: { children?: ReactNode }) {
  return (
    <span
      data-testid="pending-badge"
      className="inline-flex min-h-6 items-center rounded-full bg-warning-soft px-2.5 text-sm font-medium text-warning"
    >
      {children}
    </span>
  );
}

export function TerminalEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-subtle p-4 text-base text-muted">{children}</p>;
}

/* ---------- zakázky pro výběr ---------- */

export type JobOption = { value: string; label: string };
const JOBS_CACHE = "terminal-jobs";
const LAST_JOB = "terminal-last-job";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // paměť zařízení je jen pohodlí
  }
}

/**
 * Zakázky, na kterých se pracuje (realizace a předání) a které aktér smí vidět. Poslední načtený seznam se pamatuje
 * v zařízení, takže výběr zakázky funguje i bez signálu. Bez modulu Zakázky je seznam prázdný.
 */
export function useActiveJobs(enabled = true) {
  const api = useEntityApi();
  const q = useQuery<JobOption[]>({
    queryKey: ["terminal", "jobs"],
    enabled,
    queryFn: async () => {
      const page = await api.query("job", {
        filters: {
          op: "and",
          conditions: [{ attr: "phase", op: "is_any_of", value: ["execution", "handover"] }],
        },
        sort: [{ attr: "title", dir: "asc" }],
        limit: 50,
      });
      const options = page.rows.map((r) => ({
        value: String(r.id),
        label: [r.number, r.title].filter(Boolean).join(" · "),
      }));
      writeJson(JOBS_CACHE, options);
      return options;
    },
    staleTime: 60_000,
  });
  const [cached, setCached] = useState<JobOption[]>([]);
  useEffect(() => setCached(readJson<JobOption[]>(JOBS_CACHE) ?? []), []);
  return { jobs: q.data ?? (q.isError ? cached : []), loading: q.isLoading, error: q.isError };
}

/** Naposledy použitá zakázka (předvyplní výběr), nebo jediná dostupná. */
export function useJobChoice(jobs: readonly JobOption[]) {
  const [picked, setPicked] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => setLast(readJson<string>(LAST_JOB)), []);
  const fallback =
    last && jobs.some((j) => j.value === last) ? last : jobs.length === 1 ? jobs[0]!.value : "";
  const value = picked !== null && jobs.some((j) => j.value === picked) ? picked : fallback;
  return {
    value,
    set: (v: string) => {
      setPicked(v);
      if (v) writeJson(LAST_JOB, v);
    },
  };
}

/** Výběr zakázky: velké pole s popiskem, předvyplněné poslední nebo jedinou zakázkou. */
export function JobPicker({
  jobs,
  loading,
  value,
  onChange,
  label = "Zakázka",
  placeholder = "Vyberte zakázku",
  optional,
}: {
  jobs: readonly JobOption[];
  loading?: boolean;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <TouchField label={label}>
      {(id) => (
        <TouchSelect
          id={id}
          value={value}
          onChange={onChange}
          placeholder={loading ? "Načítám…" : optional ? "Bez zakázky" : placeholder}
          options={jobs}
        />
      )}
    </TouchField>
  );
}

/** Dnešní datum v české časové zóně (`YYYY-MM-DD`). */
export function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
}
