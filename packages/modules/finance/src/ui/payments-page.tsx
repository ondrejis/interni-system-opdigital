"use client";

import {
  Button,
  Combobox,
  DatePicker,
  EmptyState,
  Icon,
  Input,
  Skeleton,
  useCan,
  useCommandQuery,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { useMemo, useState } from "react";
import type { PaymentListResult } from "../contract";
import { thisMonth, today, usePeople } from "./common";
import { monthRange, shiftMonth } from "./format";
import { Select, UserSelect } from "./controls";
import { PaymentDetailDialog, PaymentFormDialog, TransitionDialog } from "./payment-dialogs";
import { PaymentsTable } from "./payments-table";
import type { PaymentRow } from "../contract";

/*
  Stránka „Platby a rozdělení“ (`/finance`): seznam všech plateb s filtry období, fakturujícího, stavu, typu zakázky
  a klienta, součty v patičce, stavový tok a zápis platby (FIN-08–12). Adresa `/finance/<id>` otevře detail platby.
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = [
  ["planned", "Plánované"],
  ["issued", "Vystavené"],
  ["paid", "Zaplacené"],
  ["canceled", "Zrušené"],
] as const;

type Period = "all" | "month" | "prev" | "year" | "custom";

/** Stránka Platby a rozdělení. */
export function PaymentsPage({ rest, query }: { rest: string[]; query?: Record<string, string> }) {
  const api = useEntityApi();
  const nav = useNav();
  const can = useCan();
  const [period, setPeriod] = useState<Period>("all");
  const [custom, setCustom] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const [dateField, setDateField] = useState<"effective" | "issued" | "paid" | "due">("effective");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [issuerId, setIssuerId] = useState("");
  const [jobType, setJobType] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [includePrivate, setIncludePrivate] = useState(true);
  const [limit, setLimit] = useState(100);
  const [creating, setCreating] = useState(query?.nova === "1");
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [transition, setTransition] = useState<{
    row: PaymentRow;
    to: "planned" | "issued" | "paid" | "canceled";
  } | null>(null);

  const range = useMemo(() => {
    const now = today();
    if (period === "month") return monthRange(thisMonth());
    if (period === "prev") return monthRange(shiftMonth(thisMonth(), -1));
    if (period === "year")
      return { from: `${now.slice(0, 4)}-01-01`, to: `${now.slice(0, 4)}-12-31` };
    if (period === "custom")
      return {
        ...(custom.from ? { from: custom.from } : {}),
        ...(custom.to ? { to: custom.to } : {}),
      };
    return {};
  }, [period, custom]);

  const input = {
    ...(Object.keys(range).length ? { period: range } : {}),
    dateField,
    ...(statuses.length ? { statuses } : {}),
    ...(issuerId ? { issuerId } : {}),
    ...(jobType ? { jobType } : {}),
    ...(companyId ? { companyId } : {}),
    overdueOnly,
    ...(search.trim() ? { search: search.trim() } : {}),
    includePrivate,
    limit,
    offset: 0,
  };
  const q = useCommandQuery<PaymentListResult, typeof input>("finance.payment.list", input);
  const people = usePeople(q.data?.people);

  const openId = rest[0] && UUID.test(rest[0]) ? rest[0] : null;
  const open = (id: string | null) => nav.push(id ? `/finance/${id}` : "/finance");
  const hasFilters =
    period !== "all" ||
    statuses.length > 0 ||
    !!issuerId ||
    !!jobType ||
    !!companyId ||
    overdueOnly ||
    !!search.trim();

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="payments-page">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <h1 className="mr-2 text-base font-semibold">Platby a rozdělení</h1>
        <Button size="sm" variant="ghost" onClick={() => nav.push("/finance/vyrovnani")}>
          <Icon name="scale" /> Vyrovnání
        </Button>
        {can("finance.read") && (
          <Button size="sm" variant="ghost" onClick={() => nav.push("/finance/prehledy")}>
            <Icon name="chart-column" /> Přehledy
          </Button>
        )}
        <span className="flex-1" />
        {can("finance.payments_write") && (
          <Button variant="primary" onClick={() => setCreating(true)} data-testid="payment-new">
            <Icon name="plus" /> Zapsat platbu
          </Button>
        )}
      </div>

      <div
        className="flex flex-wrap items-end gap-2 border-b border-line-soft px-4 py-2"
        role="search"
        aria-label="Filtry plateb"
      >
        <label className="flex flex-col gap-1 text-sm text-muted">
          Období
          <Select
            aria-label="Období"
            className="w-36"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="all">Vše</option>
            <option value="month">Tento měsíc</option>
            <option value="prev">Minulý měsíc</option>
            <option value="year">Tento rok</option>
            <option value="custom">Vlastní…</option>
          </Select>
        </label>
        {period !== "all" && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            Podle data
            <Select
              aria-label="Podle kterého data"
              className="w-36"
              value={dateField}
              onChange={(e) => setDateField(e.target.value as typeof dateField)}
            >
              <option value="effective">Platby</option>
              <option value="issued">Vystavení</option>
              <option value="paid">Zaplacení</option>
              <option value="due">Splatnosti</option>
            </Select>
          </label>
        )}
        {period === "custom" && (
          <>
            <div className="flex flex-col gap-1 text-sm text-muted">
              Od
              <DatePicker
                value={custom.from}
                onChange={(v) => setCustom((c) => ({ ...c, from: v }))}
                className="w-36"
              />
            </div>
            <div className="flex flex-col gap-1 text-sm text-muted">
              Do
              <DatePicker
                value={custom.to}
                onChange={(v) => setCustom((c) => ({ ...c, to: v }))}
                className="w-36"
              />
            </div>
          </>
        )}
        <label className="flex flex-col gap-1 text-sm text-muted">
          Fakturuje
          <UserSelect
            aria-label="Fakturující"
            allowEmpty
            value={issuerId}
            onChange={setIssuerId}
            className="w-36"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Typ zakázky
          <Select
            aria-label="Typ zakázky"
            className="w-36"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
          >
            <option value="">Všechny</option>
            <option value="web">Web</option>
            <option value="marketing">Marketing</option>
            <option value="systemy">Systémy</option>
          </Select>
        </label>
        <div className="flex flex-col gap-1 text-sm text-muted">
          Klient
          <Combobox
            load={(s) => api.lookups.records("company", s)}
            value={companyId}
            onChange={(v) => setCompanyId((v as string | null) ?? null)}
            placeholder="Všichni klienti"
            searchPlaceholder="Najít klienta…"
            clearable
            aria-label="Klient"
            className="w-44"
          />
        </div>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm text-muted">
          Hledat
          <Input
            type="search"
            aria-label="Hledat v platbách"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Popis, číslo faktury…"
          />
        </label>
      </div>
      <div
        className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-1.5"
        aria-label="Stav platby"
      >
        {STATUSES.map(([k, l]) => {
          const on = statuses.includes(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => setStatuses(on ? statuses.filter((s) => s !== k) : [...statuses, k])}
              className={`h-7 rounded-full border px-3 text-sm transition-colors ${on ? "border-accent bg-accent-soft text-accent" : "border-line-strong text-muted hover:bg-hover"}`}
            >
              {l}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={overdueOnly}
          onClick={() => setOverdueOnly(!overdueOnly)}
          className={`h-7 rounded-full border px-3 text-sm transition-colors ${overdueOnly ? "border-danger bg-danger-soft text-danger" : "border-line-strong text-muted hover:bg-hover"}`}
          data-testid="filter-overdue"
        >
          Po splatnosti
        </button>
        {can("private.read") && (
          <label className="ml-2 flex items-center gap-1.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={includePrivate}
              onChange={(e) => setIncludePrivate(e.target.checked)}
              data-testid="filter-private"
            />
            Včetně soukromých
          </label>
        )}
        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPeriod("all");
              setStatuses([]);
              setIssuerId("");
              setJobType("");
              setCompanyId(null);
              setOverdueOnly(false);
              setSearch("");
            }}
          >
            Zrušit filtry
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : q.isError ? (
          <EmptyState
            title="Platby se nepodařilo načíst"
            description={(q.error as Error).message}
          />
        ) : q.data ? (
          <>
            <PaymentsTable
              rows={q.data.rows}
              people={people}
              totals={q.data.totals}
              onOpen={open}
              emptyText={
                hasFilters
                  ? "Filtrům neodpovídá žádná platba."
                  : "Zatím žádné platby. Zapište první tlačítkem „Zapsat platbu“."
              }
            />
            {q.data.total > q.data.rows.length && (
              <div className="flex justify-center p-3">
                <Button onClick={() => setLimit(limit + 100)}>
                  Zobrazit další ({q.data.rows.length} z {q.data.total})
                </Button>
              </div>
            )}
          </>
        ) : null}
      </div>

      {openId && (
        <PaymentDetailDialog
          id={openId}
          onClose={() => open(null)}
          onEdit={(r) => setEditing(r)}
          onTransition={(r, to) => setTransition({ row: r, to })}
        />
      )}
      {creating && <PaymentFormDialog onClose={() => setCreating(false)} />}
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
