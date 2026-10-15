"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Avatar,
  Chip,
  Icon,
  cn,
  type KanbanCardContext,
  type KanbanColumnContext,
} from "@rebar/ui";
import { DEAL_SOURCE_LABELS, type DealSource } from "../shared";
import type { DealHighlight } from "../deals/logic";
import { columnTotals, highlightOfRow, pluralDays } from "./logic";

const SERVICE_LABEL: Record<string, string> = {
  web: "Web",
  marketing: "Marketing",
  systemy: "Systémy",
};

/** Stav další aktivity: výstražná ikona bez aktivity (OBCH-07), jinak datum, po termínu červeně. */
export function NextActivity({
  nextActivityAt,
  highlight,
}: {
  nextActivityAt: string | null;
  highlight: DealHighlight;
}) {
  if (highlight.noNextActivity)
    return (
      <span
        className="inline-flex items-center gap-1 text-sm text-warning"
        title="Bez naplánované další aktivity"
        data-testid="no-next-activity"
      >
        <Icon name="alert-triangle" className="size-3.5" />
        <span>Bez aktivity</span>
      </span>
    );
  if (!nextActivityAt) return null;
  const overdue = highlight.activityState === "overdue";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm",
        overdue ? "text-danger" : "text-muted",
      )}
      title={overdue ? "Další aktivita je po termínu" : "Další aktivita"}
      data-testid="next-activity"
      data-state={highlight.activityState}
    >
      <Icon name={overdue ? "alarm-clock" : "calendar"} className="size-3.5" />
      <span className="tabular">{formatDate(nextActivityAt.slice(0, 10))}</span>
    </span>
  );
}

/** Čip „Bez pohybu 12 dní“: obchod ve fázi bez aktivity déle, než fáze dovoluje (jen vizuálně). */
export function RottingChip({ highlight }: { highlight: DealHighlight }) {
  if (!highlight.rotting) return null;
  const d = highlight.daysSinceActivity;
  return (
    <span
      data-testid="rotting-chip"
      title="Obchod se dlouho nehýbe: žádná dokončená aktivita ani změna fáze"
      className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full bg-danger-soft px-2 text-xs font-medium text-danger"
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      Bez pohybu {d} {pluralDays(d)}
    </span>
  );
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Tělo karty obchodu: název, firma, hodnota, vlastník, služby; neotevřený Meta lead je zvýrazněný. */
export function DealCardBody({ row, labels, attributes }: KanbanCardContext) {
  const stages = attributes.find((a) => a.key === "status")?.stages ?? [];
  const highlight = highlightOfRow(row, stages);
  const company = str(row.company) ? labels.company?.[String(row.company)]?.label : null;
  const owner = str(row.owner) ? labels.owner?.[String(row.owner)]?.label : null;
  const value = typeof row.value === "number" ? row.value : null;
  const services = Array.isArray(row.services) ? (row.services as string[]) : [];
  return (
    <div
      className="space-y-1"
      data-testid="deal-card"
      data-unopened={highlight.unopenedLead || undefined}
    >
      {highlight.unopenedLead && (
        <Chip color="blue" dot data-testid="unopened-lead">
          Nový lead{str(row.sourceDetail) ? ` · ${str(row.sourceDetail)}` : ""}
        </Chip>
      )}
      <div
        className={cn("line-clamp-2 font-medium leading-snug", highlight.rotting && "text-danger")}
      >
        {String(row.title ?? "Bez názvu")}
      </div>
      {company && <div className="truncate text-sm text-muted">{company}</div>}
      {services.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {services.map((s) => (
            <Chip key={s} color="gray">
              {SERVICE_LABEL[s] ?? s}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="tabular text-sm font-semibold">
          {value !== null && value > 0 ? (
            formatMinor(value)
          ) : (
            <span className="font-normal text-faint">Bez ceny</span>
          )}
        </span>
        {owner && (
          <span title={`Vlastník: ${owner}`}>
            <Avatar name={owner} size={20} />
          </span>
        )}
      </div>
    </div>
  );
}

/** Patička karty: datum další aktivity (nebo výstraha) a čip „bez pohybu“. */
export function DealCardFooter({ row, attributes }: KanbanCardContext) {
  const stages = attributes.find((a) => a.key === "status")?.stages ?? [];
  const highlight = highlightOfRow(row, stages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <NextActivity nextActivityAt={str(row.nextActivityAt)} highlight={highlight} />
      <RottingChip highlight={highlight} />
    </div>
  );
}

/**
 * Doplňující řádek hlavičky sloupce (OBCH-05): vážený součet za celý sloupec (součty počítá server přes agregace) a
 * pravděpodobnost fáze. Počet a součet hodnot ukazuje samotný sloupec nad tímto řádkem.
 */
export function DealColumnHeader({ stage, count, sums }: KanbanColumnContext) {
  const totals = columnTotals(count, sums);
  const p = stage.probabilityPct;
  if (!totals && (p === null || p === undefined)) return null;
  return (
    <span
      className="tabular flex items-center gap-1.5"
      title="Vážený součet: hodnota krát pravděpodobnost fáze"
      data-testid="column-weighted"
      data-stage={stage.id}
    >
      {totals && <span>Vážená {formatMinor(totals.weightedMinor)}</span>}
      {totals && p !== null && p !== undefined && <span aria-hidden>·</span>}
      {p !== null && p !== undefined && <span>{p} %</span>}
    </span>
  );
}

/** Popisek zdroje obchodu. */
export const sourceLabel = (s: string): string => DEAL_SOURCE_LABELS[s as DealSource] ?? s;
