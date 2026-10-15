"use client";

import { todayIso } from "@rebar/core/time";
import {
  Card,
  CardBody,
  CardHeader,
  Chip,
  DatePicker,
  LineChart,
  SegmentedControl,
  cn,
  useNav,
  type SegmentOption,
} from "@rebar/ui";
import { useMemo, useState, type ReactNode } from "react";
import type { DailyPoint, PerformanceMetrics } from "../contract";
import { periodFromPreset, type PeriodPreset } from "../meta/logic";
import {
  DASH,
  dayLabel,
  fmtInt,
  fmtMoney,
  fmtPct,
  fmtPeriod,
  lostInfo,
  sumBy,
  type LostInfo,
} from "./format";

/*
  Společné stavební kameny UI reklamy: výběr období, dlaždice čísel, tabulka s kartami na telefonu, graf útraty a leadů po
  dnech a štítek rozdílu leadů. Texty česky, čísla tabulkově (`tabular-nums`), barva nikdy nenese význam sama (rozdíl
  leadů má vždy i text, graf tabulku pro čtečky).
*/

/* ---------- období ---------- */

const PRESETS: SegmentOption<PeriodPreset>[] = [
  { value: "7d", label: "7 dní" },
  { value: "30d", label: "30 dní" },
  { value: "90d", label: "90 dní" },
  { value: "month", label: "Měsíc" },
  { value: "custom", label: "Vlastní" },
];

/** Stav výběru období (předvolba, vlastní data a z nich spočtené období). */
export type PeriodState = {
  preset: PeriodPreset;
  setPreset: (p: PeriodPreset) => void;
  custom: { from: string | null; to: string | null };
  setCustom: (c: { from: string | null; to: string | null }) => void;
  /** Platné období pro dotaz (vlastní bez obou dat = posledních 30 dní). */
  period: { from: string; to: string };
};

/** Stav výběru období: předvolba (výchozí 30 dní) nebo vlastní rozsah. */
export function usePeriodState(initial: PeriodPreset = "30d"): PeriodState {
  const [preset, setPreset] = useState<PeriodPreset>(initial);
  const [custom, setCustom] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const period = useMemo(
    () =>
      periodFromPreset(preset, todayIso(), {
        ...(custom.from ? { from: custom.from } : {}),
        ...(custom.to ? { to: custom.to } : {}),
      }),
    [preset, custom],
  );
  return { preset, setPreset, custom, setCustom, period };
}

/** Přepínač období: 7, 30, 90 dní, měsíc, vlastní rozsah (dvě data); pod ním zvolené období textem. */
export function PeriodBar({ state, className }: { state: PeriodState; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid="period-bar">
      <SegmentedControl
        label="Období"
        options={PRESETS}
        value={state.preset}
        onChange={state.setPreset}
      />
      {state.preset === "custom" && (
        <div className="flex items-center gap-2" data-testid="period-custom">
          <DatePicker
            placeholder="Od"
            value={state.custom.from ?? state.period.from}
            onChange={(v) => state.setCustom({ ...state.custom, from: v })}
            clearable={false}
          />
          <span aria-hidden className="text-muted">
            –
          </span>
          <DatePicker
            placeholder="Do"
            value={state.custom.to ?? state.period.to}
            onChange={(v) => state.setCustom({ ...state.custom, to: v })}
            clearable={false}
          />
        </div>
      )}
      <span className="text-sm text-muted tabular-nums" data-testid="period-text">
        {fmtPeriod(state.period)}
      </span>
    </div>
  );
}

/* ---------- rozdíl leadů ---------- */

const LOST_COLOR: Record<LostInfo["tone"], string> = {
  warn: "orange",
  info: "blue",
  ok: "green",
  none: "gray",
};

/** Štítek rozdílu leadů Meta × OPSYS („−3 ztraceno“); text nese význam, barva ho jen podtrhuje. */
export function LostChip({
  m,
}: {
  m: Pick<PerformanceMetrics, "leadsMeta" | "leadsOpsys" | "leadsLost">;
}) {
  const info = lostInfo(m);
  if (info.tone === "none") return <span className="text-muted">{DASH}</span>;
  const word = info.tone === "warn" ? "ztraceno" : info.tone === "info" ? "navíc" : "souhlasí";
  return (
    <Chip
      color={LOST_COLOR[info.tone]}
      title={info.hint}
      data-testid="lost-chip"
      data-tone={info.tone}
    >
      {info.tone === "ok" ? word : `${info.label} ${word}`}
    </Chip>
  );
}

/* ---------- dlaždice čísel ---------- */

function Tile({
  label,
  value,
  sub,
  testid,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  testid: string;
}) {
  return (
    <Card data-testid={testid}>
      <CardBody className="py-3">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted tabular-nums">{sub}</p>}
      </CardBody>
    </Card>
  );
}

