"use client";

import type { ServiceType } from "@rebar/core/contracts";
import { formatDate } from "@rebar/core/shared";
import { Avatar, Chip, Combobox, Tooltip, cn, useEntityApi, type ComboOption } from "@rebar/ui";
import { ExternalLink, FolderOpen, Lock, TriangleAlert } from "lucide-react";
import { useCallback, type ReactNode } from "react";
import {
  JOB_STATUS_COLORS,
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  type JobStatusCode,
} from "../shared";
import { TYPE_COLORS, dueLabel, jobWarning } from "./logic";
import type { DriveInfo } from "./types";

/** Štítek typu zakázky (Web, Marketing, Systémy). */
export function TypeChip({ type }: { type: ServiceType }) {
  return (
    <Chip color={TYPE_COLORS[type]} data-testid="job-type">
      {JOB_TYPE_LABELS[type]}
    </Chip>
  );
}

/** Štítek stavu zakázky. */
export function StatusChip({ status }: { status: JobStatusCode }) {
  return (
    <Chip color={JOB_STATUS_COLORS[status]} dot data-testid="job-status">
      {JOB_STATUS_LABELS[status]}
    </Chip>
  );
}

/** Výstražná ikona zakázky po termínu nebo s úkoly po termínu (s textem pro čtečky i myš). */
export function WarningIcon({
  card,
  className,
}: {
  card: { overdue: boolean; slipping: boolean; dueDate: string | null };
  className?: string;
}) {
  const w = jobWarning(card, formatDate);
  if (!w) return null;
  return (
    <Tooltip label={w.label}>
      <span
        role="img"
        aria-label={w.label}
        data-testid="job-warning"
        data-kind={w.kind}
        className={cn(
          "inline-flex shrink-0 items-center",
          w.kind === "overdue" ? "text-danger" : "text-warning",
          className,
        )}
      >
        <TriangleAlert className="size-4" />
      </span>
    </Tooltip>
  );
}

/** Ikona zámku: zakázka je soukromá (vidí ji jen vlastník systému). */
export function PrivateBadge() {
  return (
    <Tooltip label="Soukromá zakázka: vidí ji jen majitel systému">
      <span
        role="img"
        aria-label="Soukromá zakázka"
        data-testid="job-private"
        className="inline-flex items-center text-muted"
      >
        <Lock className="size-3.5" />
      </span>
    </Tooltip>
  );
}

/** Termín s relativním popisem („3. 12. 2026 · za 5 dní“); po termínu červeně, jen u živých zakázek. */
export function DueText({
  due,
  live = true,
  className,
}: {
  due: string | null;
  live?: boolean;
  className?: string;
}) {
  if (!due) return <span className={cn("text-faint", className)}>—</span>;
  const rel = live ? dueLabel(due) : { text: "", tone: "none" as const };
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        rel.tone === "danger" && "font-medium text-danger",
        rel.tone === "warning" && "text-warning",
        className,
      )}
    >
      {formatDate(due)}
      {rel.text && <span className="ml-1.5 text-xs opacity-80">{rel.text}</span>}
    </span>
  );
}

/** Jednotný výběr uživatele (hledání na serveru); `selectedLabels` ukáže jméno už vybraného. */
export function UserCombobox({
  value,
  onChange,
  labels,
  placeholder = "Vybrat uživatele…",
  clearable,
  disabled,
  trigger,
  "aria-label": ariaLabel,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  labels?: Record<string, string>;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  trigger?: ReactNode;
  "aria-label"?: string;
}) {
  const api = useEntityApi();
  return (
    <Combobox
      load={api.lookups.users}
      value={value}
      {...(labels ? { selectedLabels: labels } : {})}
      onChange={(v) => onChange((v as string | null) ?? null)}
      placeholder={placeholder}
      searchPlaceholder="Najít uživatele…"
      {...(clearable ? { clearable } : {})}
      {...(disabled ? { disabled } : {})}
      {...(trigger ? { trigger } : {})}
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
    />
  );
}

/** Výběr více uživatelů (členové týmu). */
export function UsersCombobox({
  value,
  onChange,
  labels,
  placeholder = "Přidat členy…",
  "aria-label": ariaLabel,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  labels?: Record<string, string>;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const api = useEntityApi();
  return (
    <Combobox
      load={api.lookups.users}
      multiple
      value={value}
      {...(labels ? { selectedLabels: labels } : {})}
      onChange={(v) => onChange(Array.isArray(v) ? v : v ? [v] : [])}
      placeholder={placeholder}
      searchPlaceholder="Najít uživatele…"
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
    />
  );
}

/** Výběr klienta (firmy) s hledáním na serveru. */
export function CompanyCombobox({
  value,
  onChange,
  labels,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  labels?: Record<string, string>;
  disabled?: boolean;
}) {
  const api = useEntityApi();
  const load = useCallback(
    (q: string): Promise<ComboOption[]> => api.lookups.records("company", q),
    [api],
  );
  return (
    <Combobox
      load={load}
      value={value}
      {...(labels ? { selectedLabels: labels } : {})}
      onChange={(v) => onChange((v as string | null) ?? null)}
      placeholder="Vybrat klienta…"
      searchPlaceholder="Najít klienta…"
      aria-label="Klient"
      {...(disabled ? { disabled } : {})}
    />
  );
}

/** Překrývající se avatary členů (vlastník první); přes `title` jsou jména pro myš i čtečky. */
export function AvatarStack({
  people,
  max = 3,
  size = 22,
}: {
  people: { id: string; name: string }[];
  max?: number;
  size?: number;
}) {
  if (!people.length) return <span className="text-faint">—</span>;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span
      className="inline-flex items-center"
      title={people.map((p) => p.name).join(", ")}
      aria-label={`Tým: ${people.map((p) => p.name).join(", ")}`}
      role="img"
    >
      {shown.map((p, i) => (
        <span key={p.id} className={cn("rounded-full ring-2 ring-bg", i > 0 && "-ml-1.5")}>
          <Avatar name={p.name} size={size} />
        </span>
      ))}
      {rest > 0 && <span className="ml-1 text-xs text-muted">+{rest}</span>}
    </span>
  );
}

/** Tlačítko Disk v seznamu: otevře složku zakázky v nové kartě; bez složky ukáže důvod, proč nejde. */
export function DriveButton({ info }: { info: DriveInfo | undefined }) {
  if (!info || info.state === "none") return <span className="text-faint">—</span>;
  if (info.state === "ready" && info.url)
    return (
      <a
        href={info.url}
        target="_blank"
        rel="noreferrer"
        aria-label="Otevřít složku zakázky na Disku"
        title="Otevřít složku na Disku"
        className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
        onClick={(e) => e.stopPropagation()}
      >
        <FolderOpen className="size-4" />
        <ExternalLink className="-ml-0.5 -mt-2 size-2.5" aria-hidden />
      </a>
    );
  const text =
    info.state === "pending"
      ? "Složka se zakládá"
      : info.state === "error"
        ? "Založení složky selhalo"
        : "Založení složky vypršelo";
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md",
        info.state === "pending" ? "text-faint" : "text-danger",
      )}
    >
      <FolderOpen className="size-4" />
    </span>
  );
}

/** Nadpis sekce uvnitř dialogu nebo karty. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold">{children}</h3>;
}

/** Souhrn chyby načítání: zpráva ze serveru a tlačítko Zkusit znovu. */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
      <p>Nepodařilo se načíst data: {message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 underline">
          Zkusit znovu
        </button>
      )}
    </div>
  );
}
