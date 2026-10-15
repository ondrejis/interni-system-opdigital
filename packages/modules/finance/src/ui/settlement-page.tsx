"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  ConfirmDialog,
  DatePicker,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Icon,
  Input,
  MoneyInput,
  Skeleton,
  cn,
  useCan,
  useCommandQuery,
  useNav,
} from "@rebar/ui";
import { Fragment, useState } from "react";
import type { BalanceMonthsResult, BalanceView, SettlementRow } from "../contract";
import {
  METHOD_LABELS,
  fmtDate,
  monthName,
  money,
  personName,
  today,
  usePeople,
  useToastMutation,
} from "./common";
import { Select, UserSelect } from "./controls";
import { PaymentDetailDialog, PaymentFormDialog, TransitionDialog } from "./payment-dialogs";
import { PaymentsTable } from "./payments-table";
import type { PaymentRow } from "../contract";

/*
  Stránka „Vyrovnání“ (FIN-14–18): nahoře jedno číslo („Patrik dluží Ondřejovi 12 400 Kč“ / „Vyrovnáno“), pod ním rozpis
  po měsících s rozkliknutím na konkrétní platby, zapsaná vyrovnání se stornem a dialog „Zapsat vyrovnání“.
  Soukromé zakázky a platby bez zakázky se do salda nepočítají (řeší server).
*/

