"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import {
  Button,
  Chip,
  Combobox,
  DatePicker,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  IconButton,
  Input,
  MoneyInput,
  Skeleton,
  Textarea,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useVatRates,
  vatBpChoices,
  type ModulePage,
  type RecordAction,
  type RecordTab,
} from "@rebar/ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { VAT_MODES, checkReceived, receivedState, sumLines } from "./calc";

const Err = ({ error }: { error: Error | null }) =>
  error ? (
    <p role="alert" className="mt-2 text-sm text-danger">
      {error.message}
    </p>
  ) : null;

const CATEGORIES = [
  { value: "material", label: "Materiál" },
  { value: "subcontract", label: "Subdodávky" },
  { value: "labour", label: "Práce" },
  { value: "machines", label: "Stroje a doprava" },
  { value: "other", label: "Ostatní" },
];

type Line = {
  description: string;
  sectionId: string | null;
  itemId: string | null;
  category: string;
  netMinor: number | null;
  vatRateBp: number;
};
type Detail = {
  id: string;
  number: string;
  jobId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  orderId: string | null;
  variableSymbol: string | null;
  issueDate: string | null;
  taxableDate: string | null;
  dueDate: string | null;
  receivedDate: string | null;
  vatMode: "standard" | "reverse_charge";
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  paidMinor: number;
  paidDate: string | null;
  state: string;
  locked: boolean;
  editable: boolean;
  overdue: boolean;
  note: string | null;
  lines: (Omit<Line, "netMinor"> & {
    id: string;
    netMinor: number;
    vatMinor: number;
    grossMinor: number;
  })[];
  approval: {
    status: string;
    canDecide: boolean;
    canReopen: boolean;
    approvalId: string | null;
    comment: string | null;
  };
  orderCompare: null | {
    orderId: string;
    number: string;
    orderedMinor: number;
    invoicedMinor: number;
    diffMinor: number;
    state: "over" | "under" | "match";
  };
};
type Targets = {
  sections: { id: string; label: string }[];
  items: { id: string; sectionId: string; label: string }[];
};
type OrderOpt = { id: string; number: string; title: string; supplierId?: string | null };

const BLANK: Line = {
  description: "",
  sectionId: null,
  itemId: null,
  category: "material",
  netMinor: null,
  vatRateBp: 2100,
};

