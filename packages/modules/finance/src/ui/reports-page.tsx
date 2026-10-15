"use client";

import {
  BarChart,
  Card,
  CardBody,
  CardHeader,
  DonutChart,
  EmptyState,
  Icon,
  SegmentedControl,
  Skeleton,
  useCan,
  useCommandQuery,
  useNav,
} from "@rebar/ui";
import { useMemo, useState } from "react";
import type { ReportsResult } from "../contract";
import { SHORT_MONTHS, TYPE_LABELS, money, personName, usePeople } from "./common";
import { Select } from "./controls";

/*
  Přehledy financí (FIN-19): příjmy podle osoby po měsících (rok), podle typu zakázky, podle klienta (top 10)
  a měsíční příjem z retainerů. Grafy jsou z `@rebar/ui` (sdílené konvence: barvy z tokenů, popisek pro čtečky,
  datová tabulka jako alternativa). Patrik vidí jen sdílené zakázky; vlastník si zapne „Včetně soukromých“.
*/

/** Stránka Přehledy financí. */
export function ReportsPage() {
  const can = useCan();
  const nav = useNav();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [basis, setBasis] = useState<"paid" | "issued">("paid");
  const [includePrivate, setIncludePrivate] = useState(false);
  const q = useCommandQuery<
    ReportsResult,
    { year: number; basis: string; includePrivate: boolean }
  >("finance.reports", {
    year,
    basis,
    includePrivate: includePrivate && can("private.read"),
  });
  const r = q.data;
  const people = usePeople(r?.people);

  const months = useMemo(
    () => SHORT_MONTHS.map((l, i) => ({ key: String(i + 1), label: `${l} ${year}` })),
    [year],
  );

  return (
    <div className="h-full overflow-y-auto bg-sunken" data-testid="reports-page">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-lg font-semibold">Přehledy financí</h1>
          <Select
            aria-label="Rok"
            className="w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <SegmentedControl
            label="Základ přehledu"
            value={basis}
            onChange={setBasis}
            options={[
              { value: "paid", label: "Zaplacené" },
              { value: "issued", label: "Vystavené" },
            ]}
          />
          {can("private.read") && (
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={includePrivate}
                onChange={(e) => setIncludePrivate(e.target.checked)}
                data-testid="reports-private"
              />
              Včetně soukromých
            </label>
          )}
        </div>

        {q.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : q.isError || !r ? (
          <EmptyState
            title="Přehledy se nepodařilo načíst"
            description={(q.error as Error | null)?.message ?? ""}
          />
        ) : (
          <>
            <Card>
              <CardHeader
                title={`Příjmy podle osoby po měsících ${r.year}`}
                icon={<Icon name="chart-column" />}
              />
              <CardBody>
                <p className="mb-2 text-sm text-muted">
                  Celkem{" "}
                  <strong className="text-fg tabular-nums">
                    {money(r.incomeByPerson.totalMinor)}
                  </strong>{" "}
                  (podíly z{basis === "paid" ? " zaplacených" : " vystavených"} plateb).
                </p>
                <BarChart
                  stacked
                  format="money"
                  ariaLabel={`Příjmy podle osoby po měsících ${r.year}`}
                  categories={months}
                  series={r.incomeByPerson.rows.map((p) => ({
                    key: p.userId,
                    label: personName(people, p.userId),
                    values: p.monthly,
                  }))}
                  height={280}
                />
              </CardBody>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader title="Podle typu zakázky" icon={<Icon name="briefcase" />} />
                <CardBody>
                  <DonutChart
                    format="money"
                    ariaLabel="Příjmy podle typu zakázky"
                    slices={r.incomeByType.map((t) => ({
                      key: t.type,
                      label: TYPE_LABELS[t.type] ?? t.type,
                      value: t.amountMinor,
                    }))}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Top 10 klientů" icon={<Icon name="building" />} />
                <CardBody>
                  <BarChart
                    horizontal
                    format="money"
                    ariaLabel="Top 10 klientů podle příjmu"
                    categories={r.topClients.map((c) => ({
                      key: c.companyId,
                      label: c.companyName ?? "Klient",
                      href: `/kontakty/firmy/${c.companyId}`,
                    }))}
                    series={[
                      {
                        key: "amount",
                        label: "Příjem",
                        values: r.topClients.map((c) => c.amountMinor),
                      },
                    ]}
                    height={Math.max(160, r.topClients.length * 32 + 40)}
                  />
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader
                title={`Měsíční příjem z retainerů ${r.year}`}
                icon={<Icon name="rotate-ccw" />}
              />
              <CardBody>
                <BarChart
                  stacked
                  format="money"
                  ariaLabel={`Měsíční příjem z retainerů ${r.year}`}
                  categories={r.retainerIncome.map((m) => ({
                    key: m.month,
                    label: `${SHORT_MONTHS[Number(m.month.slice(5)) - 1]} ${m.month.slice(0, 4)}`,
                  }))}
                  series={[
                    {
                      key: "paid",
                      label: "Zaplaceno",
                      values: r.retainerIncome.map((m) => m.paidMinor),
                    },
                    {
                      key: "open",
                      label: "Vystaveno a plánováno",
                      values: r.retainerIncome.map((m) => m.openMinor),
                    },
                  ]}
                  height={240}
                />
              </CardBody>
            </Card>
            <p className="text-sm text-muted">
              Zobrazují se jen sdílené zakázky
              {includePrivate ? " a (jako vlastník) i soukromé" : ""}.{" "}
              <button
                type="button"
                className="text-accent underline"
                onClick={() => nav.push("/finance")}
              >
                Zpět na platby
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
