"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
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
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useVatRates,
  vatBpChoices,
  successToast,
  type ModulePage,
  type RecordAction,
  type RecordTab,
} from "@rebar/ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { CostDialog } from "../costs/ui-list";
import { orderStatus, orderTotals } from "./calc";

const Err = ({ error }: { error: Error | null }) =>
  error ? (
    <p role="alert" className="mt-2 text-sm text-danger">
      {error.message}
    </p>
  ) : null;

type OrderRow = {
  id: string;
  number: string;
  title: string;
  supplier: string | null;
  status: string;
  totalMinor: number;
  orderDate: string | null;
  deliveryDate: string | null;
  costMinor: number;
  openMinor: number;
};
type OrderList = { orders: OrderRow[]; openMinor: number };

type OrderLine = {
  description: string;
  quantity: string;
  unit: string;
  unitPriceMinor: number;
  vatRateBp: number;
};
type OrderDetail = {
  id: string;
  jobId: string;
  number: string;
  title: string;
  supplierId: string | null;
  supplierName: string | null;
  sectionId: string | null;
  orderDate: string | null;
  deliveryDate: string | null;
  note: string | null;
  status: string;
  locked: boolean;
  editable: boolean;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  lines: (OrderLine & { id: string })[];
  costs: {
    key: string;
    label: string;
    source: string;
    date: string | null;
    amountMinor: number;
    href: string | null;
  }[];
  costMinor: number;
  approval: {
    status: string;
    canDecide: boolean;
    canReopen: boolean;
    approvalId: string | null;
    comment: string | null;
  };
};
type Targets = { sections: { id: string; label: string }[] };

const pct = (bp: number) => `${bp / 100} %`;
const BLANK: OrderLine = {
  description: "",
  quantity: "1",
  unit: "ks",
  unitPriceMinor: 0,
  vatRateBp: 2100,
};

/** Rozhodnutí o objednávce (schválit / zamítnout s důvodem) a vrácení do konceptu s důvodem. */
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