/** Editor přijaté faktury: hlavička z papírového dokladu a rozpad na řádky s oddílem rozpočtu. */
export function ReceivedEditor({
  invoice,
  jobId,
  prefill,
  onDone,
}: {
  invoice: Detail | null;
  jobId: string | null;
  prefill?: { orderId?: string | undefined; supplierId?: string | null | undefined } | undefined;
  onDone: (id: string) => void;
}) {
  const api = useEntityApi();
  const vat = useVatRates();
  const effectiveJob = invoice?.jobId ?? jobId;
  const targets = useCommandQuery<Targets>(
    "zakazky.costs.targets",
    { jobId: effectiveJob },
    { enabled: !!effectiveJob },
  );
  const orders = useCommandQuery<{ orders: OrderOpt[] }>(
    "zakazky.orders.list",
    { jobId: effectiveJob },
    { enabled: !!effectiveJob },
  );
  const [f, setF] = useState(() => ({
    number: invoice?.number ?? "",
    supplierId: invoice?.supplierId ?? prefill?.supplierId ?? (null as string | null),
    orderId: invoice?.orderId ?? prefill?.orderId ?? (null as string | null),
    variableSymbol: invoice?.variableSymbol ?? "",
    issueDate: invoice?.issueDate ?? (null as string | null),
    taxableDate: invoice?.taxableDate ?? (null as string | null),
    dueDate: invoice?.dueDate ?? (null as string | null),
    vatMode: invoice?.vatMode ?? ("standard" as "standard" | "reverse_charge"),
    net: invoice?.netMinor ?? (null as number | null),
    gross: invoice?.grossMinor ?? (null as number | null),
    note: invoice?.note ?? "",
  }));
  const [lines, setLines] = useState<Line[]>(() =>
    invoice?.lines.length
      ? invoice.lines.map((l) => ({
          description: l.description,
          sectionId: l.sectionId,
          itemId: l.itemId,
          category: l.category,
          netMinor: l.netMinor,
          vatRateBp: l.vatRateBp,
        }))
      : [{ ...BLANK, vatRateBp: vat.defaultBp }],
  );
  const save = useCommandMutation<Record<string, unknown>, { id: string }>(
    invoice ? "fakturace.received.save" : "fakturace.received.create",
    {
      onSuccess: (r) => {
        successToast(invoice ? "Faktura uložena." : "Faktura založena.");
        onDone(r.id ?? invoice?.id ?? "");
      },
    },
  );
  const net = f.net ?? 0;
  const gross = f.vatMode === "reverse_charge" ? net : (f.gross ?? 0);
  const lineIn = lines.map((l) => ({ netMinor: l.netMinor ?? 0, vatRateBp: l.vatRateBp }));
  const sums = sumLines(lineIn, f.vatMode);
  const diff = net - sums.netMinor;
  const problem = lines.some((l) => l.description.trim())
    ? checkReceived({ netMinor: net, grossMinor: gross, vatMode: f.vatMode }, lineIn, (n) =>
        formatMinor(n),
      )
    : null;
  const patchLine = (i: number, p: Partial<Line>) =>
    setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const reverse = f.vatMode === "reverse_charge";

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          ...(invoice ? { id: invoice.id } : {}),
          number: f.number,
          supplierId: f.supplierId,
          jobId: effectiveJob,
          orderId: f.orderId,
          variableSymbol: f.variableSymbol || null,
          issueDate: f.issueDate,
          taxableDate: f.taxableDate,
          dueDate: f.dueDate,
          vatMode: f.vatMode,
          netMinor: net,
          grossMinor: gross,
          note: f.note || null,
          lines: lines
            .filter((l) => l.description.trim() || l.netMinor)
            .map((l) => ({
              description: l.description.trim() || f.number,
              sectionId: l.sectionId,
              itemId: l.itemId,
              category: l.category,
              netMinor: l.netMinor ?? 0,
              vatRateBp: reverse ? 0 : l.vatRateBp,
            })),
        });
      }}
    >
      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field label="Číslo dokladu dodavatele">
          <Input
            autoFocus={!invoice}
            value={f.number}
            onChange={(e) => setF((s) => ({ ...s, number: e.target.value }))}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Dodavatel">
            <Combobox
              aria-label="Dodavatel"
              load={(q) => api.lookups.records("company", q)}
              value={f.supplierId}
              selectedLabels={
                f.supplierId && invoice?.supplierName
                  ? { [f.supplierId]: invoice.supplierName }
                  : {}
              }
              placeholder="Vybrat firmu z kontaktů…"
              onChange={(v) => setF((s) => ({ ...s, supplierId: v as string | null }))}
            />
          </Field>
        </div>
        <Field label="Datum vystavení">
          <DatePicker value={f.issueDate} onChange={(v) => setF((s) => ({ ...s, issueDate: v }))} />
        </Field>
        <Field label="DUZP">
          <DatePicker
            value={f.taxableDate}
            onChange={(v) => setF((s) => ({ ...s, taxableDate: v }))}
          />
        </Field>
        <Field label="Splatnost">
          <DatePicker value={f.dueDate} onChange={(v) => setF((s) => ({ ...s, dueDate: v }))} />
        </Field>
        <Field label="Základ bez DPH">
          <MoneyInput
            aria-label="Základ bez DPH"
            value={f.net}
            onChange={(v) => setF((s) => ({ ...s, net: v }))}
          />
        </Field>
        <Field
          label="Celkem s DPH"
          hint={reverse ? "U přenesené daňové povinnosti je celkem rovno základu." : undefined}
        >
          <MoneyInput
            aria-label="Celkem s DPH"
            value={reverse ? f.net : f.gross}
            onChange={(v) => setF((s) => ({ ...s, gross: v }))}
          />
        </Field>
        <Field label="Variabilní symbol">
          <Input
            value={f.variableSymbol}
            onChange={(e) => setF((s) => ({ ...s, variableSymbol: e.target.value }))}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Režim DPH">
            <Combobox
              aria-label="Režim DPH"
              options={VAT_MODES.map((m) => ({ value: m.key, label: m.label }))}
              value={f.vatMode}
              onChange={(v) =>
                v && setF((s) => ({ ...s, vatMode: v as "standard" | "reverse_charge" }))
              }
            />
          </Field>
        </div>
        {effectiveJob && (
          <Field label="Objednávka">
            <Combobox
              aria-label="Objednávka"
              options={(orders.data?.orders ?? []).map((o) => ({
                value: o.id,
                label: `${o.number} ${o.title}`,
              }))}
              value={f.orderId}
              clearable
              placeholder="Bez objednávky"
              onChange={(v) => setF((s) => ({ ...s, orderId: v as string | null }))}
            />
          </Field>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[48rem] text-left">
          <thead className="bg-subtle text-sm text-muted">
            <tr className="h-9">
              <th className="px-3 font-medium">Řádek</th>
              <th className="w-56 px-3 font-medium">Oddíl rozpočtu</th>
              <th className="w-36 px-3 font-medium">Kategorie</th>
              <th className="w-32 px-3 font-medium">Základ</th>
              <th className="w-24 px-3 font-medium">DPH</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => (
              <tr key={i} className="align-top">
                <td className="px-2 py-1">
                  <Input
                    aria-label={`Popis řádku ${i + 1}`}
                    value={l.description}
                    placeholder={f.number ? `Faktura ${f.number}` : "Co faktura účtuje"}
                    onChange={(e) => patchLine(i, { description: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <Combobox
                    aria-label={`Oddíl řádku ${i + 1}`}
                    options={(targets.data?.sections ?? []).map((s) => ({
                      value: s.id,
                      label: s.label,
                    }))}
                    value={l.sectionId}
                    clearable
                    disabled={!effectiveJob}
                    placeholder={effectiveJob ? "Spárovat později" : "Bez zakázky"}
                    onChange={(v) => patchLine(i, { sectionId: v as string | null, itemId: null })}
                  />
                </td>
                <td className="px-2 py-1">
                  <Combobox
                    aria-label={`Kategorie řádku ${i + 1}`}
                    options={CATEGORIES}
                    value={l.category}
                    onChange={(v) => v && patchLine(i, { category: v as string })}
                  />
                </td>
                <td className="px-2 py-1">
                  <MoneyInput
                    aria-label={`Základ řádku ${i + 1}`}
                    value={l.netMinor}
                    onChange={(v) => patchLine(i, { netMinor: v })}
                  />
                </td>
                <td className="px-2 py-1">
                  <Combobox
                    aria-label={`Sazba DPH řádku ${i + 1}`}
                    options={vatBpChoices(
                      vat,
                      lines.map((x) => x.vatRateBp),
                    ).map((bp) => ({
                      value: String(bp),
                      label: `${bp / 100} %`,
                    }))}
                    value={String(reverse ? 0 : l.vatRateBp)}
                    disabled={reverse}
                    onChange={(v) => v && patchLine(i, { vatRateBp: Number(v) })}
                  />
                </td>
                <td className="px-1 py-1">
                  <IconButton
                    label={`Odebrat řádek ${i + 1}`}
                    variant="ghost"
                    size="sm"
                    disabled={lines.length <= 1}
                    onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-subtle text-sm">
            <tr className="h-9">
              <td colSpan={3} className="px-3">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setLines((c) => [
                        ...c,
                        { ...BLANK, vatRateBp: vat.defaultBp, netMinor: diff > 0 ? diff : null },
                      ])
                    }
                  >
                    <Plus /> Přidat řádek{diff > 0 ? ` (zbývá ${formatMinor(diff)})` : ""}
                  </Button>
                </div>
              </td>
              <td
                colSpan={3}
                className={`tabular px-3 text-right ${diff === 0 ? "text-success" : "text-danger"}`}
              >
                Řádky {formatMinor(sums.netMinor)} z {formatMinor(net)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {problem && <p className="text-sm text-warning">{problem}</p>}
      <Field label="Poznámka">
        <Textarea
          rows={2}
          value={f.note}
          onChange={(e) => setF((s) => ({ ...s, note: e.target.value }))}
        />
      </Field>
      <p className="text-sm text-faint">
        PDF nebo sken faktury přiložte v záložce Soubory u faktury.
      </p>
      <Err error={save.error} />
      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          variant="primary"
          loading={save.isPending}
          disabled={!f.number.trim() || !f.supplierId || !net}
        >
          {invoice ? "Uložit" : "Založit fakturu"}
        </Button>
      </div>
    </form>
  );
}

function ReasonDialog({
  title,
  confirm,
  required,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  confirm: string;
  required: boolean;
  busy: boolean;
  error: Error | null;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title}>
        <form
          className="px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(reason.trim());
          }}
        >
          <Field label={required ? "Důvod" : "Poznámka (nepovinné)"}>
            <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Err error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={required && reason.trim().length < 3}
            >
              {confirm}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Detail přijaté faktury: stav a akce, hlavička, řádky s oddíly, porovnání s objednávkou. */
export function ReceivedPanel({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const q = useCommandQuery<Detail>("fakturace.received.get", { id });
  const targets = useCommandQuery<Targets>(
    "zakazky.costs.targets",
    { jobId: q.data?.jobId },
    { enabled: !!q.data?.jobId },
  );
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<null | "reject" | "reopen" | "pay">(null);
  const [payDate, setPayDate] = useState<string | null>(todayIso());
  const submit = useCommandMutation<{ id: string }, { state: string }>(
    "fakturace.received.submit",
    {
      onSuccess: (r) =>
        successToast(r.state === "approved" ? "Faktura je schválená." : "Odesláno ke schválení."),
    },
  );
  const pay = useCommandMutation<{ id: string; paidDate: string }>("fakturace.received.pay", {
    onSuccess: () => setDialog(null),
  });
  const unpay = useCommandMutation<{ id: string }>("fakturace.received.unpay");
  const del = useCommandMutation<{ id: string }>("fakturace.received.delete", {
    onSuccess: () => onDeleted?.(),
  });
  const decide = useCommandMutation<{
    approvalId: string;
    approve: boolean;
    comment?: string | null;
  }>("zakazky.approval.decide", { onSuccess: () => setDialog(null) });
  const reopen = useCommandMutation<{ docType: string; docId: string; reason?: string | null }>(
    "zakazky.approval.reopen",
    { onSuccess: () => setDialog(null) },
  );
  const r = q.data;
  useEffect(() => {
    if (r && !r.editable) setEditing(false);
  }, [r]);
  if (q.isLoading || !r) return <Skeleton className="h-32" />;
  const st = receivedState(r.state);

  if (editing && r.editable)
    return <ReceivedEditor invoice={r} jobId={r.jobId} onDone={() => setEditing(false)} />;

  const sectionLabel = (sid: string | null) =>
    sid ? (targets.data?.sections.find((s) => s.id === sid)?.label ?? "Oddíl rozpočtu") : null;

  return (
    <div className="space-y-4" data-testid="received-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">
          {r.number} · {r.supplierName ?? "Dodavatel"}
        </h3>
        <Chip color={st.color}>{st.label}</Chip>
        {r.locked && <Chip>Zamčeno</Chip>}
        {r.overdue && <Chip color="red">Po splatnosti</Chip>}
        <div className="ml-auto flex flex-wrap gap-2">
          {r.editable && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Upravit
              </Button>
              <Button
                variant="primary"
                loading={submit.isPending}
                onClick={() => submit.mutate({ id })}
              >
                Odeslat ke schválení
              </Button>
            </>
          )}
          {r.state === "pending" && r.approval.canDecide && (
            <>
              <Button
                variant="primary"
                loading={decide.isPending}
                onClick={() => decide.mutate({ approvalId: r.approval.approvalId!, approve: true })}
              >
                Schválit
              </Button>
              <Button variant="secondary" onClick={() => setDialog("reject")}>
                Zamítnout
              </Button>
            </>
          )}
          {r.state === "approved" && (
            <Button variant="primary" onClick={() => setDialog("pay")}>
              Označit jako uhrazenou
            </Button>
          )}
          {r.state === "paid" && (
            <Button
              variant="secondary"
              loading={unpay.isPending}
              onClick={() => unpay.mutate({ id })}
            >
              Zrušit úhradu
            </Button>
          )}
          {r.approval.canReopen && (
            <Button variant="secondary" onClick={() => setDialog("reopen")}>
              Vrátit do konceptu
            </Button>
          )}
          {r.editable && (
            <IconButton label="Smazat fakturu" variant="ghost" onClick={() => del.mutate({ id })}>
              <Trash2 />
            </IconButton>
          )}
        </div>
      </div>
      <Err
        error={
          submit.error ?? pay.error ?? unpay.error ?? del.error ?? decide.error ?? reopen.error
        }
      />
      {r.state === "rejected" && r.approval.comment && (
        <p className="rounded-lg border border-line bg-subtle p-3 text-sm">
          Zamítnuto: {r.approval.comment}. Fakturu opravte a pošlete znovu.
        </p>
      )}
      {r.state === "pending" && !r.approval.canDecide && (
        <p className="text-sm text-muted">Čeká na schválení. Do rozhodnutí je zamčená.</p>
      )}
      {r.orderCompare && (
        <p
          className={`rounded-lg border p-3 text-sm ${
            r.orderCompare.state === "over"
              ? "border-warning bg-warning-soft"
              : "border-line bg-subtle"
          }`}
        >
          Objednávka {r.orderCompare.number}: objednáno {formatMinor(r.orderCompare.orderedMinor)},
          fakturováno {formatMinor(r.orderCompare.invoicedMinor)}
          {r.orderCompare.state === "over" &&
            `, o ${formatMinor(r.orderCompare.diffMinor)} víc než v objednávce`}
          {r.orderCompare.state === "under" && `, zbývá ${formatMinor(-r.orderCompare.diffMinor)}`}
          {r.orderCompare.state === "match" && " (sedí)"}.
        </p>
      )}

      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">Vystaveno</dt>
          <dd>{r.issueDate ? formatDate(r.issueDate) : "–"}</dd>
        </div>
        <div>
          <dt className="text-muted">DUZP</dt>
          <dd>{r.taxableDate ? formatDate(r.taxableDate) : "–"}</dd>
        </div>
        <div>
          <dt className="text-muted">Splatnost</dt>
          <dd className={r.overdue ? "text-danger" : ""}>
            {r.dueDate ? formatDate(r.dueDate) : "–"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Variabilní symbol</dt>
          <dd>{r.variableSymbol ?? "–"}</dd>
        </div>
        <div>
          <dt className="text-muted">Základ</dt>
          <dd className="tabular">{formatMinor(r.netMinor)}</dd>
        </div>
        <div>
          <dt className="text-muted">DPH</dt>
          <dd className="tabular">
            {r.vatMode === "reverse_charge"
              ? "přenesená daňová povinnost"
              : formatMinor(r.vatMinor)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Celkem</dt>
          <dd className="tabular font-medium">{formatMinor(r.grossMinor)}</dd>
        </div>
        <div>
          <dt className="text-muted">Uhrazeno</dt>
          <dd>{r.paidDate ? `${formatDate(r.paidDate)} · ${formatMinor(r.paidMinor)}` : "–"}</dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[40rem] text-left">
          <thead className="bg-subtle text-sm text-muted">
            <tr className="h-9">
              <th className="px-3 font-medium">Řádek</th>
              <th className="px-3 font-medium">Oddíl rozpočtu</th>
              <th className="px-3 font-medium">Kategorie</th>
              <th className="px-3 text-right font-medium">Základ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.lines.map((l) => (
              <tr key={l.id} className="h-9">
                <td className="px-3">{l.description}</td>
                <td className="px-3 text-muted">
                  {r.jobId
                    ? (sectionLabel(l.sectionId) ?? (
                        <span className="text-warning">Nespárováno</span>
                      ))
                    : "–"}
                </td>
                <td className="px-3">
                  <Chip>{CATEGORIES.find((c) => c.value === l.category)?.label ?? l.category}</Chip>
                </td>
                <td className="tabular px-3 text-right">{formatMinor(l.netMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-faint">
        Do skutečných nákladů zakázky vstupuje základ bez DPH po schválení. PDF faktury je v záložce
        Soubory.
      </p>

      {dialog === "reject" && (
        <ReasonDialog
          title="Zamítnout fakturu"
          confirm="Zamítnout"
          required
          busy={decide.isPending}
          error={decide.error}
          onSubmit={(comment) =>
            decide.mutate({ approvalId: r.approval.approvalId!, approve: false, comment })
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "reopen" && (
        <ReasonDialog
          title="Vrátit fakturu do konceptu"
          confirm="Vrátit do konceptu"
          required={false}
          busy={reopen.isPending}
          error={reopen.error}
          onSubmit={(reason) =>
            reopen.mutate({ docType: "received_invoice", docId: r.id, reason: reason || null })
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "pay" && (
        <Dialog open onOpenChange={(o) => !o && setDialog(null)}>
          <DialogContent title="Označit jako uhrazenou" description={formatMinor(r.grossMinor)}>
            <div className="px-5 py-4">
              <Field label="Datum úhrady">
                <DatePicker value={payDate} onChange={setPayDate} />
              </Field>
              <Err error={pay.error} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  Zrušit
                </Button>
                <Button
                  variant="primary"
                  loading={pay.isPending}
                  disabled={!payDate}
                  onClick={() => payDate && pay.mutate({ id, paidDate: payDate })}
                >
                  Uhrazeno
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

type ListRow = {
  id: string;
  number: string;
  supplier: string | null;
  state: string;
  dueDate: string | null;
  netMinor: number;
  grossMinor: number;
  overdue: boolean;
};

/** Záložka Přijaté faktury na zakázce: faktury zakázky a tlačítko „Přidat fakturu“. */
function JobReceivedTab({ id }: { id: string }) {
  const list = useCommandQuery<{
    invoices: ListRow[];
    costNetMinor: number;
    toApproveCount: number;
    unpaidGrossMinor: number;
  }>("fakturace.received.list", { jobId: id });
  const [open, setOpen] = useState<string | "new" | null>(null);
  const [prefill, setPrefill] = useState<{ orderId: string; supplierId: string | null } | null>(
    null,
  );
  const api = useEntityApi();
  // „Přidat přijatou fakturu“ z objednávky přijde s `?orderId=…`: otevře novou fakturu s vazbou na ni
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const orderId = p.get("orderId");
    if (!orderId || p.get("sub") !== "prijate-faktury") return;
    p.delete("orderId");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${p.toString() ? `?${p}` : ""}`,
    );
    void api
      .command<{ id: string }, { supplierId: string | null }>("zakazky.orders.get", { id: orderId })
      .then((o) => setPrefill({ orderId, supplierId: o.supplierId }))
      .catch(() => setPrefill({ orderId, supplierId: null }))
      .finally(() => setOpen("new"));
  }, [api]);
  const d = list.data;
  return (
    <div className="space-y-4" data-testid="received-tab">
      <div className="flex flex-wrap items-center gap-2">
        {d && (
          <span className="text-sm text-muted">
            V nákladech (bez DPH): <b className="tabular text-fg">{formatMinor(d.costNetMinor)}</b>
            {d.toApproveCount > 0 && ` · ke schválení ${d.toApproveCount}`}
            {d.unpaidGrossMinor > 0 && ` · neuhrazeno ${formatMinor(d.unpaidGrossMinor)}`}
          </span>
        )}
        <Button className="ml-auto" variant="primary" onClick={() => setOpen("new")}>
          <Plus /> Přidat fakturu
        </Button>
      </div>
      {list.isLoading || !d ? (
        <Skeleton className="h-24" />
      ) : !d.invoices.length ? (
        <EmptyState
          title="Žádné přijaté faktury"
          description="Faktura od dodavatele se po schválení rozpadne na oddíly rozpočtu a tvoří skutečné náklady zakázky."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[40rem] text-left">
            <thead className="bg-subtle text-sm text-muted">
              <tr className="h-9">
                <th className="px-3 font-medium">Číslo</th>
                <th className="px-3 font-medium">Dodavatel</th>
                <th className="px-3 font-medium">Splatnost</th>
                <th className="px-3 font-medium">Stav</th>
                <th className="px-3 text-right font-medium">Základ</th>
                <th className="px-3 text-right font-medium">Celkem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.invoices.map((r) => {
                const s = receivedState(r.state);
                return (
                  <tr
                    key={r.id}
                    className="h-9 cursor-pointer hover:bg-hover"
                    onClick={() => setOpen(r.id)}
                  >
                    <td className="px-3">
                      <button
                        type="button"
                        className="font-medium hover:underline"
                        onClick={() => setOpen(r.id)}
                      >
                        {r.number}
                      </button>
                    </td>
                    <td className="px-3 text-muted">{r.supplier ?? "–"}</td>
                    <td className={`tabular px-3 ${r.overdue ? "text-danger" : "text-muted"}`}>
                      {r.dueDate ? formatDate(r.dueDate) : "–"}
                    </td>
                    <td className="px-3">
                      <Chip color={s.color}>{s.label}</Chip>
                      {r.overdue && (
                        <Chip color="red" className="ml-1">
                          Po splatnosti
                        </Chip>
                      )}
                    </td>
                    <td className="tabular px-3 text-right">{formatMinor(r.netMinor)}</td>
                    <td className="tabular px-3 text-right text-muted">
                      {formatMinor(r.grossMinor)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setOpen(null);
              setPrefill(null);
            }
          }}
        >
          <DialogContent
            title={open === "new" ? "Nová přijatá faktura" : "Přijatá faktura"}
            description="Částky bez DPH tvoří náklad zakázky."
            className="w-[min(56rem,calc(100vw-2rem))]"
          >
            <div className="px-5 py-4">
              {open === "new" ? (
                <ReceivedEditor
                  invoice={null}
                  jobId={id}
                  {...(prefill ? { prefill } : {})}
                  onDone={(newId) => setOpen(newId)}
                />
              ) : (
                <ReceivedPanel id={open} onDeleted={() => setOpen(null)} />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** Záložka na zakázce (skupina Náklady). */
export const tabs: RecordTab[] = [
  {
    id: "prijate-faktury",
    label: "Přijaté faktury",
    permission: ["fakturace.read"],
    group: "naklady",
    order: 50,
    render: ({ id }) => <JobReceivedTab id={id} />,
  },
];
export const actions: RecordAction[] = [];
export const pages: ModulePage[] = [];

/** Záložka na detailu samotné přijaté faktury (`/fakturace/prijate/<id>`). */
export const recordTabs: Record<string, RecordTab[]> = {
  received_invoice: [
    {
      id: "faktura",
      label: "Faktura",
      permission: "fakturace.read",
      order: 1,
      render: ({ id }) => <ReceivedPanel id={id} />,
    },
  ],
};
export const recordActions: Record<string, RecordAction[]> = {};
