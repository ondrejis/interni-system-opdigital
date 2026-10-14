"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import { todayIso, addDaysIso } from "@rebar/core/time";
import {
  Button,
  Chip,
  Combobox,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  IconButton,
  Input,
  MoneyInput,
  Notice,
  RelatedRecords,
  Skeleton,
  Textarea,
  defineModuleUi,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useVatRates,
  vatBpChoices,
  type RecordAction,
  type RecordTab,
} from "@rebar/ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  documentTotals,
  lineNetMinor,
  paymentState,
  retentionGroups,
  retentionPct,
  type LineInput,
  type LineRole,
  type VatMode,
} from "./totals";
import * as billing from "./billing/ui";
import { LockNotice } from "./billing/ui";
import * as received from "./received/ui";
import * as dispatch from "./dispatch/ui";
import { ExportPage } from "./export-page";
import { SettingsPage } from "./settings-page";

const areas = [billing, received];

type Inv = {
  id: string;
  number: string | null;
  title: string;
  kind: string;
  state: string;
  companyId: string;
  personId: string | null;
  issueDate: string | null;
  taxableDate: string | null;
  dueDate: string | null;
  note: string | null;
  currency: string;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  paidMinor: number;
  overdue: boolean;
  vatMode: VatMode;
  retentionMinor: number;
  retentionBp: number;
  statement: { id: string; number: number; periodFrom: string; periodTo: string } | null;
  customerHasDic: boolean;
  reverseChargeText: string;
  lockedAt: string | null;
  lockReason: string | null;
  canReopen: boolean;
  vatPayer: boolean;
  defaultVatBp: number;
  dueDays: number;
  groups: { vatRateBp: number; netMinor: number; vatMinor: number; grossMinor: number }[];
  lines: {
    description: string;
    quantity: string;
    unit: string;
    unitPriceMinor: number;
    vatRateBp: number;
    netMinor: number;
    role: LineRole;
    budgetItemId: string | null;
    refInvoiceId: string | null;
  }[];
  payments: {
    id: string;
    date: string;
    amountMinor: number;
    method: string | null;
    note: string | null;
  }[];
};

const pct = (bp: number) => `${(bp / 100).toLocaleString("cs-CZ")} %`;

function Err({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="mt-2 text-sm text-danger">
      {error.message}
    </p>
  ) : null;
}

const useInvoice = (id: string) => useCommandQuery<Inv>("fakturace.get", { id });

/* ---------- Položky ---------- */

type Draft = {
  description: string;
  quantity: string;
  unit: string;
  price: number | null;
  vatRateBp: number;
  role: LineRole;
  budgetItemId: string | null;
  refInvoiceId: string | null;
};

const MODE_OPTIONS = [
  { value: "standard", label: "Běžný režim DPH" },
  { value: "reverse_charge", label: "Přenesená daňová povinnost" },
];

function ReopenDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const run = useCommandMutation<{ id: string; reason: string }>("fakturace.reopen", {
    onSuccess: () => {
      onOpenChange(false);
      successToast("Doklad je zpět v konceptu, číslo mu zůstalo.");
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Vrátit doklad do konceptu"
        description="Výjimečná oprava hned po vystavení. Zapíše se do auditu, doklad si ponechá své číslo."
      >
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            run.mutate({ id, reason });
          }}
        >
          <Field label="Důvod" htmlFor="reopen-reason">
            <Input
              id="reopen-reason"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Err error={run.error as Error | null} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={run.isPending}
              disabled={reason.trim().length < 3}
            >
              Vrátit do konceptu
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinesTab({ id }: { id: string }) {
  const q = useInvoice(id);
  const inv = q.data;
  const vat = useVatRates();
  const [lines, setLines] = useState<Draft[] | null>(null);
  const [meta, setMeta] = useState<{
    dueDate: string | null;
    note: string;
    vatMode: VatMode;
  }>({
    dueDate: null,
    note: "",
    vatMode: "standard",
  });
  const [reopen, setReopen] = useState(false);
  const save = useCommandMutation<Record<string, unknown>>("fakturace.saveDraft", {
    onSuccess: () => successToast("Doklad uložen."),
  });

  useEffect(() => {
    if (inv && lines === null) {
      setLines(
        inv.lines
          .filter((l) => l.role !== "retention")
          .map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unit: l.unit,
            price: l.unitPriceMinor,
            vatRateBp: l.vatRateBp,
            role: l.role,
            budgetItemId: l.budgetItemId,
            refInvoiceId: l.refInvoiceId,
          })),
      );
      setMeta({ dueDate: inv.dueDate, note: inv.note ?? "", vatMode: inv.vatMode });
    }
  }, [inv, lines]);

  if (q.isLoading || !inv || lines === null) return <Skeleton className="h-32" />;
  const editable = inv.state === "draft";
  const mode: VatMode = editable ? meta.vatMode : inv.vatMode;
  const reverse = mode === "reverse_charge";
  const retains = inv.kind === "partial" || inv.kind === "final";
  // zádržné se na serveru počítá ze zakázky; v konceptu se ukáže hned a při uložení se přepočítá
  const inputLines = (
    editable
      ? lines.map((l) => ({
          quantity: l.quantity || "0",
          unitPriceMinor: l.price ?? 0,
          vatRateBp: l.vatRateBp,
          role: l.role,
        }))
      : inv.lines.map((l) => ({
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          vatRateBp: l.vatRateBp,
          role: l.role,
        }))
  ) as LineInput[];
  const retentionPreview =
    editable && retains ? retentionGroups(inputLines, inv.retentionBp, mode) : [];
  const allLines: LineInput[] = [
    ...inputLines,
    ...retentionPreview.map((g) => ({
      quantity: 1,
      unitPriceMinor: -g.retainMinor,
      vatRateBp: g.vatRateBp,
      role: "retention" as const,
    })),
  ];
  const totals = documentTotals(allLines, { vatMode: mode });
  const before = documentTotals(
    allLines.filter((l) => l.role !== "retention"),
    { vatMode: mode },
  );
  const retentionGross = before.grossMinor - totals.grossMinor;
  const hasRetention = retentionGross > 0;
  const rates = vatBpChoices(vat, [inv.defaultVatBp, ...lines.map((l) => l.vatRateBp)]);
  const set = (i: number, patch: Partial<Draft>) =>
    setLines((ls) => ls!.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const money = (v: number) => formatMinor(v, inv.currency);
  const rateCell = (bp: number) => (reverse || !inv.vatPayer ? "—" : pct(bp));
  const subRole = (r: LineRole) => r === "advance" || r === "previous";

  return (
    <div className="space-y-4">
      {!editable && inv.lockReason && (
        <LockNotice
          reason={inv.lockReason}
          canReopen={inv.canReopen}
          onReopen={() => setReopen(true)}
        />
      )}
      {inv.statement && (
        <p className="text-sm text-muted" data-testid="invoice-statement">
          Vzniklo ze soupisu provedených prací č. {inv.statement.number} za období{" "}
          {formatDate(inv.statement.periodFrom)} – {formatDate(inv.statement.periodTo)}.
        </p>
      )}
      {!inv.vatPayer && (
        <p className="rounded-md bg-subtle px-3 py-2 text-sm text-muted">
          Dodavatel není plátce DPH (firma nemá DIČ), doklad se tiskne bez DPH. Plátce DPH se
          nastaví v Nastavení fakturace.
        </p>
      )}
      {reverse && (
        <Notice tone="info" title="Přenesená daňová povinnost">
          Doklad se vystaví bez DPH s textem „{inv.reverseChargeText}“.
          {!inv.customerHasDic && " Odběratel nemá DIČ, bez něj doklad nejde vystavit."}
        </Notice>
      )}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[44rem] text-left" data-testid="invoice-lines">
          <thead className="bg-subtle text-sm text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Popis</th>
              <th className="px-3 py-2 text-right font-medium">Množství</th>
              <th className="px-3 py-2 font-medium">Jedn.</th>
              <th className="px-3 py-2 text-right font-medium">Cena / j.</th>
              <th className="px-3 py-2 text-right font-medium">DPH</th>
              <th className="px-3 py-2 text-right font-medium">Základ</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) =>
              editable && !subRole(l.role) ? (
                <tr key={i}>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label={`Popis položky ${i + 1}`}
                      value={l.description}
                      onChange={(e) => set(i, { description: e.target.value })}
                    />
                  </td>
                  <td className="w-24 px-2 py-1.5">
                    <Input
                      aria-label={`Množství ${i + 1}`}
                      inputMode="decimal"
                      className="text-right"
                      value={l.quantity}
                      onChange={(e) => set(i, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="w-20 px-2 py-1.5">
                    <Input
                      aria-label={`Jednotka ${i + 1}`}
                      value={l.unit}
                      onChange={(e) => set(i, { unit: e.target.value })}
                    />
                  </td>
                  <td className="w-36 px-2 py-1.5">
                    <MoneyInput
                      aria-label={`Cena za jednotku ${i + 1}`}
                      className="text-right"
                      value={l.price}
                      onChange={(v) => set(i, { price: v })}
                    />
                  </td>
                  <td className="w-28 px-2 py-1.5">
                    {inv.vatPayer && !reverse ? (
                      <Combobox
                        options={rates.map((r) => ({ value: String(r), label: pct(r) }))}
                        value={String(l.vatRateBp)}
                        onChange={(v) => v && set(i, { vatRateBp: Number(v) })}
                      />
                    ) : (
                      <span className="px-2 text-muted">—</span>
                    )}
                  </td>
                  <td className="tabular px-3 py-1.5 text-right">
                    {money(lineNetMinor(l.quantity || "0", l.price ?? 0))}
                  </td>
                  <td className="px-1">
                    <IconButton
                      label={`Odebrat položku ${i + 1}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => setLines((ls) => ls!.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                    </IconButton>
                  </td>
                </tr>
              ) : (
                <tr key={i} className={subRole(l.role) ? "text-muted" : undefined}>
                  <td className="px-3 py-2">{l.description}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {Number(l.quantity).toLocaleString("cs-CZ")}
                  </td>
                  <td className="px-3 py-2">{l.unit}</td>
                  <td className="tabular px-3 py-2 text-right">{money(l.price ?? 0)}</td>
                  <td className="tabular px-3 py-2 text-right">{rateCell(l.vatRateBp)}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {money(lineNetMinor(l.quantity, l.price ?? 0))}
                  </td>
                  <td />
                </tr>
              ),
            )}
            {(editable ? retentionPreview : []).map((g) => (
              <tr key={`ret-${g.vatRateBp}`} className="text-muted" data-testid="retention-row">
                <td className="px-3 py-2">
                  Zádržné {retentionPct(inv.retentionBp)} % z {money(g.basisMinor)}
                  {retentionPreview.length > 1 && !reverse ? ` (sazba ${pct(g.vatRateBp)})` : ""}
                </td>
                <td className="tabular px-3 py-2 text-right">1</td>
                <td className="px-3 py-2">ks</td>
                <td className="tabular px-3 py-2 text-right">{money(-g.retainMinor)}</td>
                <td className="tabular px-3 py-2 text-right">{rateCell(g.vatRateBp)}</td>
                <td className="tabular px-3 py-2 text-right">{money(-g.retainMinor)}</td>
                <td />
              </tr>
            ))}
            {!editable &&
              inv.lines
                .filter((l) => l.role === "retention")
                .map((l, k) => (
                  <tr key={`ret-${k}`} className="text-muted" data-testid="retention-row">
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="tabular px-3 py-2 text-right">1</td>
                    <td className="px-3 py-2">ks</td>
                    <td className="tabular px-3 py-2 text-right">{money(l.unitPriceMinor)}</td>
                    <td className="tabular px-3 py-2 text-right">{rateCell(l.vatRateBp)}</td>
                    <td className="tabular px-3 py-2 text-right">{money(l.netMinor)}</td>
                    <td />
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        {editable ? (
          <Button
            variant="secondary"
            onClick={() =>
              setLines((ls) => [
                ...ls!,
                {
                  description: "",
                  quantity: "1",
                  unit: "ks",
                  price: null,
                  vatRateBp: inv.defaultVatBp,
                  role: "work",
                  budgetItemId: null,
                  refInvoiceId: null,
                },
              ])
            }
          >
            <Plus /> Přidat položku
          </Button>
        ) : (
          <span />
        )}
        <dl className="min-w-64 space-y-1 text-right" data-testid="invoice-totals">
          {inv.vatPayer &&
            !reverse &&
            totals.groups.map((g) => (
              <div key={g.vatRateBp} className="flex justify-between gap-6 text-sm text-muted">
                <dt>Základ {pct(g.vatRateBp)}</dt>
                <dd className="tabular">{money(g.netMinor)}</dd>
              </div>
            ))}
          {inv.vatPayer && !reverse && (
            <div className="flex justify-between gap-6 text-sm text-muted">
              <dt>DPH</dt>
              <dd className="tabular">{money(totals.vatMinor)}</dd>
            </div>
          )}
          {hasRetention && (
            <>
              <div className="flex justify-between gap-6 text-sm text-muted">
                <dt>Celkem před zádržným</dt>
                <dd className="tabular">{money(before.grossMinor)}</dd>
              </div>
              <div className="flex justify-between gap-6 text-sm text-muted">
                <dt>Zádržné {retentionPct(inv.retentionBp)} %</dt>
                <dd className="tabular">− {money(retentionGross)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between gap-6 text-lg font-semibold">
            <dt>{hasRetention ? "Celkem k úhradě" : reverse ? "Celkem bez DPH" : "Celkem"}</dt>
            <dd className="tabular">{money(totals.grossMinor)}</dd>
          </div>
        </dl>
      </div>

      {editable && (
        <div className="grid gap-x-3 sm:grid-cols-[12rem_16rem_1fr]">
          <Field label="Splatnost (prázdné = podle nastavení)">
            <DatePicker
              value={meta.dueDate}
              onChange={(v) => setMeta((m) => ({ ...m, dueDate: v }))}
            />
          </Field>
          {inv.kind !== "credit_note" && (
            <Field label="Režim DPH">
              <Combobox
                aria-label="Režim DPH"
                options={MODE_OPTIONS}
                value={meta.vatMode}
                onChange={(v) => v && setMeta((m) => ({ ...m, vatMode: v as VatMode }))}
              />
            </Field>
          )}
          <Field label="Poznámka na dokladu">
            <Textarea
              value={meta.note}
              onChange={(e) => setMeta((m) => ({ ...m, note: e.target.value }))}
              className="min-h-16"
            />
          </Field>
        </div>
      )}
      {editable && (
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                id,
                companyId: inv.companyId,
                personId: inv.personId,
                issueDate: inv.issueDate,
                taxableDate: inv.taxableDate,
                dueDate: meta.dueDate,
                note: meta.note || null,
                vatMode: meta.vatMode,
                lines: lines
                  .filter((l) => l.description.trim())
                  .map((l) => ({
                    description: l.description,
                    quantity: l.quantity || "0",
                    unit: l.unit || "ks",
                    unitPriceMinor: l.price ?? 0,
                    vatRateBp: l.vatRateBp,
                    role: l.role,
                    budgetItemId: l.budgetItemId,
                    refInvoiceId: l.refInvoiceId,
                  })),
              })
            }
          >
            Uložit položky
          </Button>
          <span className="text-sm text-muted">Číslo se přidělí až při vystavení.</span>
        </div>
      )}
      <Err error={save.error as Error | null} />
      <ReopenDialog id={id} open={reopen} onOpenChange={setReopen} />
    </div>
  );
}

/* ---------- Platby ---------- */

function PaymentsTab({ id }: { id: string }) {
  const q = useInvoice(id);
  const inv = q.data;
  const [form, setForm] = useState<{ date: string | null; amount: number | null; method: string }>({
    date: todayIso(),
    amount: null,
    method: "převodem",
  });
  const [key, setKey] = useState(0);
  const add = useCommandMutation<Record<string, unknown>>("fakturace.addPayment", {
    onSuccess: () => {
      setForm((f) => ({ ...f, amount: null }));
      setKey((k) => k + 1);
      successToast("Úhrada zapsána.");
    },
  });
  const del = useCommandMutation<{ id: string }>("fakturace.removePayment");
  if (q.isLoading || !inv) return <Skeleton className="h-24" />;
  const remaining = inv.grossMinor - inv.paidMinor;
  const payable = inv.kind !== "credit_note" && (inv.state === "issued" || inv.state === "partial");
  const state = paymentState(inv.grossMinor, inv.paidMinor);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted">
          Uhrazeno {formatMinor(inv.paidMinor, inv.currency)} z{" "}
          {formatMinor(inv.grossMinor, inv.currency)}
        </span>
        {inv.state !== "draft" &&
          inv.kind !== "credit_note" &&
          (state === "paid" ? (
            <Chip color="green" dot>
              Uhrazeno
            </Chip>
          ) : inv.overdue ? (
            <Chip color="red" dot>
              Po splatnosti ({inv.dueDate ? formatDate(inv.dueDate) : ""})
            </Chip>
          ) : (
            <Chip color="blue" dot>
              Zbývá {formatMinor(remaining, inv.currency)}
            </Chip>
          ))}
      </div>
      {inv.payments.length ? (
        <ul
          className="divide-y divide-line rounded-lg border border-line"
          data-testid="payments-list"
        >
          {inv.payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="tabular w-24 text-sm text-muted">{formatDate(p.date)}</span>
              <span className="flex-1">
                {p.method ?? "úhrada"}
                {p.note && <span className="text-muted"> · {p.note}</span>}
              </span>
              <span className="tabular font-medium">
                {formatMinor(p.amountMinor, inv.currency)}
              </span>
              <IconButton
                label="Odebrat úhradu"
                variant="ghost"
                size="sm"
                onClick={() => del.mutate({ id: p.id })}
              >
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">Zatím žádná úhrada.</p>
      )}
      {payable && (
        <form
          key={key}
          className="grid gap-2 sm:grid-cols-[10rem_10rem_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate({
              invoiceId: id,
              date: form.date,
              amountMinor: form.amount ?? 0,
              method: form.method || null,
            });
          }}
        >
          <DatePicker
            value={form.date}
            onChange={(v) => setForm((f) => ({ ...f, date: v }))}
            clearable={false}
          />
          <MoneyInput
            aria-label="Částka úhrady"
            placeholder={`Zbývá ${formatMinor(remaining, inv.currency)}`}
            value={form.amount}
            onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
          />
          <Input
            aria-label="Způsob úhrady"
            value={form.method}
            onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
          />
          <Button
            type="submit"
            variant="primary"
            loading={add.isPending}
            disabled={!form.amount || !form.date}
          >
            Zapsat úhradu
          </Button>
        </form>
      )}
      {payable && remaining > 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setForm((f) => ({ ...f, amount: remaining }))}
        >
          Doplnit celou zbývající částku
        </Button>
      )}
      <Err error={(add.error as Error | null) ?? (del.error as Error | null)} />
    </div>
  );
}

/* ---------- akce v hlavičce ---------- */

function IssueForm({ id, close, refresh }: { id: string; close: () => void; refresh: () => void }) {
  const q = useInvoice(id);
  const inv = q.data;
  const [issue, setIssue] = useState<string | null>(todayIso());
  const [taxable, setTaxable] = useState<string | null>(todayIso());
  const [due, setDue] = useState<string | null>(null);
  const run = useCommandMutation<Record<string, unknown>, { number: string }>("fakturace.issue", {
    onSuccess: (r) => {
      successToast(`Vystaveno: ${r.number}`);
      close();
      refresh();
    },
  });
  if (!inv) return <Skeleton className="m-5 h-24" />;
  const effectiveDue = due ?? (issue ? addDaysIso(issue, inv.dueDays) : null);
  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-muted">
        Po vystavení se faktuře přidělí číslo a nepůjde měnit. Chybu pak opravíte dobropisem.
      </p>
      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field label="Datum vystavení">
          <DatePicker
            value={issue}
            onChange={(v) => {
              setIssue(v);
              setTaxable(v);
            }}
            clearable={false}
          />
        </Field>
        {inv.vatPayer && inv.kind !== "proforma" && (
          <Field label="Datum zdanitelného plnění">
            <DatePicker value={taxable} onChange={setTaxable} clearable={false} />
          </Field>
        )}
        <Field label="Splatnost">
          <DatePicker value={effectiveDue} onChange={setDue} clearable={false} />
        </Field>
      </div>
      <Err error={run.error as Error | null} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Zrušit
        </Button>
        <Button
          variant="primary"
          loading={run.isPending}
          onClick={() =>
            run.mutate({ id, issueDate: issue, taxableDate: taxable, dueDate: effectiveDue })
          }
        >
          Vystavit
        </Button>
      </div>
    </div>
  );
}

const issueAction: RecordAction = {
  id: "issue",
  label: "Vystavit",
  primary: true,
  permission: "fakturace.write",
  visible: (row) => row.state === "draft",
  dialog: {
    title: "Vystavit doklad",
    render: ({ id, close, refresh }) => <IssueForm id={id} close={close} refresh={refresh} />,
  },
};

const pdfAction: RecordAction = {
  id: "pdf",
  label: "PDF",
  permission: "fakturace.read",
  run: ({ id }) => void window.open(`/api/fakturace/${id}/pdf`, "_blank", "noopener"),
};

/** Stáhne ISDOC dokladu; chybu serveru (oprávnění, koncept) ukáže v hlášce místo prázdné karty. */
async function downloadIsdoc(id: string) {
  try {
    const res = await fetch(`/api/fakturace/${id}/isdoc`);
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(b?.error ?? "ISDOC se nepodařilo stáhnout.");
    }
    const name = /filename\*=UTF-8''([^;]+)/.exec(
      res.headers.get("content-disposition") ?? "",
    )?.[1];
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name ? decodeURIComponent(name) : "doklad.isdoc";
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    errorToast((e as Error).message);
  }
}

/** ISDOC dokladu (vydaného i přijatého) ke stažení; vyžaduje oprávnění k exportu faktur. */
const isdocAction = (states: readonly string[]): RecordAction => ({
  id: "isdoc",
  label: "ISDOC",
  permission: "fakturace.export",
  visible: (row) => states.includes(String(row.state)),
  run: ({ id }) => downloadIsdoc(id),
});

const creditAction: RecordAction = {
  id: "credit-note",
  label: "Dobropis",
  permission: "fakturace.write",
  visible: (row) =>
    row.kind !== "credit_note" &&
    (row.state === "issued" || row.state === "partial" || row.state === "paid"),
  async run({ id, api, push }) {
    try {
      const r = await api.command<{ invoiceId: string }, { id: string }>(
        "fakturace.createCreditNote",
        { invoiceId: id },
      );
      successToast("Koncept dobropisu je připravený. Zkontrolujte položky a vystavte ho.");
      push(api.hrefFor("invoice", r.id) ?? "/fakturace");
    } catch (e) {
      errorToast((e as Error).message);
    }
  },
};

/* ---------- stránky ---------- */

const tab = (
  id: string,
  label: string,
  Component: (p: { id: string }) => React.ReactNode,
  permission?: string,
): RecordTab => ({
  id,
  label,
  ...(permission ? { permission } : {}),
  render: ({ id: recordId }) => <Component id={recordId} />,
});

export const ui = defineModuleUi({
  recordTabs: {
    invoice: [
      tab("polozky", "Položky", LinesTab, "fakturace.read"),
      tab("platby", "Platby", PaymentsTab, "fakturace.read"),
      {
        id: "odeslani",
        label: "Odeslání",
        permission: "fakturace.read",
        render: ({ id: recordId, row }) => <dispatch.DispatchTab id={recordId} row={row} />,
      },
    ],
    job: areas.flatMap((a) => a.tabs),
    // detail přijaté faktury (`/fakturace/prijate/<id>`) dodává oblast received
    received_invoice: received.recordTabs.received_invoice ?? [],
    company: [
      tab(
        "faktury",
        "Faktury",
        ({ id }) => <RelatedRecords entity="invoice" parentAttribute="company" parentId={id} />,
        "fakturace.read",
      ),
    ],
  },
  recordActions: {
    invoice: [
      issueAction,
      pdfAction,
      isdocAction(["issued", "partial", "paid", "credited"]),
      dispatch.sendMailAction,
      dispatch.reminderAction,
      creditAction,
    ],
    received_invoice: [
      ...(received.recordActions.received_invoice ?? []),
      isdocAction(["approved", "paid"]),
    ],
    ...(areas.some((a) => a.actions.length) ? { job: areas.flatMap((a) => a.actions) } : {}),
  },
  bulkActions: dispatch.bulkActions,
  pages: [
    { path: "/fakturace/export", render: () => <ExportPage /> },
    { path: "/fakturace/nastaveni", render: () => <SettingsPage /> },
    ...areas.flatMap((a) => a.pages),
  ],
});
