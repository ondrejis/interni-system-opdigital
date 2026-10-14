"use client";

import { formatMinor, type Labels, type RecordRow } from "@rebar/core/shared";
import {
  Avatar,
  Chip,
  Skeleton,
  cn,
  useCan,
  useCommandQuery,
  useEntityApi,
  useNav,
  type RecordHeader,
} from "@rebar/ui";
import { Building2, MapPin, User } from "lucide-react";
import type { ReactNode } from "react";
import { PHASES, isPhaseKey, isPreContract } from "../lifecycle/phases";
import { PhaseButton } from "../lifecycle/ui";
import {
  drawdownTone,
  formatPct,
  marginTone,
  paidShare,
  summaryFromRow,
  type JobSummary,
  type Tone,
} from "./kpis";

const TONE: Record<Tone, string> = {
  neutral: "",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};
const BAR: Record<Tone, string> = {
  neutral: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};
const HEALTH_LABEL = { ok: "V pořádku", warning: "Pozor", danger: "Problém" } as const;
const HEALTH_DOT = { ok: "bg-success", warning: "bg-warning", danger: "bg-danger" } as const;

const labelOf = (labels: Labels, attr: string, id: unknown) =>
  typeof id === "string" ? (labels[attr]?.[id]?.label ?? null) : null;

