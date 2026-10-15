"use client";

import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Icon,
  Skeleton,
  useCommandQuery,
  useNav,
} from "@rebar/ui";
import { useState } from "react";
import type { ClientFinanceOverview, PaymentRow } from "../contract";
import { monthName, money, personName, usePeople } from "./common";
import { Select } from "./controls";
import { PaymentDetailDialog, PaymentFormDialog, TransitionDialog } from "./payment-dialogs";
import { PaymentsTable } from "./payments-table";

/*
  Záložka „Finance“ na kartě klienta (KLI-07, KLI-10): celkem zaplaceno, za 12 měsíců, v roce, nezaplacené platby,
  aktivní měsíční retainery a platby všech zakázek klienta. Patrik vidí jen součty ze sdílených zakázek (řeší server).
*/

/** Obsah záložky Finance na kartě klienta. */
export function ClientFinanceTab({ companyId }: { companyId: string }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const nav = useNav();
  const q = useCommandQuery<ClientFinanceOverview, { companyId: string; year: number }>(
    "finance.client.overview",
    {
      companyId,
      year,
    },
  );
  const o = q.data;
  const people = usePeople(o?.people);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [transition, setTransition] = useState<{
    row: PaymentRow;
    to: "planned" | "issued" | "paid" | "canceled";
  } | null>(null);

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError || !o)
    return (
      <EmptyState
        title="Finance klienta se nepodařilo načíst"
        description={(q.error as Error | null)?.message ?? ""}
      />
    );

  const kpis: [string, string, string?][] = [
    ["Zaplaceno celkem", money(o.paidTotalMinor)],
    ["Za 12 měsíců", money(o.paid12mMinor)],
    [`Za rok ${o.year}`, money(o.paidYearMinor)],
    [
      "Nezaplaceno",
      `${money(o.unpaidMinor)} (${o.unpaidCount})`,
      o.unpaidCount > 0 ? "text-warning" : "",
    ],
  ];
  return (
    <div className="space-y-4" data-testid="client-finance-tab">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(([label, value, tone]) => (
          <Card key={label}>
            <CardBody className="py-3">
              <p className="text-sm text-muted">{label}</p>
              <p className={`text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {o.retainers.length > 0 && (
        <Card>
          <CardHeader
            title="Aktivní retainery"
            icon={<Icon name="rotate-ccw" />}
            count={o.retainers.length}
          />
          <ul className="divide-y divide-[var(--line-soft)]">
            {o.retainers.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <button
                  type="button"
                  className="text-left text-accent hover:underline"
                  onClick={() => nav.push(`/zakazky/${r.jobId}?tab=finance`)}
                >
                  {r.jobNumber} {r.jobTitle}
                </button>
                <span className="text-sm text-muted">
                  <strong className="text-fg tabular-nums">{money(r.amountMinor)}</strong> měsíčně
                  od {monthName(r.fromMonth)}
                  {r.issuerMode === "alternate"
                    ? ", střídavě"
                    : `, fakturuje ${personName(people, r.issuerId)}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Platby"
          icon={<Icon name="wallet" />}
          count={o.payments.length}
          action={
            <Select
              aria-label="Rok plateb"
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
          }
        />
        <PaymentsTable
          rows={o.payments}
          people={people}
          totals={o.totals}
          compact
          showJob
          showClient={false}
          onOpen={setOpenId}
          emptyText="Klient zatím nemá žádné platby."
        />
      </Card>

      {openId && (
        <PaymentDetailDialog
          id={openId}
          onClose={() => setOpenId(null)}
          onEdit={(r) => setEditing(r)}
          onTransition={(r, to) => setTransition({ row: r, to })}
        />
      )}
      {editing && <PaymentFormDialog row={editing} onClose={() => setEditing(null)} />}
      {transition && (
        <TransitionDialog
          row={transition.row}
          to={transition.to}
          people={people}
          onClose={() => setTransition(null)}
        />
      )}
    </div>
  );
}