/** Souhrn za období: útrata, zobrazení a kliky, leady Meta × OPSYS s rozdílem, CPL, vyhrané a náklad na vyhraný obchod. */
export function KpiTiles({ m, currency }: { m: PerformanceMetrics; currency: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="kpi-tiles">
      <Tile testid="kpi-spend" label="Útrata" value={fmtMoney(m.spendMinor, currency)} />
      <Tile
        testid="kpi-reach"
        label="Zobrazení"
        value={fmtInt(m.impressions)}
        sub={`${fmtInt(m.clicks)} kliků, CTR ${fmtPct(m.ctrPct)}`}
      />
      <Tile testid="kpi-leads-meta" label="Leady podle Meta" value={fmtInt(m.leadsMeta)} />
      <Tile
        testid="kpi-leads-opsys"
        label="Leady podle OPSYS"
        value={fmtInt(m.leadsOpsys)}
        sub={<LostChip m={m} />}
      />
      <Tile testid="kpi-cpl" label="Cena za lead" value={fmtMoney(m.cplMinor, currency)} />
      <Tile
        testid="kpi-cpl-opsys"
        label="Cena za lead v OPSYS"
        value={fmtMoney(m.cplOpsysMinor, currency)}
      />
      <Tile testid="kpi-won" label="Vyhrané obchody" value={fmtInt(m.wonDeals)} />
      <Tile
        testid="kpi-cost-won"
        label="Náklad na vyhraný obchod"
        value={fmtMoney(m.costPerWonMinor, currency)}
      />
    </div>
  );
}

/* ---------- tabulka (na telefonu karty) ---------- */

/** Řádek tabulky výkonu: název, čísla a volitelně přiřazená zakázka. */
export type MetricsRow = {
  id: string;
  /** Hlavní text řádku (název, případně odkaz). */
  name: ReactNode;
  /** Drobný popis pod názvem (stav, cíl). */
  sub?: ReactNode;
  metrics: PerformanceMetrics;
  /** Obsah posledního sloupce (přiřazená zakázka); jen s `extraHeader`. */
  extra?: ReactNode;
  /** Odsazení (reklamy pod sadou). */
  indent?: boolean;
};

const th = "px-3 py-2 text-right font-medium whitespace-nowrap";
const td = "px-3 py-2 text-right tabular-nums whitespace-nowrap";

/**
 * Tabulka výkonu s řádkem „Celkem“; pod 768 px se místo ní ukážou karty. Stejné sloupce všude (účet, kampaň, sada,
 * reklama, klient, zakázka).
 */