/** Adresa stavby pro navigaci v mapách (Mapy.cz otevře trasu i na telefonu). */
export const mapsHref = (address: string) =>
  `https://mapy.cz/zakladni?q=${encodeURIComponent(address)}`;

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-sm text-muted">
      <span className="shrink-0 text-faint [&>svg]:size-3.5">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
  bar,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  /** Ukazatel 0–100 na spodní hraně karty (čerpání, podíl uhrazeného). */
  bar?: number | null;
  testId: string;
}) {
  // dva řádky: popisek a číslo; doplňující věta je vedle čísla (pod 1536 px jen pro čtečky a v bublině nad kartou)
  return (
    <div
      className="relative min-w-[10.5rem] shrink-0 overflow-hidden rounded-lg border border-line px-3 py-1.5 lg:min-w-0 lg:shrink"
      data-testid={testId}
      title={hint ? `${label}: ${hint}` : undefined}
    >
      <div className="truncate text-xs text-muted">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={cn("tabular shrink-0 text-base font-semibold", TONE[tone])}>{value}</span>
        {hint ? (
          <span className="min-w-0 flex-1 truncate text-xs text-muted max-2xl:sr-only">{hint}</span>
        ) : null}
      </div>
      {bar !== undefined && bar !== null ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-hover" aria-hidden>
          <div
            className={cn("h-full", BAR[tone])}
            style={{ width: `${Math.max(2, Math.min(100, bar))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Kpis({ s, preContract }: { s: JobSummary; preContract: boolean }) {
  const dd = drawdownTone(s.drawdownPct);
  const mt = marginTone(s);
  return (
    <div
      className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:pb-0"
      data-testid="job-kpis"
    >
      {/* nabídka: smluvní cena ještě není (vznikne výhrou), ale rozpočet už cenu má; 0 Kč by zavádělo */}
      {preContract && s.contractMinor === 0 && (s.budgetSellMinor ?? 0) > 0 ? (
        <Kpi
          testId="kpi-contract"
          label="Cena nabídky"
          value={formatMinor(s.budgetSellMinor ?? 0)}
          hint="bez DPH, smluvní cena vznikne výhrou"
        />
      ) : (
        <Kpi
          testId="kpi-contract"
          label="Smluvní cena"
          value={formatMinor(s.contractMinor)}
          hint={
            s.approvedChangesMinor
              ? `původně ${formatMinor(s.originalContractMinor)}, změny ${s.approvedChangesMinor > 0 ? "+" : ""}${formatMinor(s.approvedChangesMinor)}`
              : "bez DPH"
          }
        />
      )}
      <Kpi
        testId="kpi-cost"
        label="Náklady"
        value={formatMinor(s.costMinor)}
        tone={dd === "success" ? "neutral" : dd}
        bar={s.drawdownPct}
        hint={
          s.plannedCostMinor
            ? `čerpání ${formatPct(s.drawdownPct)} z plánu ${formatMinor(s.plannedCostMinor)}`
            : "bez plánu nákladů"
        }
      />
      <Kpi
        testId="kpi-margin"
        label="Marže"
        value={formatMinor(s.marginMinor)}
        tone={mt}
        hint={`${formatPct(s.marginPct)} · plán ${formatPct(s.plannedMarginPct)}`}
      />
      <Kpi
        testId="kpi-invoiced"
        label="Fakturováno / uhrazeno"
        value={formatMinor(s.invoicedMinor)}
        bar={s.invoicedMinor ? paidShare(s.invoicedMinor, s.paidMinor) : null}
        hint={`uhrazeno ${formatMinor(s.paidMinor)}`}
      />
    </div>
  );
}

function JobKpis({ id, row }: { id: string; row: RecordRow }) {
  const q = useCommandQuery<JobSummary>("zakazky.summary", { jobId: id });
  const fallback = summaryFromRow(row);
  const s = q.data ?? (q.isError || !q.isLoading ? fallback : null);
  if (!s) return q.isLoading ? <Skeleton className="h-12" /> : null;
  // před výhrou (poptávka, nabídka) smluvní cena ještě není
  return <Kpis s={s} preContract={isPreContract(row.phase)} />;
}

/**
 * Hlavička zakázky: fáze, zákazník, kontakt, odpovědný, adresa s mapou, hlavní akce podle fáze a čtyři čísla.
 * Čísla a semafor vidí jen držitel `zakazky.economics`; server pro ostatní ceny nevrací vůbec.
 */
export const JobHeader: RecordHeader = ({ entity, id, row, labels }) => {
  const can = useCan();
  const api = useEntityApi();
  const { Link } = useNav();
  const phaseKey = isPhaseKey(row.phase) ? row.phase : null;
  const phase = phaseKey ? PHASES[phaseKey] : null;
  const economics = can("zakazky.economics");
  const company = typeof row.company === "string" ? row.company : null;
  const person = typeof row.person === "string" ? row.person : null;
  const manager = labelOf(labels, "manager", row.manager);
  const address = typeof row.address === "string" && row.address.trim() ? row.address.trim() : null;
  const health =
    row.sumHealth === "ok" || row.sumHealth === "warning" || row.sumHealth === "danger"
      ? row.sumHealth
      : null;
  const companyHref = company ? api.hrefFor("company", company) : null;
  const personHref = person ? api.hrefFor("person", person) : null;

  return (
    <div className="space-y-2" data-testid="job-header">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          {phase && (
            <Chip color={phase.color} dot data-testid="job-phase">
              {phase.label}
            </Chip>
          )}
          {health && (
            <span
              className="inline-flex items-center gap-1.5 text-sm text-muted"
              data-testid="job-health"
            >
              <span className={cn("size-2 rounded-full", HEALTH_DOT[health])} aria-hidden />
              {HEALTH_LABEL[health]}
            </span>
          )}
          {company && (
            <Meta icon={<Building2 />}>
              {companyHref ? (
                <Link href={companyHref} className="hover:text-fg hover:underline">
                  {labelOf(labels, "company", company) ?? "Zákazník"}
                </Link>
              ) : (
                (labelOf(labels, "company", company) ?? "Zákazník")
              )}
            </Meta>
          )}
          {person && (
            <Meta icon={<User />}>
              {personHref ? (
                <Link href={personHref} className="hover:text-fg hover:underline">
                  {labelOf(labels, "person", person) ?? "Kontakt"}
                </Link>
              ) : (
                (labelOf(labels, "person", person) ?? "Kontakt")
              )}
            </Meta>
          )}
          {manager && (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Avatar name={manager} size={18} />
              <span className="truncate">{manager}</span>
            </span>
          )}
          {address && (
            <Meta icon={<MapPin />}>
              <a
                href={mapsHref(address)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Navigovat na stavbu: ${address}`}
                className="hover:text-fg hover:underline"
              >
                {address}
              </a>
            </Meta>
          )}
        </div>
        {entity.can.write && (
          <span className="w-full shrink-0 sm:w-auto" data-testid="job-primary-action">
            <PhaseButton jobId={id} row={row} />
          </span>
        )}
      </div>
      {economics && <JobKpis id={id} row={row} />}
    </div>
  );
};
