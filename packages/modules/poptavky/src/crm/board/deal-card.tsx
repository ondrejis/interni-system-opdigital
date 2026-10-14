"use client";

import { formatMinor, type RecordRow } from "@rebar/core/shared";
import { Avatar, CellValue, cn, type KanbanCardContext, type KanbanColumnContext } from "@rebar/ui";
import { NextActivityIcon } from "../activities/components";
import { activityState, daysSince } from "../logic";
import { columnTotals, pluralDays } from "./logic";

/** Klíče, které karta zobrazuje sama (zbylé atributy z nabídky „Karta“ se připojí pod ně). */
const OWN = new Set(["company", "siteCity", "sumContract", "manager", "title", "stage", "value"]);

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Tělo karty zakázky na nástěnce: název, pod ním firma (investor) a obec stavby v jedné řádce, hodnota a vlastník
 * (avatar). Stav další aktivity a „zhnilá“ jsou v patičce (`DealCardFooter`). Hodnota se ukáže jen s `zakazky.economics`.
 */
export function DealCardBody({ row, labels, attributes, cardAttributes }: KanbanCardContext) {
  const company = text(row.company) ? labels.company?.[String(row.company)]?.label : null;
  const owner = text(row.manager) ? labels.manager?.[String(row.manager)]?.label : null;
  const city = text(row.siteCity);
  const value = typeof row.sumContract === "number" ? row.sumContract : null;
  const extras = cardAttributes
    .filter((k) => !OWN.has(k))
    .map((k) => attributes.find((a) => a.key === k))
    .filter((a) => !!a && row[a.key] !== null && row[a.key] !== undefined && row[a.key] !== "");
  return (
    <div className="space-y-1" data-testid="deal-card">
      <div className="line-clamp-2 font-medium leading-snug">
        {String(row.title ?? "Bez názvu")}
      </div>
      {(company || city) && (
        <div className="truncate text-sm text-muted">
          {company}
          {company && city && <span className="text-faint"> · </span>}
          {city && <span className={company ? "text-faint" : undefined}>{city}</span>}
        </div>
      )}
      {extras.map(
        (a) =>
          a && (
            <div key={a.key} className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
              <span className="shrink-0 text-faint">{a.label}:</span>
              <CellValue attr={a} value={row[a.key]} labels={labels} />
            </div>
          ),
      )}
      {(value !== null || owner) && (
        <div className="flex items-center justify-between gap-2 pt-1">
          {value !== null ? (
            <span className="tabular text-sm font-semibold">
              {value > 0 ? (
                formatMinor(value)
              ) : (
                <span className="font-normal text-faint">Bez ceny</span>
              )}
            </span>
          ) : (
            <span />
          )}
          {owner && (
            <span title={`Vlastník: ${owner}`}>
              <Avatar name={owner} size={20} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Zhnilá zakázka: text pro čtečky a čip v patičce („Bez pohybu 12 dní“); karta samotná se nebarví. */
export function dealRotting(row: RecordRow): boolean | string {
  if (!row.crmRotting) return false;
  const d = rottingDays(row);
  return d === null ? "Zhnilá zakázka: dlouho bez pohybu" : `Zhnilá zakázka: ${d} dní bez pohybu`;
}

/** Počet dní od posledního pohybu (poslední hotová aktivita, jinak vstup do stavu); `null`, když údaj chybí. */
function rottingDays(row: RecordRow): number | null {
  const since = text(row.crmLastActivityAt) ?? text(row.crmStageEnteredAt);
  return since ? daysSince(since) : null;
}

/** Čip „Bez pohybu 12 dní“: jemný oranžový akcent; když je aktivita po termínu, je šedý (jeden výrazný signál). */
export function RottingChip({ row }: { row: RecordRow }) {
  if (!row.crmRotting) return null;
  const d = rottingDays(row);
  const label = d === null ? "Bez pohybu" : `Bez pohybu ${d} ${pluralDays(d)}`;
  const quiet =
    activityState(
      (row.crmNextActivityAt as string | null | undefined) ?? null,
      Number(row.crmOpenActivities ?? 0),
    ) === "overdue";
  return (
    <span
      data-testid="rotting-chip"
      title="Zakázka se dlouho nehýbe: žádná dokončená aktivita ani změna stavu"
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
        quiet ? "bg-active text-muted" : "bg-warning-soft text-warning",
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {label}
    </span>
  );
}

/** Patička karty: stav další aktivity (klik otevře popover s aktivitami) a čip „zhnilé“ zakázky. */
export function DealCardFooter(ctx: KanbanCardContext) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <NextActivityIcon {...ctx} />
      <RottingChip row={ctx.row} />
    </div>
  );
}

/**
 * Doplňující řádek hlavičky sloupce: vážený součet za celý sloupec (součty počítá server přes agregace, ne jen načtená
 * stránka karet) a pravděpodobnost stavu. Bez `zakazky.economics` zůstane jen pravděpodobnost.
 */
export function DealColumnHeader({ stage, count, sums }: KanbanColumnContext) {
  const totals = columnTotals(count, sums);
  const p = stage.probabilityPct;
  if (!totals && (p === null || p === undefined)) return null;
  return (
    <span
      className="tabular flex items-center gap-1.5"
      title="Vážený součet: hodnota zakázek krát pravděpodobnost výhry"
      data-testid="column-weighted"
    >
      {totals && <span>Vážená {formatMinor(totals.weightedMinor)}</span>}
      {totals && p !== null && p !== undefined && <span aria-hidden>·</span>}
      {p !== null && p !== undefined && <span>{p} %</span>}
    </span>
  );
}
