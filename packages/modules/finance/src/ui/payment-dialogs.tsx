"use client";

import {
  Button,
  Chip,
  Combobox,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  Input,
  MoneyInput,
  Textarea,
  useCan,
  useCommandQuery,
  useEntityApi,
} from "@rebar/ui";
import { useState } from "react";
import type { PaymentDetail, PaymentMutation, PaymentRow, People } from "../contract";
import { dueOnFrom } from "../logic";
import {
  KIND_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  fmtDate,
  money,
  personName,
  today,
  useConfirmedMutation,
  usePeople,
  useUsers,
} from "./common";
import { nextStep } from "./format";
import { Select, UserSelect } from "./controls";

/*
  Dialogy plateb: přechod stavu (Plánovaná → Vystavená: číslo faktury a datum; → Zaplacená: datum úhrady),
  založení a úprava platby a detail s ručním přepisem rozdělení („Rozděleno ručně“).
*/

type Target = "planned" | "issued" | "paid" | "canceled";

const Footer = ({ children }: { children: React.ReactNode }) => (
  <div className="flex justify-end gap-2 px-5 py-4">{children}</div>
);

/** Dialog změny stavu platby (FIN-09). */
export function TransitionDialog({
  row,
  to,
  people,
  onClose,
}: {
  row: PaymentRow;
  to: Target;
  people?: People;
  onClose: () => void;
}) {
  const needsInvoice = to === "issued" || (to === "paid" && !row.invoiceNumber);
  const [invoiceNumber, setInvoiceNumber] = useState(row.invoiceNumber ?? "");
  const [invoiceUrl, setInvoiceUrl] = useState(row.invoiceUrl ?? "");
  const [issuedOn, setIssuedOn] = useState<string | null>(row.issuedOn ?? today());
  const [dueOn, setDueOn] = useState<string | null>(
    row.dueOn ?? (to === "issued" ? dueOnFrom(row.issuedOn ?? today(), 14) : null),
  );
  const [paidOn, setPaidOn] = useState<string | null>(today());
  const [showErrors, setShowErrors] = useState(false);

  const m = useConfirmedMutation<
    {
      id: string;
      to: Target;
      invoiceNumber?: string | null;
      invoiceUrl?: string | null;
      issuedOn?: string | null;
      dueOn?: string | null;
      paidOn?: string | null;
      confirmRecalc?: boolean;
    },
    PaymentMutation
  >("finance.payment.transition", {
    success:
      to === "issued"
        ? "Platba vystavena."
        : to === "paid"
          ? "Platba zaplacena."
          : "Stav platby změněn.",
    onOk: onClose,
    ...(people ? { people } : {}),
  });

  const title =
    to === "issued"
      ? "Vystavit platbu"
      : to === "paid"
        ? "Označit jako zaplacenou"
        : to === "canceled"
          ? "Zrušit platbu"
          : "Vrátit na plánovanou";
  const invoiceError =
    showErrors && needsInvoice && !invoiceNumber.trim() ? "Vyplňte číslo faktury." : undefined;
  const dateError =
    showErrors && to === "issued" && !issuedOn
      ? "Vyplňte datum vystavení."
      : showErrors && to === "paid" && !paidOn
        ? "Vyplňte datum úhrady."
        : undefined;

  function submit() {
    setShowErrors(true);
    if (needsInvoice && !invoiceNumber.trim()) return;
    if ((to === "issued" && !issuedOn) || (to === "paid" && !paidOn)) return;
    m.run({
      id: row.id,
      to,
      ...(needsInvoice
        ? { invoiceNumber: invoiceNumber.trim(), invoiceUrl: invoiceUrl.trim() || null }
        : {}),
      ...(to === "issued" ? { issuedOn, dueOn } : {}),
      ...(to === "paid"
        ? { paidOn, ...(needsInvoice ? { issuedOn: issuedOn ?? paidOn } : {}) }
        : {}),
    });
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && !m.pending && onClose()}>
        <DialogContent
          title={title}
          description={`${row.description} · ${money(row.amountMinor)}`}
          data-testid="transition-dialog"
        >
          <div className="space-y-1 px-5 py-4">
            {needsInvoice && (
              <>
                <Field label="Číslo faktury" error={invoiceError}>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="např. 2026-0123"
                    data-testid="invoice-number"
                    autoFocus
                  />
                </Field>
                <Field label="Odkaz na fakturu (nepovinné)">
                  <Input
                    value={invoiceUrl}
                    onChange={(e) => setInvoiceUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </Field>
              </>
            )}
            {(to === "issued" || (to === "paid" && needsInvoice)) && (
              <div className="grid gap-x-3 sm:grid-cols-2">
                <Field label="Datum vystavení" error={to === "issued" ? dateError : undefined}>
                  <DatePicker value={issuedOn} onChange={setIssuedOn} clearable={false} />
                </Field>
                <Field label="Splatnost">
                  <DatePicker value={dueOn} onChange={setDueOn} />
                </Field>
              </div>
            )}
            {to === "paid" && (
              <Field label="Datum úhrady" error={dateError}>
                <DatePicker value={paidOn} onChange={setPaidOn} clearable={false} />
              </Field>
            )}
            {(to === "canceled" || to === "planned") && (
              <p className="text-base text-muted">
                {to === "canceled"
                  ? "Zrušená platba se nepočítá do součtů ani do salda. Záznam zůstane v historii."
                  : "Platba se vrátí do stavu Plánovaná; číslo faktury a data zůstanou uložená."}
              </p>
            )}
          </div>
          <Footer>
            <Button variant="ghost" onClick={onClose} disabled={m.pending}>
              Zpět
            </Button>
            <Button
              variant={to === "canceled" ? "danger" : "primary"}
              loading={m.pending}
              onClick={submit}
              data-testid="transition-confirm"
            >
              {title}
            </Button>
          </Footer>
        </DialogContent>
      </Dialog>
      {m.dialog}
    </>
  );
}