/** Dialog „Zapsat vyrovnání“: kdo, komu, kolik (předvyplněno saldem), kdy, jak a číslo dokladu. */
export function SettlementDialog({
  suggested,
  onClose,
}: {
  suggested: BalanceView["suggestedSettlement"];
  onClose: () => void;
}) {
  const [from, setFrom] = useState(suggested?.fromUserId ?? "");
  const [to, setTo] = useState(suggested?.toUserId ?? "");
  const [amount, setAmount] = useState<number | null>(suggested?.amountMinor ?? null);
  const [settledOn, setSettledOn] = useState<string | null>(today());
  const [method, setMethod] = useState<"invoice" | "transfer" | "offset">("transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const m = useToastMutation("finance.settlement.create", {
    success: "Vyrovnání zapsáno.",
    onOk: onClose,
  });
  const errors = {
    from: !from ? "Vyberte, kdo platí." : undefined,
    to: !to
      ? "Vyberte, komu se platí."
      : from && to === from
        ? "Zvolte dvě různé osoby."
        : undefined,
    amount: !amount || amount <= 0 ? "Zadejte částku větší než 0." : undefined,
    date: !settledOn ? "Vyplňte datum." : undefined,
  };
  const submit = () => {
    setShowErrors(true);
    if (Object.values(errors).some(Boolean) || !amount || !settledOn) return;
    m.run({
      fromUserId: from,
      toUserId: to,
      amountMinor: amount,
      settledOn,
      method,
      reference: reference.trim() || null,
      note: note.trim() || null,
    });
  };
  const e = (k: keyof typeof errors) => (showErrors ? errors[k] : undefined);
  return (
    <Dialog open onOpenChange={(o) => !o && !m.pending && onClose()}>
      <DialogContent
        title="Zapsat vyrovnání"
        description="Eviduje vzájemné vyrovnání mezi vámi; peníze se tím nikam neposílají."
        data-testid="settlement-dialog"
      >
        <div className="space-y-1 px-5 py-4">
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Kdo platí" error={e("from")}>
              <UserSelect aria-label="Kdo platí" value={from} onChange={setFrom} />
            </Field>
            <Field label="Komu" error={e("to")}>
              <UserSelect aria-label="Komu" value={to} onChange={setTo} />
            </Field>
            <Field label="Částka" error={e("amount")}>
              <MoneyInput value={amount} onChange={setAmount} aria-label="Částka vyrovnání" />
            </Field>
            <Field label="Kdy" error={e("date")}>
              <DatePicker value={settledOn} onChange={setSettledOn} clearable={false} />
            </Field>
            <Field label="Jak">
              <Select
                aria-label="Způsob vyrovnání"
                value={method}
                onChange={(ev) => setMethod(ev.target.value as typeof method)}
              >
                {Object.entries(METHOD_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Číslo dokladu">
              <Input
                value={reference}
                onChange={(ev) => setReference(ev.target.value)}
                placeholder="číslo faktury, převodu…"
              />
            </Field>
          </div>
          <Field label="Poznámka">
            <Input value={note} onChange={(ev) => setNote(ev.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <Button variant="ghost" onClick={onClose} disabled={m.pending}>
            Zrušit
          </Button>
          <Button
            variant="primary"
            loading={m.pending}
            onClick={submit}
            data-testid="settlement-save"
          >
            Zapsat vyrovnání
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MonthDetail({
  month,
  basis,
  onOpen,
}: {
  month: string;
  basis: "paid" | "issued";
  onOpen: (id: string) => void;
}) {
  const q = useCommandQuery<BalanceMonthsResult, { basis: string; month: string }>(
    "finance.balance.months",
    {
      basis,
      month,
    },
  );
  const people = usePeople(q.data?.people);
  if (q.isLoading) return <Skeleton className="m-3 h-16" />;
  return (
    <PaymentsTable
      rows={q.data?.payments ?? []}
      people={people}
      compact
      showJob
      showClient={false}
      readOnly
      onOpen={onOpen}
      emptyText="V tomto měsíci nejsou žádné platby."
    />
  );
}

/** Stránka Vyrovnání. */
export function SettlementPage({ autoOpen = false }: { autoOpen?: boolean }) {
  const can = useCan();
  const nav = useNav();
  const [basis, setBasis] = useState<"paid" | "issued" | undefined>(undefined);
  const bal = useCommandQuery<BalanceView, { basis?: string }>(
    "finance.balance",
    basis ? { basis } : {},
  );
  const effBasis = bal.data?.basis ?? basis ?? "paid";
  const months = useCommandQuery<BalanceMonthsResult, { basis: string }>("finance.balance.months", {
    basis: effBasis,
  });
  const people = usePeople(bal.data?.people);
  const [writing, setWriting] = useState(autoOpen);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelRow, setCancelRow] = useState<SettlementRow | null>(null);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [transition, setTransition] = useState<{
    row: PaymentRow;
    to: "planned" | "issued" | "paid" | "canceled";
  } | null>(null);
  const cancel = useToastMutation<{ id: string; reason?: string }>("finance.settlement.cancel", {
    success: "Vyrovnání stornováno.",
  });

  const data = bal.data;
  const personIds = [
    ...new Set([
      ...(data?.perPerson.map((p) => p.userId) ?? []),
      ...(months.data?.months.flatMap((m) => Object.keys(m.invoiced)) ?? []),
    ]),
  ];
  const settled = data?.headline === null || data?.headlineText === "Vyrovnáno";

  return (
    <div className="h-full overflow-y-auto bg-sunken" data-testid="settlement-page">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium uppercase tracking-wide text-faint">
                Saldo vyrovnání
              </p>
              {bal.isLoading ? (
                <Skeleton className="mt-2 h-9 w-72" />
              ) : bal.isError ? (
                <p className="mt-1 text-danger">{(bal.error as Error).message}</p>
              ) : (
                <p
                  className={cn(
                    "mt-1 text-2xl font-semibold tabular-nums",
                    settled ? "text-success" : "text-fg",
                  )}
                  data-testid="balance-headline"
                  aria-live="polite"
                >
                  {data?.headlineText}
                </p>
              )}
              <p className="mt-1 text-sm text-muted">
                Počítá se ze {effBasis === "paid" ? "zaplacených" : "vystavených i zaplacených"}{" "}
                plateb sdílených zakázek
                {data && data.settlementsApplied > 0
                  ? `, po zápočtu ${data.settlementsApplied}× vyrovnání`
                  : ""}
                .
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Základ výpočtu salda"
                className="w-48"
                value={effBasis}
                onChange={(e) => setBasis(e.target.value as "paid" | "issued")}
              >
                <option value="paid">Základ: zaplacené</option>
                <option value="issued">Základ: vystavené</option>
              </Select>
              {can("finance.settlements_write") && (
                <Button
                  variant="primary"
                  disabled={!data}
                  onClick={() => setWriting(true)}
                  data-testid="settlement-new"
                >
                  <Icon name="plus" /> Zapsat vyrovnání
                </Button>
              )}
            </div>
          </CardBody>
          {data && data.perPerson.length > 0 && (
            <CardBody className="grid gap-3 border-t border-line-soft sm:grid-cols-2">
              {data.perPerson.map((p) => (
                <div key={p.userId} className="rounded-lg bg-subtle p-3">
                  <p className="font-medium">{personName(people, p.userId)}</p>
                  <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 text-sm">
                    <dt className="text-muted">Fakturoval</dt>
                    <dd className="tabular-nums">{money(p.invoicedMinor)}</dd>
                    <dt className="text-muted">Patří mu</dt>
                    <dd className="tabular-nums">{money(p.entitledMinor)}</dd>
                    <dt className="text-muted">Rozdíl</dt>
                    <dd className="tabular-nums">{money(p.differenceMinor)}</dd>
                  </dl>
                </div>
              ))}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Rozpis po měsících" icon={<Icon name="calendar-days" />} />
          {months.isLoading ? (
            <Skeleton className="m-4 h-24" />
          ) : !months.data || months.data.months.length === 0 ? (
            <EmptyState
              title="Zatím není co vyrovnávat"
              description="Rozpis vznikne z prvních zaplacených plateb sdílených zakázek."
            />
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[34rem] border-collapse text-base"
                data-testid="balance-months"
              >
                <thead>
                  <tr className="h-9 border-b border-line bg-subtle text-left text-sm text-muted">
                    <th className="px-3 font-medium">Měsíc</th>
                    {personIds.map((id) => (
                      <Fragment key={id}>
                        <th className="px-3 text-right font-medium">
                          Fakturoval {personName(people, id)}
                        </th>
                        <th className="px-3 text-right font-medium">
                          Patří {personName(people, id)}
                        </th>
                      </Fragment>
                    ))}
                    <th className="px-3 font-medium">Rozdíl</th>
                  </tr>
                </thead>
                <tbody>
                  {months.data.months.map((mo) => {
                    const key = mo.month ?? "none";
                    const isOpen = expanded === key;
                    const debt = mo.debts[0];
                    return (
                      <Fragment key={key}>
                        <tr
                          className="h-9 cursor-pointer border-b border-line-soft hover:bg-hover"
                          onClick={() => mo.month && setExpanded(isOpen ? null : key)}
                          data-testid="balance-month"
                        >
                          <td className="px-3">
                            <button
                              type="button"
                              className="flex items-center gap-1.5 font-medium"
                              aria-expanded={isOpen}
                              disabled={!mo.month}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                if (mo.month) setExpanded(isOpen ? null : key);
                              }}
                            >
                              <Icon name={isOpen ? "chevron-down" : "chevron-right"} />
                              {monthName(mo.month)}
                              <span className="text-sm font-normal text-faint">
                                ({mo.paymentIds.length})
                              </span>
                            </button>
                          </td>
                          {personIds.map((id) => (
                            <Fragment key={id}>
                              <td className="px-3 text-right tabular-nums">
                                {money(mo.invoiced[id] ?? 0)}
                              </td>
                              <td className="px-3 text-right tabular-nums">
                                {money(mo.entitled[id] ?? 0)}
                              </td>
                            </Fragment>
                          ))}
                          <td className="px-3 text-sm">
                            {debt
                              ? `${personName(people, debt.debtorId)} dluží ${personName(people, debt.creditorId)} ${money(debt.amountMinor)}`
                              : "Bez rozdílu"}
                          </td>
                        </tr>
                        {isOpen && mo.month && (
                          <tr>
                            <td colSpan={2 + personIds.length * 2} className="bg-sunken p-0">
                              <MonthDetail month={mo.month} basis={effBasis} onOpen={setOpen} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Zapsaná vyrovnání"
            icon={<Icon name="banknote" />}
            count={data?.settlements.filter((s) => !s.canceledAt).length ?? 0}
          />
          {!data || data.settlements.length === 0 ? (
            <p className="p-4 text-muted">Zatím nebylo zapsáno žádné vyrovnání.</p>
          ) : (
            <ul className="divide-y divide-[var(--line-soft)]" data-testid="settlement-list">
              {data.settlements.map((s) => (
                <li
                  key={s.id}
                  className={cn(
                    "flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2",
                    s.canceledAt && "opacity-60",
                  )}
                  data-testid="settlement-row"
                >
                  <span className="w-24 tabular-nums text-muted">{fmtDate(s.settledOn)}</span>
                  <span className={cn("min-w-0 flex-1", s.canceledAt && "line-through")}>
                    {personName(people, s.fromUserId)} → {personName(people, s.toUserId)}{" "}
                    <strong className="tabular-nums">{money(s.amountMinor)}</strong>
                    <span className="text-muted">
                      {" "}
                      · {METHOD_LABELS[s.method]}
                      {s.reference ? ` · ${s.reference}` : ""}
                    </span>
                  </span>
                  {s.canceledAt ? (
                    <Chip color="red">Stornováno {fmtDate(s.canceledAt.slice(0, 10))}</Chip>
                  ) : (
                    can("finance.settlements_write") && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelRow(s)}>
                        Stornovat
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <p className="text-sm text-muted">
          Soukromé zakázky se do vyrovnání nepočítají.{" "}
          <button
            type="button"
            className="text-accent underline"
            onClick={() => nav.push("/finance")}
          >
            Zpět na platby
          </button>
        </p>
      </div>

      {writing && data && (
        <SettlementDialog suggested={data.suggestedSettlement} onClose={() => setWriting(false)} />
      )}
      <ConfirmDialog
        open={cancelRow !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCancelRow(null);
            setReason("");
          }
        }}
        title="Stornovat vyrovnání?"
        description="Vyrovnání se přestane počítat do salda a dluh se vrátí. Záznam zůstane v historii."
        confirmLabel="Stornovat"
        danger
        onConfirm={() => {
          if (cancelRow)
            cancel.run({ id: cancelRow.id, ...(reason.trim() ? { reason: reason.trim() } : {}) });
        }}
      >
        <Field label="Důvod (nepovinné)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </ConfirmDialog>
      {open && (
        <PaymentDetailDialog
          id={open}
          onClose={() => setOpen(null)}
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