/** Editor konceptu objednávky: hlavička a řádky. Bez `order` zakládá novou. */
function OrderEditor({
  jobId,
  order,
  onDone,
}: {
  jobId: string;
  order: OrderDetail | null;
  onDone: (id: string) => void;
}) {
  const api = useEntityApi();
  const vat = useVatRates();
  const targets = useCommandQuery<Targets>("zakazky.costs.targets", { jobId });
  const [f, setF] = useState(() => ({
    title: order?.title ?? "",
    supplierId: order?.supplierId ?? (null as string | null),
    supplierName: order?.supplierId ? "" : (order?.supplierName ?? ""),
    sectionId: order?.sectionId ?? (null as string | null),
    orderDate: order?.orderDate ?? (null as string | null),
    deliveryDate: order?.deliveryDate ?? (null as string | null),
    note: order?.note ?? "",
  }));
  const [lines, setLines] = useState<OrderLine[]>(
    order?.lines.length
      ? order.lines.map(({ id: _id, ...l }) => l)
      : [{ ...BLANK, vatRateBp: vat.defaultBp }],
  );
  const save = useCommandMutation<Record<string, unknown>, { id: string }>("zakazky.orders.save", {
    onSuccess: (r) => {
      successToast(order ? "Objednávka uložena." : "Objednávka založena.");
      onDone(r.id);
    },
  });
  const totals = orderTotals(
    lines.map((l) => ({
      quantity: l.quantity.replace(",", ".") || "0",
      unitPriceMinor: l.unitPriceMinor,
      vatRateBp: l.vatRateBp,
    })),
  );
  const patch = (i: number, p: Partial<OrderLine>) =>
    setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          jobId,
          ...(order ? { id: order.id } : {}),
          title: f.title,
          supplierId: f.supplierId,
          supplierName: f.supplierId ? null : f.supplierName || null,
          sectionId: f.sectionId,
          orderDate: f.orderDate,
          deliveryDate: f.deliveryDate,
          note: f.note || null,
          lines: lines
            .filter((l) => l.description.trim())
            .map((l) => ({ ...l, quantity: l.quantity.replace(",", ".") })),
        });
      }}
    >
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Název objednávky">
          <Input
            autoFocus={!order}
            value={f.title}
            onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))}
          />
        </Field>
        <Field
          label="Oddíl rozpočtu"
          hint="Závazek se počítá v plánu vs skutečnosti tohoto oddílu."
        >
          <Combobox
            aria-label="Oddíl rozpočtu"
            options={(targets.data?.sections ?? []).map((s) => ({ value: s.id, label: s.label }))}
            value={f.sectionId}
            clearable
            placeholder="Bez oddílu"
            onChange={(v) => setF((s) => ({ ...s, sectionId: v as string | null }))}
          />
        </Field>
        <Field label="Dodavatel z kontaktů">
          <Combobox
            aria-label="Dodavatel z kontaktů"
            load={(q) => api.lookups.records("company", q)}
            value={f.supplierId}
            selectedLabels={
              f.supplierId && order?.supplierName ? { [f.supplierId]: order.supplierName } : {}
            }
            clearable
            placeholder="Vybrat firmu…"
            onChange={(v) => setF((s) => ({ ...s, supplierId: v as string | null }))}
          />
        </Field>
        <Field label="nebo dodavatel textem (např. z ARES)">
          <Input
            value={f.supplierName}
            disabled={!!f.supplierId}
            onChange={(e) => setF((s) => ({ ...s, supplierName: e.target.value }))}
          />
        </Field>
        <Field label="Datum objednání">
          <DatePicker value={f.orderDate} onChange={(v) => setF((s) => ({ ...s, orderDate: v }))} />
        </Field>
        <Field label="Termín dodání">
          <DatePicker
            value={f.deliveryDate}
            onChange={(v) => setF((s) => ({ ...s, deliveryDate: v }))}
          />
        </Field>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[40rem] text-left">
          <thead className="bg-subtle text-sm text-muted">
            <tr className="h-9">
              <th className="px-3 font-medium">Řádek</th>
              <th className="w-24 px-3 font-medium">Množství</th>
              <th className="w-20 px-3 font-medium">Jedn.</th>
              <th className="w-36 px-3 font-medium">Cena za jedn.</th>
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
                    onChange={(e) => patch(i, { description: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    aria-label={`Množství řádku ${i + 1}`}
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => patch(i, { quantity: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    aria-label={`Jednotka řádku ${i + 1}`}
                    value={l.unit}
                    onChange={(e) => patch(i, { unit: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <MoneyInput
                    aria-label={`Cena za jednotku řádku ${i + 1}`}
                    value={l.unitPriceMinor || null}
                    onChange={(v) => patch(i, { unitPriceMinor: v ?? 0 })}
                  />
                </td>
                <td className="px-2 py-1">
                  <Combobox
                    aria-label={`Sazba DPH řádku ${i + 1}`}
                    options={vatBpChoices(
                      vat,
                      lines.map((x) => x.vatRateBp),
                    ).map((bp) => ({ value: String(bp), label: pct(bp) }))}
                    value={String(l.vatRateBp)}
                    onChange={(v) => v && patch(i, { vatRateBp: Number(v) })}
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLines((c) => [...c, { ...BLANK, vatRateBp: vat.defaultBp }])}
                >
                  <Plus /> Přidat řádek
                </Button>
              </td>
              <td colSpan={3} className="tabular px-3 text-right">
                bez DPH <b>{formatMinor(totals.netMinor)}</b> · s DPH{" "}
                {formatMinor(totals.grossMinor)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Field label="Poznámka">
        <Textarea
          rows={2}
          value={f.note}
          onChange={(e) => setF((s) => ({ ...s, note: e.target.value }))}
        />
      </Field>
      <Err error={save.error} />
      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          variant="primary"
          loading={save.isPending}
          disabled={f.title.trim().length < 2}
        >
          {order ? "Uložit koncept" : "Založit objednávku"}
        </Button>
      </div>
    </form>
  );
}

/** Detail objednávky: stav schvalování, akce podle stavu, řádky a náklady, které se k ní vážou. */
export function OrderPanel({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const q = useCommandQuery<OrderDetail>("zakazky.orders.get", { id });
  const [costDialog, setCostDialog] = useState(false);
  const targets = useCommandQuery<Targets>(
    "zakazky.costs.targets",
    { jobId: q.data?.jobId },
    { enabled: !!q.data?.jobId },
  );
  const [dialog, setDialog] = useState<null | "reject" | "reopen">(null);
  const [editing, setEditing] = useState(false);
  const submit = useCommandMutation<{ id: string }, { status: string }>("zakazky.orders.submit", {
    onSuccess: (r) =>
      successToast(r.status === "approved" ? "Objednávka je schválená." : "Odesláno ke schválení."),
  });
  const receive = useCommandMutation<{ id: string }>("zakazky.orders.receive", {
    onSuccess: () => successToast("Objednávka přijata."),
  });
  const cancel = useCommandMutation<{ id: string }>("zakazky.orders.cancel");
  const del = useCommandMutation<{ id: string }>("zakazky.orders.delete", {
    onSuccess: () => onDeleted?.(),
  });
  const decide = useCommandMutation<{
    approvalId: string;
    approve: boolean;
    comment?: string | null;
  }>("zakazky.approval.decide", {
    onSuccess: () => setDialog(null),
  });
  const reopen = useCommandMutation<{ docType: string; docId: string; reason?: string | null }>(
    "zakazky.approval.reopen",
    { onSuccess: () => setDialog(null) },
  );
  const o = q.data;
  useEffect(() => {
    if (o && !o.editable) setEditing(false);
  }, [o]);
  if (q.isLoading || !o) return <Skeleton className="h-32" />;
  const st = orderStatus(o.status);

  if (editing && o.editable)
    return <OrderEditor jobId={o.jobId} order={o} onDone={() => setEditing(false)} />;

  return (
    <div className="space-y-4" data-testid="order-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">
          {o.number} · {o.title}
        </h3>
        <Chip color={st.color}>{st.label}</Chip>
        {o.locked && <Chip>Zamčeno</Chip>}
        <div className="ml-auto flex flex-wrap gap-2">
          {o.status === "draft" && (
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
          {o.status === "pending" && o.approval.canDecide && (
            <>
              <Button
                variant="primary"
                loading={decide.isPending}
                onClick={() => decide.mutate({ approvalId: o.approval.approvalId!, approve: true })}
              >
                Schválit
              </Button>
              <Button variant="secondary" onClick={() => setDialog("reject")}>
                Zamítnout
              </Button>
            </>
          )}
          {o.approval.canReopen && (
            <Button variant="secondary" onClick={() => setDialog("reopen")}>
              Vrátit do konceptu
            </Button>
          )}
          {o.status === "approved" && (
            <Button
              variant="primary"
              loading={receive.isPending}
              onClick={() => receive.mutate({ id })}
            >
              Přijmout zboží
            </Button>
          )}
          {(o.status === "approved" || o.status === "received") && (
            <Button variant="secondary" onClick={() => setCostDialog(true)}>
              Zapsat náklad
            </Button>
          )}
          {(o.status === "approved" || o.status === "received") && (
            <Button
              variant="secondary"
              onClick={() =>
                // záložku Přijaté faktury dodává modul Fakturace; plné načtení otevře ji s předvyplněnou objednávkou
                window.location.assign(
                  `/zakazky/${o.jobId}?tab=naklady&sub=prijate-faktury&orderId=${o.id}`,
                )
              }
            >
              Přidat přijatou fakturu
            </Button>
          )}
          {o.status === "approved" && (
            <Button
              variant="ghost"
              loading={cancel.isPending}
              onClick={() => cancel.mutate({ id })}
            >
              Zrušit objednávku
            </Button>
          )}
          {o.status === "draft" && (
            <IconButton
              label="Smazat koncept objednávky"
              variant="ghost"
              onClick={() => del.mutate({ id })}
            >
              <Trash2 />
            </IconButton>
          )}
        </div>
      </div>
      <Err
        error={
          submit.error ?? receive.error ?? cancel.error ?? del.error ?? decide.error ?? reopen.error
        }
      />
      {o.approval.status === "rejected" && o.approval.comment && (
        <p className="rounded-lg border border-line bg-subtle p-3 text-sm">
          Zamítnuto: {o.approval.comment}
        </p>
      )}
      {o.status === "pending" && !o.approval.canDecide && (
        <p className="text-sm text-muted">Čeká na schválení. Zamčená objednávka se nedá upravit.</p>
      )}

      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Dodavatel</dt>
          <dd>{o.supplierName ?? "–"}</dd>
        </div>
        <div>
          <dt className="text-muted">Objednáno</dt>
          <dd>{o.orderDate ? formatDate(o.orderDate) : "–"}</dd>
        </div>
        <div>
          <dt className="text-muted">Dodání</dt>
          <dd>{o.deliveryDate ? formatDate(o.deliveryDate) : "–"}</dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[34rem] text-left">
          <thead className="bg-subtle text-sm text-muted">
            <tr className="h-9">
              <th className="px-3 font-medium">Řádek</th>
              <th className="px-3 text-right font-medium">Množství</th>
              <th className="px-3 text-right font-medium">Cena za jedn.</th>
              <th className="px-3 text-right font-medium">DPH</th>
              <th className="px-3 text-right font-medium">Celkem bez DPH</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {o.lines.map((l) => (
              <tr key={l.id} className="h-9">
                <td className="px-3">{l.description}</td>
                <td className="tabular px-3 text-right">
                  {Number(l.quantity).toLocaleString("cs-CZ")} {l.unit}
                </td>
                <td className="tabular px-3 text-right">{formatMinor(l.unitPriceMinor)}</td>
                <td className="tabular px-3 text-right text-muted">{pct(l.vatRateBp)}</td>
                <td className="tabular px-3 text-right">
                  {formatMinor(
                    orderTotals([
                      { quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, vatRateBp: 0 },
                    ]).netMinor,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-subtle text-sm">
            <tr className="h-9">
              <td colSpan={4} className="px-3 text-right text-muted">
                Celkem bez DPH · s DPH {formatMinor(o.grossMinor)}
              </td>
              <td className="tabular px-3 text-right font-semibold">{formatMinor(o.netMinor)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {(o.status === "approved" || o.status === "received") && (
        <section aria-label="Náklady k objednávce" className="rounded-lg border border-line p-4">
          <h4 className="mb-2 text-sm font-semibold">
            Náklady k objednávce: {formatMinor(o.costMinor)} z {formatMinor(o.netMinor)}
          </h4>
          {o.costs.length ? (
            <ul className="divide-y divide-line text-sm">
              {o.costs.map((c) => (
                <li key={c.key} className="flex h-9 items-center gap-3">
                  <span className="tabular w-24 text-muted">
                    {c.date ? formatDate(c.date) : ""}
                  </span>
                  <span className="flex-1">{c.label}</span>
                  <span className="tabular">{formatMinor(c.amountMinor)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Zatím žádný náklad. Po dodání zapište náklad nebo přidejte přijatou fakturu s touto
              objednávkou.
            </p>
          )}
        </section>
      )}

      {costDialog && targets.data && (
        <CostDialog
          jobId={o.jobId}
          row={null}
          sections={targets.data.sections.map((s) => ({ ...s, costCategory: null }))}
          prefill={{
            orderId: o.id,
            title: o.title,
            sectionId: o.sectionId,
            ...(o.supplierId ? { supplierId: o.supplierId } : {}),
          }}
          onClose={() => setCostDialog(false)}
        />
      )}
      {dialog === "reject" && (
        <ReasonDialog
          title="Zamítnout objednávku"
          confirm="Zamítnout"
          required
          busy={decide.isPending}
          error={decide.error}
          onSubmit={(comment) =>
            decide.mutate({ approvalId: o.approval.approvalId!, approve: false, comment })
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "reopen" && (
        <ReasonDialog
          title="Vrátit objednávku do konceptu"
          confirm="Vrátit do konceptu"
          required={false}
          busy={reopen.isPending}
          error={reopen.error}
          onSubmit={(reason) =>
            reopen.mutate({ docType: "order", docId: o.id, reason: reason || null })
          }
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/** Záložka Objednávky na zakázce: seznam, otevřený závazek a nová objednávka. */
function OrdersTab({ id }: { id: string }) {
  const list = useCommandQuery<OrderList>("zakazky.orders.list", { jobId: id });
  const [open, setOpen] = useState<string | "new" | null>(null);
  const d = list.data;
  return (
    <div className="space-y-4" data-testid="orders-tab">
      <div className="flex flex-wrap items-center gap-2">
        {d && d.openMinor > 0 && (
          <span className="text-sm text-muted">
            Otevřený závazek: <b className="tabular text-fg">{formatMinor(d.openMinor)}</b> (bez
            DPH)
          </span>
        )}
        <Button className="ml-auto" variant="primary" onClick={() => setOpen("new")}>
          <Plus /> Nová objednávka
        </Button>
      </div>
      {list.isLoading || !d ? (
        <Skeleton className="h-24" />
      ) : !d.orders.length ? (
        <EmptyState
          title="Žádné objednávky"
          description="Objednávka dodavateli je závazek: po schválení se počítá v plánu vs skutečnosti jako objednáno, dokud ji nepokryjí náklady."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[46rem] text-left">
            <thead className="bg-subtle text-sm text-muted">
              <tr className="h-9">
                <th className="px-3 font-medium">Číslo</th>
                <th className="px-3 font-medium">Název</th>
                <th className="px-3 font-medium">Dodavatel</th>
                <th className="px-3 font-medium">Dodání</th>
                <th className="px-3 font-medium">Stav</th>
                <th className="px-3 text-right font-medium">Bez DPH</th>
                <th className="px-3 text-right font-medium">Otevřeno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.orders.map((o) => {
                const s = orderStatus(o.status);
                return (
                  <tr
                    key={o.id}
                    className="h-9 cursor-pointer hover:bg-hover"
                    onClick={() => setOpen(o.id)}
                  >
                    <td className="px-3">
                      <button
                        type="button"
                        className="font-medium hover:underline"
                        onClick={() => setOpen(o.id)}
                      >
                        {o.number}
                      </button>
                    </td>
                    <td className="px-3">{o.title}</td>
                    <td className="px-3 text-muted">{o.supplier ?? "–"}</td>
                    <td className="tabular px-3 text-muted">
                      {o.deliveryDate ? formatDate(o.deliveryDate) : "–"}
                    </td>
                    <td className="px-3">
                      <Chip color={s.color}>{s.label}</Chip>
                    </td>
                    <td className="tabular px-3 text-right">{formatMinor(o.totalMinor)}</td>
                    <td className="tabular px-3 text-right text-muted">
                      {o.openMinor ? formatMinor(o.openMinor) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(null)}>
          <DialogContent
            title={open === "new" ? "Nová objednávka" : "Objednávka"}
            description="Částky bez DPH tvoří závazek."
            className="w-[min(52rem,calc(100vw-2rem))]"
          >
            <div className="px-5 py-4">
              {open === "new" ? (
                <OrderEditor jobId={id} order={null} onDone={(newId) => setOpen(newId)} />
              ) : (
                <OrderPanel id={open} onDeleted={() => setOpen(null)} />
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
    id: "objednavky",
    label: "Objednávky",
    permission: "zakazky.economics",
    group: "naklady",
    order: 40,
    render: ({ id }) => <OrdersTab id={id} />,
  },
];
export const actions: RecordAction[] = [];
export const pages: ModulePage[] = [];

/** Záložky a akce na detailu samotné objednávky (`/zakazky/objednavky/<id>`). */
export const recordTabs: Record<string, RecordTab[]> = {
  job_order: [
    {
      id: "objednavka",
      label: "Objednávka",
      permission: "zakazky.economics",
      order: 1,
      render: ({ id }) => <OrderPanel id={id} />,
    },
  ],
};
export const recordActions: Record<string, RecordAction[]> = {};