type FormState = {
  jobId: string | null;
  description: string;
  kind: "one_off" | "intro" | "retainer" | "extra";
  amountMinor: number | null;
  issuerId: string;
  periodMonth: string;
  issuedOn: string | null;
  dueOn: string | null;
  paidOn: string | null;
  invoiceNumber: string;
  invoiceUrl: string;
  note: string;
};

/** Dialog založení („Zapsat platbu“) nebo úpravy platby. */
export function PaymentFormDialog({
  row,
  jobId,
  jobLabel,
  onClose,
}: {
  row?: PaymentRow | undefined;
  jobId?: string | undefined;
  jobLabel?: string | undefined;
  onClose: () => void;
}) {
  const api = useEntityApi();
  const users = useUsers();
  const people = usePeople();
  const [f, setF] = useState<FormState>({
    jobId: row?.jobId ?? jobId ?? null,
    description: row?.description ?? "",
    kind: (row?.kind === "recurring" ? "one_off" : row?.kind) ?? "one_off",
    amountMinor: row?.amountMinor ?? null,
    issuerId: row?.issuerId ?? api.me.id,
    periodMonth: row?.periodMonth ?? "",
    issuedOn: row?.issuedOn ?? null,
    dueOn: row?.dueOn ?? null,
    paidOn: row?.paidOn ?? null,
    invoiceNumber: row?.invoiceNumber ?? "",
    invoiceUrl: row?.invoiceUrl ?? "",
    note: row?.note ?? "",
  });
  const labels: Record<string, string> = row?.jobId
    ? { [row.jobId]: `${row.jobNumber ?? ""} ${row.jobTitle ?? ""}`.trim() }
    : jobId && jobLabel
      ? { [jobId]: jobLabel }
      : {};
  const [showErrors, setShowErrors] = useState(false);
  const set = (p: Partial<FormState>) => setF((s) => ({ ...s, ...p }));

  const create = useConfirmedMutation<
    Record<string, unknown> & { confirmRecalc?: boolean },
    PaymentMutation
  >("finance.payment.create", { success: "Platba zapsána.", onOk: onClose, people });
  const update = useConfirmedMutation<
    Record<string, unknown> & { confirmRecalc?: boolean },
    PaymentMutation
  >("finance.payment.update", { success: "Platba uložena.", onOk: onClose, people });
  const pending = create.pending || update.pending;

  const errors = {
    job: !row && !f.jobId ? "Vyberte zakázku." : undefined,
    description: !f.description.trim() ? "Vyplňte popis." : undefined,
    amount: !f.amountMinor || f.amountMinor <= 0 ? "Zadejte částku větší než 0." : undefined,
    month:
      f.kind === "retainer" && !/^\d{4}-\d{2}$/.test(f.periodMonth)
        ? "U retaineru vyplňte měsíc."
        : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  function submit() {
    setShowErrors(true);
    if (invalid || !f.amountMinor) return;
    const common = {
      description: f.description.trim(),
      kind: f.kind,
      amountMinor: f.amountMinor,
      issuerId: f.issuerId,
      periodMonth: f.periodMonth || null,
      issuedOn: f.issuedOn,
      dueOn: f.dueOn,
      note: f.note.trim() || null,
    };
    if (row) {
      update.run({
        id: row.id,
        ...common,
        paidOn: f.paidOn,
        invoiceNumber: f.invoiceNumber.trim() || null,
        invoiceUrl: f.invoiceUrl.trim() || null,
      });
    } else {
      create.run({ jobId: f.jobId, ...common, status: "planned" });
    }
  }

  const show = (k: keyof typeof errors) => (showErrors ? errors[k] : undefined);
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
        <DialogContent
          title={row ? "Upravit platbu" : "Zapsat platbu"}
          description={
            row ? row.description : "Faktura se vystavuje mimo OPSYS, tady se jen eviduje."
          }
          className="w-[min(40rem,calc(100vw-2rem))]"
          data-testid="payment-form"
        >
          <div className="max-h-[65vh] space-y-1 overflow-y-auto px-5 py-4">
            {!row && (
              <Field label="Zakázka" error={show("job")}>
                <Combobox
                  load={(q) => api.lookups.records("job", q)}
                  value={f.jobId}
                  selectedLabels={labels}
                  onChange={(v) => {
                    set({ jobId: (v as string | null) ?? null });
                  }}
                  placeholder="Vybrat zakázku…"
                  searchPlaceholder="Najít zakázku…"
                  aria-label="Zakázka"
                  {...(jobId ? { disabled: true } : {})}
                />
              </Field>
            )}
            <Field label="Popis" error={show("description")}>
              <Input
                value={f.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="např. Web – 1. záloha"
                data-testid="payment-description"
              />
            </Field>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Field label="Druh">
                <Select
                  aria-label="Druh"
                  value={f.kind}
                  onChange={(e) => set({ kind: e.target.value as FormState["kind"] })}
                >
                  {["one_off", "intro", "retainer", "extra"].map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Částka" error={show("amount")}>
                <MoneyInput
                  value={f.amountMinor}
                  onChange={(v) => set({ amountMinor: v })}
                  aria-label="Částka"
                  placeholder="10 000"
                />
              </Field>
              <Field label="Kdo fakturuje">
                <UserSelect
                  aria-label="Kdo fakturuje"
                  value={f.issuerId}
                  onChange={(id) => set({ issuerId: id })}
                />
              </Field>
              {f.kind === "retainer" && (
                <Field label="Za měsíc" error={show("month")}>
                  <Input
                    type="month"
                    value={f.periodMonth}
                    onChange={(e) => set({ periodMonth: e.target.value })}
                  />
                </Field>
              )}
              <Field
                label={
                  row?.status === "planned" || !row ? "Plánované vystavení" : "Datum vystavení"
                }
              >
                <DatePicker value={f.issuedOn} onChange={(v) => set({ issuedOn: v })} />
              </Field>
              <Field label="Splatnost">
                <DatePicker value={f.dueOn} onChange={(v) => set({ dueOn: v })} />
              </Field>
              {row && (
                <>
                  <Field label="Číslo faktury">
                    <Input
                      value={f.invoiceNumber}
                      onChange={(e) => set({ invoiceNumber: e.target.value })}
                    />
                  </Field>
                  <Field label="Datum zaplacení">
                    <DatePicker value={f.paidOn} onChange={(v) => set({ paidOn: v })} />
                  </Field>
                  <Field label="Odkaz na fakturu">
                    <Input
                      value={f.invoiceUrl}
                      onChange={(e) => set({ invoiceUrl: e.target.value })}
                      placeholder="https://…"
                    />
                  </Field>
                </>
              )}
            </div>
            <Field label="Poznámka">
              <Textarea value={f.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
            {users.length === 0 && <p className="text-sm text-muted">Načítám uživatele…</p>}
          </div>
          <Footer>
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Zrušit
            </Button>
            <Button variant="primary" loading={pending} onClick={submit} data-testid="payment-save">
              {row ? "Uložit" : "Zapsat platbu"}
            </Button>
          </Footer>
        </DialogContent>
      </Dialog>
      {create.dialog}
      {update.dialog}
    </>
  );
}

/** Detail platby: údaje, rozdělení, ruční přepis rozdělení a návrat k pravidlům. */
export function PaymentDetailDialog({
  id,
  onClose,
  onEdit,
  onTransition,
}: {
  id: string;
  onClose: () => void;
  onEdit: (row: PaymentRow) => void;
  onTransition: (row: PaymentRow, to: Target) => void;
}) {
  const can = useCan();
  const q = useCommandQuery<PaymentDetail, { id: string }>("finance.payment.get", { id });
  const people = usePeople(q.data?.people);
  const users = useUsers();
  const [manual, setManual] = useState<Record<string, number | null> | null>(null);
  const override = useConfirmedMutation<
    {
      id: string;
      allocations: { userId: string; amountMinor: number }[] | null;
      confirmRecalc?: boolean;
    },
    PaymentMutation
  >("finance.payment.overrideAllocation", {
    success: "Rozdělení uloženo.",
    onOk: () => setManual(null),
    people,
  });
  const p = q.data?.payment;
  const step = p ? nextStep(p.status) : null;

  const sum = manual ? Object.values(manual).reduce<number>((s, v) => s + (v ?? 0), 0) : 0;
  const diff = p ? p.amountMinor - sum : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={p?.description ?? "Platba"}
        description={
          p
            ? `${p.jobNumber ?? "Bez zakázky"}${p.companyName ? ` · ${p.companyName}` : ""}`
            : undefined
        }
        className="w-[min(40rem,calc(100vw-2rem))]"
        data-testid="payment-detail"
      >
        {!p ? (
          <p className="px-5 py-6 text-muted">
            {q.isError ? "Platbu se nepodařilo načíst." : "Načítám…"}
          </p>
        ) : (
          <div className="space-y-4 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip color={STATUS_COLORS[p.status]!} dot>
                {STATUS_LABELS[p.status]}
              </Chip>
              <Chip>{KIND_LABELS[p.kind]}</Chip>
              {p.allocationMode === "manual" && <Chip color="orange">Rozděleno ručně</Chip>}
              {p.dueState === "overdue" && <Chip color="red">Po splatnosti</Chip>}
              {p.isPrivate && <Chip color="purple">Soukromé</Chip>}
              <span className="ml-auto text-lg font-semibold tabular-nums">
                {money(p.amountMinor)}
              </span>
            </div>
            <dl className="grid grid-cols-[minmax(7rem,9rem)_1fr] gap-x-3 gap-y-1 text-base">
              {[
                ["Fakturuje", personName(people, p.issuerId)],
                ["Číslo faktury", p.invoiceNumber ?? "–"],
                ["Vystaveno", fmtDate(p.issuedOn)],
                ["Splatnost", fmtDate(p.dueOn)],
                ["Zaplaceno", fmtDate(p.paidOn)],
                ["Měsíc", p.periodMonth ?? "–"],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
              {p.invoiceUrl && (
                <>
                  <dt className="text-muted">Faktura</dt>
                  <dd>
                    <a
                      className="text-accent underline"
                      href={p.invoiceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Otevřít
                    </a>
                  </dd>
                </>
              )}
              {p.note && (
                <>
                  <dt className="text-muted">Poznámka</dt>
                  <dd className="[overflow-wrap:anywhere]">{p.note}</dd>
                </>
              )}
            </dl>

            <section aria-label="Rozdělení">
              <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-faint">
                Rozdělení
              </h3>
              {manual === null ? (
                <>
                  <ul className="space-y-1 text-base" data-testid="allocations">
                    {p.allocations.map((a) => (
                      <li key={a.userId} className="flex justify-between">
                        <span>{personName(people, a.userId)}</span>
                        <span className="tabular-nums">{money(a.amountMinor)}</span>
                      </li>
                    ))}
                    {p.allocations.length === 0 && <li className="text-muted">Bez rozdělení.</li>}
                  </ul>
                  {can("finance.splits_edit") && p.status !== "canceled" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          setManual(
                            Object.fromEntries(
                              users.map((u) => [
                                u.value,
                                p.allocations.find((a) => a.userId === u.value)?.amountMinor ?? 0,
                              ]),
                            ),
                          )
                        }
                        data-testid="override-start"
                      >
                        Přepsat rozdělení ručně
                      </Button>
                      {p.allocationMode === "manual" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={override.pending}
                          onClick={() => override.run({ id: p.id, allocations: null })}
                        >
                          Vrátit k pravidlům zakázky
                        </Button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2" data-testid="override-form">
                  {users.map((u) => (
                    <label key={u.value} className="flex items-center justify-between gap-3">
                      <span>{u.firstName}</span>
                      <MoneyInput
                        className="w-40"
                        aria-label={`Podíl ${u.firstName}`}
                        value={manual[u.value] ?? null}
                        onChange={(v) => setManual({ ...manual, [u.value]: v })}
                      />
                    </label>
                  ))}
                  <p
                    className={diff === 0 ? "text-sm text-muted" : "text-sm text-danger"}
                    role="status"
                  >
                    {diff === 0
                      ? "Součet podílů sedí s částkou platby."
                      : `Rozdíl proti částce platby: ${money(diff)}.`}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={diff !== 0}
                      loading={override.pending}
                      onClick={() =>
                        override.run({
                          id: p.id,
                          allocations: users.map((u) => ({
                            userId: u.value,
                            amountMinor: manual[u.value] ?? 0,
                          })),
                        })
                      }
                    >
                      Uložit rozdělení
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setManual(null)}>
                      Zrušit
                    </Button>
                  </div>
                </div>
              )}
              {q.data?.warnings.map((w, i) => (
                <p key={i} className="mt-1 text-sm text-warning">
                  {w.message}
                </p>
              ))}
            </section>

            {can("finance.payments_write") && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-3">
                {p.status === "canceled" && (
                  <Button size="sm" onClick={() => onTransition(p, "planned")}>
                    Obnovit jako plánovanou
                  </Button>
                )}
                {p.status !== "canceled" && p.status !== "paid" && (
                  <Button size="sm" variant="ghost" onClick={() => onTransition(p, "canceled")}>
                    Zrušit platbu
                  </Button>
                )}
                {(p.status === "issued" || p.status === "paid") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onTransition(p, p.status === "paid" ? "issued" : "planned")}
                  >
                    Vrátit o stupeň
                  </Button>
                )}
                <Button size="sm" onClick={() => onEdit(p)}>
                  Upravit
                </Button>
                {step && (
                  <Button size="sm" variant="primary" onClick={() => onTransition(p, step.to)}>
                    {step.label}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
      {override.dialog}
    </Dialog>
  );
}
