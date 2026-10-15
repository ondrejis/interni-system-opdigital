"use client";

import { todayIso } from "@rebar/core/time";
import {
  EmptyState,
  SegmentedControl,
  Skeleton,
  useCommandQuery,
  type SegmentOption,
} from "@rebar/ui";
import { useMemo, useState } from "react";
import type { AccountsListOutput, AdsOverviewOutput } from "../contract";
import { campaignRows } from "./account-overview";
import { OwnerChip } from "./account-parts";
import { AppLink, DailyCharts, KpiTiles, MetricsTable, Section } from "./common";
import {
  accountHref,
  aggregateMonthly,
  fmtInt,
  fmtMoney,
  fmtMonth,
  fmtPeriod,
  lastMonthsPeriod,
  type MonthRow,
} from "./format";

/*
  Záložka „Reklama“ na kartě klienta (KLI-08) a v detailu marketingové zakázky: útrata, leady Meta × OPSYS, cena za lead
  a vyhrané obchody za zvolený počet měsíců, tabulka po měsících, graf po dnech a kampaně. U klienta navíc jeho reklamní
  účty. Čísla berou příkazy `reklama.forClient` a `reklama.forJob` (respektují soukromé obchody aktéra).
*/

const RANGES: SegmentOption<"3" | "6" | "12">[] = [
  { value: "3", label: "3 měsíce" },
  { value: "6", label: "6 měsíců" },
  { value: "12", label: "12 měsíců" },
];

/** Tabulka po měsících (nejnovější nahoře); na telefonu karty. */
export function MonthlyTable({ rows, currency }: { rows: MonthRow[]; currency: string | null }) {
  const sorted = [...rows].reverse();
  return (
    <>
      <div className="hidden overflow-x-auto md:block" data-testid="monthly-table">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Měsíc
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Útrata
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Leady Meta
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Leady OPSYS
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Cena za lead
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.month}
                className="border-b border-line-soft last:border-0"
                data-month={r.month}
              >
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {fmtMonth(r.month)}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtMoney(r.spendMinor, currency)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.leadsMeta)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.leadsOpsys)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtMoney(r.cplMinor, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 p-3 md:hidden" data-testid="monthly-cards">
        {sorted.map((r) => (
          <li key={r.month} className="rounded-lg border border-line p-4" data-month={r.month}>
            <p className="font-medium">{fmtMonth(r.month)}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted">Útrata</dt>
                <dd className="tabular-nums">{fmtMoney(r.spendMinor, currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Cena za lead</dt>
                <dd className="tabular-nums">{fmtMoney(r.cplMinor, currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Leady Meta</dt>
                <dd className="tabular-nums">{fmtInt(r.leadsMeta)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Leady OPSYS</dt>
                <dd className="tabular-nums">{fmtInt(r.leadsOpsys)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function ClientAccounts({ companyId }: { companyId: string }) {
  const q = useCommandQuery<AccountsListOutput, { includeInactive: boolean }>(
    "reklama.accounts.list",
    { includeInactive: false },
  );
  const mine = (q.data?.accounts ?? []).filter(
    (a) => a.ownerKind === "client" && a.companyId === companyId,
  );
  if (mine.length === 0) return null;
  return (
    <Section title="Reklamní účty klienta" count={mine.length} flush testid="client-accounts">
      <ul className="divide-y divide-[var(--line-soft)]">
        {mine.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <AppLink href={accountHref(a.id)}>{a.name}</AppLink>
            <span className="flex items-center gap-3 text-sm text-muted">
              <OwnerChip a={a} />
              <span className="tabular-nums">
                tento měsíc {fmtMoney(a.spendThisMonthMinor, a.currency)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function AdsTab({
  command,
  input,
  forClient,
}: {
  command: "reklama.forClient" | "reklama.forJob";
  input: { companyId: string } | { jobId: string };
  forClient?: string;
}) {
  const [range, setRange] = useState<"3" | "6" | "12">("6");
  const period = useMemo(() => lastMonthsPeriod(todayIso(), Number(range)), [range]);
  const q = useCommandQuery<AdsOverviewOutput, typeof input & { period: typeof period }>(command, {
    ...input,
    period,
  });
  const d = q.data;
  const monthly = useMemo(() => (d ? aggregateMonthly(d.daily) : []), [d]);
  const currency = d?.currency ?? null;

  return (
    <div className="space-y-4" data-testid="ads-tab">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl label="Období" options={RANGES} value={range} onChange={setRange} />
        <span className="text-sm text-muted tabular-nums">{fmtPeriod(period)}</span>
      </div>
      {q.isLoading && <Skeleton className="h-40 w-full" />}
      {q.isError && (
        <EmptyState title="Reklamu se nepodařilo načíst" description={(q.error as Error).message} />
      )}
      {d && d.campaigns.length === 0 && (
        <EmptyState
          title="Zatím žádná reklama"
          description={
            forClient
              ? "Klient nemá reklamní účet ani kampaň přiřazenou své marketingové zakázce. Účet přiřadíte v Reklama → Účty, kampaň v jejím detailu."
              : "K zakázce zatím není přiřazená žádná kampaň. Přiřadíte ji v detailu kampaně v Reklama."
          }
        />
      )}
      {d && d.campaigns.length > 0 && (
        <>
          <KpiTiles m={d.totals} currency={currency} />
          <Section title="Po měsících" count={monthly.length} flush testid="ads-monthly">
            <MonthlyTable rows={monthly} currency={currency} />
          </Section>
          <Section title="Útrata a leady po dnech">
            <DailyCharts daily={d.daily} />
          </Section>
          <Section title="Kampaně" count={d.campaigns.length} flush testid="ads-campaigns">
            <MetricsTable
              testid="ads-campaigns-table"
              nameHeader="Kampaň"
              extraHeader="Zakázka"
              rows={campaignRows(d.campaigns)}
              totals={d.totals}
              currency={currency}
              empty="Žádné kampaně."
            />
          </Section>
        </>
      )}
      {forClient && <ClientAccounts companyId={forClient} />}
    </div>
  );
}

/** Záložka Reklama na kartě klienta. */
export function ClientAdsTab({ companyId }: { companyId: string }) {
  return <AdsTab command="reklama.forClient" input={{ companyId }} forClient={companyId} />;
}

/** Záložka Reklama v detailu marketingové zakázky. */
export function JobAdsTab({ jobId }: { jobId: string }) {
  return <AdsTab command="reklama.forJob" input={{ jobId }} />;
}