export function MetricsTable({
  rows,
  totals,
  currency,
  nameHeader,
  extraHeader,
  testid,
  empty,
}: {
  rows: MetricsRow[];
  totals?: PerformanceMetrics | undefined;
  currency: string | null;
  nameHeader: string;
  extraHeader?: string;
  testid: string;
  empty: string;
}) {
  if (rows.length === 0)
    return (
      <p className="px-4 py-6 text-sm text-muted" data-testid={`${testid}-empty`}>
        {empty}
      </p>
    );
  return (
    <>
      <div className="hidden overflow-x-auto md:block" data-testid={testid}>
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th scope="col" className="px-3 py-2 font-medium">
                {nameHeader}
              </th>
              <th scope="col" className={th}>
                Útrata
              </th>
              <th scope="col" className={th}>
                Zobrazení
              </th>
              <th scope="col" className={th}>
                Kliky
              </th>
              <th scope="col" className={th}>
                CTR
              </th>
              <th scope="col" className={th}>
                Leady Meta
              </th>
              <th scope="col" className={th}>
                Leady OPSYS
              </th>
              <th scope="col" className={th}>
                Rozdíl
              </th>
              <th scope="col" className={th}>
                Cena za lead
              </th>
              <th scope="col" className={th}>
                Vyhrané
              </th>
              <th scope="col" className={th}>
                Náklad / výhra
              </th>
              {extraHeader && (
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {extraHeader}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line-soft last:border-0" data-row={r.id}>
                <th
                  scope="row"
                  className={cn("min-w-48 px-3 py-2 text-left font-normal", r.indent && "pl-8")}
                >
                  <div>{r.name}</div>
                  {r.sub && <div className="text-xs text-muted">{r.sub}</div>}
                </th>
                <MetricCells m={r.metrics} currency={currency} />
                {extraHeader && (
                  <td className="px-3 py-2">
                    {r.extra ?? <span className="text-muted">{DASH}</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr
                className="border-t border-line bg-subtle font-medium"
                data-testid={`${testid}-total`}
              >
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  Celkem
                </th>
                <MetricCells m={totals} currency={currency} />
                {extraHeader && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <ul className="space-y-3 p-3 md:hidden" data-testid={`${testid}-cards`}>
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-line p-4" data-row={r.id}>
            <div className={cn(r.indent && "pl-3")}>
              <div className="font-medium">{r.name}</div>
              {r.sub && <div className="text-xs text-muted">{r.sub}</div>}
            </div>
            <MetricList m={r.metrics} currency={currency} />
            {extraHeader && r.extra && (
              <p className="mt-2 text-sm">
                <span className="text-muted">{extraHeader}: </span>
                {r.extra}
              </p>
            )}
          </li>
        ))}
        {totals && (
          <li
            className="rounded-lg border border-line bg-subtle p-4"
            data-testid={`${testid}-cards-total`}
          >
            <div className="font-medium">Celkem</div>
            <MetricList m={totals} currency={currency} />
          </li>
        )}
      </ul>
    </>
  );
}

function MetricCells({ m, currency }: { m: PerformanceMetrics; currency: string | null }) {
  return (
    <>
      <td className={td}>{fmtMoney(m.spendMinor, currency)}</td>
      <td className={td}>{fmtInt(m.impressions)}</td>
      <td className={td}>{fmtInt(m.clicks)}</td>
      <td className={td}>{fmtPct(m.ctrPct)}</td>
      <td className={td}>{fmtInt(m.leadsMeta)}</td>
      <td className={td}>{fmtInt(m.leadsOpsys)}</td>
      <td className={cn(td, "text-right")}>
        <LostChip m={m} />
      </td>
      <td className={td}>{fmtMoney(m.cplMinor, currency)}</td>
      <td className={td}>{fmtInt(m.wonDeals)}</td>
      <td className={td}>{fmtMoney(m.costPerWonMinor, currency)}</td>
    </>
  );
}

/** Čísla jednoho řádku jako dvousloupcový seznam „popisek – hodnota“ (karta na telefonu). */
function MetricList({ m, currency }: { m: PerformanceMetrics; currency: string | null }) {
  const items: [string, ReactNode][] = [
    ["Útrata", fmtMoney(m.spendMinor, currency)],
    ["Cena za lead", fmtMoney(m.cplMinor, currency)],
    ["Leady Meta", fmtInt(m.leadsMeta)],
    ["Leady OPSYS", fmtInt(m.leadsOpsys)],
    ["Rozdíl leadů", <LostChip key="l" m={m} />],
    ["Vyhrané obchody", fmtInt(m.wonDeals)],
    ["Náklad / výhra", fmtMoney(m.costPerWonMinor, currency)],
    ["Zobrazení", fmtInt(m.impressions)],
    ["Kliky (CTR)", `${fmtInt(m.clicks)} (${fmtPct(m.ctrPct)})`],
  ];
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- graf po dnech ---------- */

/**
 * Útrata a leady po dnech: dva grafy pod sebou, protože útrata (Kč) a leady (ks) mají jiné jednotky a jedna osa by
 * jedno z nich zploštila. Leady mají dvě řady (Meta, OPSYS), takže jejich mezera ukazuje ztracené leady.
 */
export function DailyCharts({ daily }: { daily: DailyPoint[] }) {
  const categories = useMemo(
    () => daily.map((d) => ({ key: d.date, label: dayLabel(d.date) })),
    [daily],
  );
  const spend = useMemo(
    () => [{ key: "spend", label: "Útrata", values: daily.map((d) => d.spendMinor) }],
    [daily],
  );
  const leads = useMemo(
    () => [
      { key: "leadsMeta", label: "Leady Meta", values: daily.map((d) => d.leadsMeta) },
      { key: "leadsOpsys", label: "Leady OPSYS", values: daily.map((d) => d.leadsOpsys) },
    ],
    [daily],
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="daily-charts">
      <figure>
        <figcaption className="mb-2 text-sm font-medium">
          Útrata po dnech{" "}
          <span className="font-normal text-muted tabular-nums">
            (celkem {fmtMoney(sumBy(daily, "spendMinor"))})
          </span>
        </figcaption>
        <LineChart
          categories={categories}
          series={spend}
          area
          format="money"
          height={180}
          ariaLabel="Útrata po dnech"
        />
      </figure>
      <figure>
        <figcaption className="mb-2 text-sm font-medium">
          Leady po dnech{" "}
          <span className="font-normal text-muted tabular-nums">
            (Meta {fmtInt(sumBy(daily, "leadsMeta"))}, OPSYS {fmtInt(sumBy(daily, "leadsOpsys"))})
          </span>
        </figcaption>
        <LineChart
          categories={categories}
          series={leads}
          format="number"
          height={180}
          ariaLabel="Leady po dnech, podle Meta a podle OPSYS"
        />
      </figure>
    </div>
  );
}

/* ---------- ostatní ---------- */

/** Odkaz aplikace (bez nového okna) ve stylu odkazu na záznam. */
export function AppLink({
  href,
  children,
  ...rest
}: { href: string; children: ReactNode } & Record<string, unknown>) {
  const { Link } = useNav();
  return (
    <Link href={href} className="text-accent hover:underline" {...rest}>
      {children}
    </Link>
  );
}

/** Karta se záhlavím (zkratka nad `Card`, `CardHeader`, `CardBody`). */
export function Section({
  title,
  action,
  count,
  children,
  testid,
  flush,
}: {
  title: string;
  action?: ReactNode;
  count?: number;
  children: ReactNode;
  testid?: string;
  /** Bez vnitřního odsazení (tabulka až k okraji karty). */
  flush?: boolean;
}) {
  return (
    <Card {...(testid ? { "data-testid": testid } : {})}>
      <CardHeader
        title={title}
        {...(count !== undefined ? { count } : {})}
        {...(action ? { action } : {})}
      />
      {flush ? children : <CardBody>{children}</CardBody>}
    </Card>
  );
}
