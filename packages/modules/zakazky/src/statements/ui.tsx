"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Button,
  Chip,
  Combobox,
  ConfirmDialog,
  DatePicker,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  IconButton,
  Input,
  MoneyInput,
  Notice,
  Skeleton,
  cn,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useNav,
  type ModulePage,
  type RecordAction,
  type RecordTab,
} from "@rebar/ui";
import { ArrowLeft, FileText, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApprovalPanel } from "../approvals/ui";
import { STATEMENT_STATUS_LABEL } from "./calc";

/** UI oblasti „statements“ (součást záložky Fakturace). Klientský kód: žádné importy serverových částí. */
export const actions: RecordAction[] = [];
export const pages: ModulePage[] = [];

type StatementSummary = {
  id: string;
  jobId: string;
  objectId: string | null;
  number: number;
  label: string;
  periodFrom: string;
  periodTo: string;
  status: string;
  claimedMinor: number | null;
  approvedMinor: number | null;
  invoiceId: string | null;
  note: string | null;
  lockedAt: string | null;
  filledCount: number;
};
type StatementList = {
  statements: StatementSummary[];
  objects: { id: string; title: string; code: string | null }[];
  hasRealization: boolean;
  money: boolean;
};
type StatementLine = {
  id: string;
  itemId: string;
  code: string | null;
  title: string;
  sectionTitle: string;
  unit: string;
  budgetQuantity: string;
  previousQuantity: string;
  quantityPeriod: string;
  quantityTotal: string;
  percent: number;
  remainingQuantity: string;
  over: boolean;
  unitPriceMinor: number | null;
  amountPeriodMinor: number | null;
  amountTotalMinor: number | null;
};
type StatementDetail = {
  statement: StatementSummary;
  lines: StatementLine[];
  editable: boolean;
  canSubmit: boolean;
  money: boolean;
};

const qty = (q: string) => Number(q).toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
const periodText = (s: Pick<StatementSummary, "periodFrom" | "periodTo">) =>
  `${formatDate(s.periodFrom)} – ${formatDate(s.periodTo)}`;

function StatusChip({ status }: { status: string }) {
  const st = STATEMENT_STATUS_LABEL[status] ?? STATEMENT_STATUS_LABEL.draft!;
  return <Chip color={st.color}>{st.label}</Chip>;
}

/** První a poslední den měsíce, ve kterém je dnešek. */
function currentMonth(): { from: string; to: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

/* ---------- nový soupis ---------- */

function NewStatementDialog({
  jobId,
  objects,
  onClose,
  onCreated,
}: {
  jobId: string;
  objects: StatementList["objects"];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const month = currentMonth();
  const [from, setFrom] = useState<string | null>(month.from);
  const [to, setTo] = useState<string | null>(month.to);
  const [objectId, setObjectId] = useState<string | null>(null);
  const create = useCommandMutation<Record<string, unknown>, { id: string }>(
    "zakazky.statement.create",
    { onSuccess: (r) => onCreated(r.id) },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Nový soupis provedených prací"
        description="Řádky se předvyplní z rozpočtu realizace, provedené množství za období doplníte v tabulce."
      >
        <form
          className="px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to)
              create.mutate({
                jobId,
                periodFrom: from,
                periodTo: to,
                ...(objectId ? { objectId } : {}),
              });
          }}
        >
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Období od">
              <DatePicker value={from} onChange={setFrom} />
            </Field>
            <Field label="Období do">
              <DatePicker value={to} onChange={setTo} />
            </Field>
          </div>
          {objects.length > 0 && (
            <Field label="Stavební objekt" hint="Prázdné = celá zakázka.">
              <Combobox
                aria-label="Stavební objekt"
                value={objectId}
                clearable
                placeholder="Celá zakázka"
                options={objects.map((o) => ({
                  value: o.id,
                  label: `${o.code ? `${o.code} ` : ""}${o.title}`,
                }))}
                onChange={(v) => setObjectId(v as string | null)}
              />
            </Field>
          )}
          {create.error && (
            <p role="alert" className="mb-3 text-sm text-danger">
              {create.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={create.isPending}
              disabled={!from || !to}
            >
              Založit soupis
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- seznam ---------- */

function StatementListView({ jobId, onOpen }: { jobId: string; onOpen: (id: string) => void }) {
  const q = useCommandQuery<StatementList>("zakazky.statement.list", { jobId });
  const [creating, setCreating] = useState(false);
  if (q.isLoading) return <Skeleton className="h-32" />;
  const d = q.data;
  const add = (
    <Button variant="primary" onClick={() => setCreating(true)} disabled={!d?.hasRealization}>
      <Plus /> Nový soupis
    </Button>
  );
  return (
    <div className="space-y-4">
      {!d?.statements.length ? (
        <EmptyState
          title="Zatím žádný soupis prací"
          description={
            d?.hasRealization
              ? "Soupis zachycuje, co se na stavbě za období provedlo. Po schválení z něj vytvoříte dílčí fakturu."
              : "Soupis jde založit, až má zakázka rozpočet realizace."
          }
          action={add}
        />
      ) : (
        <>
          <div className="flex justify-end">{add}</div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[40rem] text-left" data-testid="statements-list">
              <thead className="bg-subtle text-sm text-muted">
                <tr className="h-9">
                  <th className="px-3 font-medium">Soupis</th>
                  <th className="px-3 font-medium">Období</th>
                  <th className="px-3 font-medium">Stav</th>
                  {d.money && <th className="px-3 text-right font-medium">Nárokováno</th>}
                  {d.money && <th className="px-3 text-right font-medium">Schváleno</th>}
                  <th className="px-3 font-medium">Faktura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.statements.map((s) => (
                  <tr
                    key={s.id}
                    className="h-9 cursor-pointer hover:bg-hover"
                    onClick={() => onOpen(s.id)}
                  >
                    <td className="px-3">
                      <button
                        type="button"
                        className="font-medium hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(s.id);
                        }}
                      >
                        {s.label}
                      </button>
                    </td>
                    <td className="tabular px-3 text-muted">{periodText(s)}</td>
                    <td className="px-3">
                      <StatusChip status={s.status} />
                    </td>
                    {d.money && (
                      <td className="tabular px-3 text-right">{formatMinor(s.claimedMinor)}</td>
                    )}
                    {d.money && (
                      <td className="tabular px-3 text-right">
                        {s.status === "approved" ? formatMinor(s.approvedMinor) : ""}
                      </td>
                    )}
                    <td className="px-3">
                      {s.invoiceId ? (
                        <Chip color="blue">Vyfakturováno</Chip>
                      ) : s.status === "approved" ? (
                        <span className="text-sm text-muted">K fakturaci</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {creating && d && (
        <NewStatementDialog
          jobId={jobId}
          objects={d.objects}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onOpen(id);
          }}
        />
      )}
    </div>
  );
}

/* ---------- editor ---------- */

/** Pole provedeného množství za období; ukládá se po opuštění pole. */
function QtyCell({
  line,
  disabled,
  onSave,
}: {
  line: StatementLine;
  disabled: boolean;
  onSave: (itemId: string, value: string) => void;
}) {
  const shown =
    line.quantityPeriod === "0.000" || Number(line.quantityPeriod) === 0
      ? ""
      : qty(line.quantityPeriod).replace(/\s/g, "");
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <Input
      inputMode="decimal"
      aria-label={`Provedeno za období: ${line.title}`}
      className={cn("h-7 w-24 text-right", line.over && "border-danger")}
      value={text}
      placeholder="0"
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim().replace(",", ".") !== shown.replace(",", ".") && (text.trim() || shown))
          onSave(line.itemId, text.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function ApprovedAmountBox({ statement }: { statement: StatementSummary }) {
  const state = useCommandQuery<{ canDecide: boolean }>("zakazky.approval.state", {
    docType: "statement",
    docId: statement.id,
  });
  const [value, setValue] = useState<number | null>(statement.approvedMinor);
  const set = useCommandMutation<{ id: string; approvedMinor: number }>(
    "zakazky.statement.setApproved",
    { onSuccess: () => successToast("Schválená částka uložena.") },
  );
  if (!state.data?.canDecide) return null;
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="mb-2 text-sm font-medium text-muted">
        Schválená částka (nárokováno {formatMinor(statement.claimedMinor)})
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <MoneyInput aria-label="Schválená částka" value={value} onChange={setValue} />
        </div>
        <Button
          loading={set.isPending}
          disabled={value === null}
          onClick={() => value !== null && set.mutate({ id: statement.id, approvedMinor: value })}
        >
          Uložit
        </Button>
      </div>
      <p className="mt-1.5 text-sm text-faint">
        Můžete ji snížit proti nárokované; z té se pak vychází při fakturaci.
      </p>
      {set.error && (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {set.error.message}
        </p>
      )}
    </div>
  );
}

function StatementEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { push } = useNav();
  const can = useCan();
  const q = useCommandQuery<StatementDetail>("zakazky.statement.get", { id });
  const setLine = useCommandMutation<{
    statementId: string;
    lines: { itemId: string; quantityPeriod: string }[];
  }>("zakazky.statement.line.set");
  const save = useCommandMutation<Record<string, unknown>>("zakazky.statement.save");
  const del = useCommandMutation<{ id: string }>("zakazky.statement.delete", { onSuccess: onBack });
  const submit = useCommandMutation<{ id: string }, { status: string }>(
    "zakazky.statement.submit",
    {
      onSuccess: (r) =>
        successToast(r.status === "approved" ? "Soupis je schválený." : "Odesláno ke schválení."),
    },
  );
  const invoice = useCommandMutation<{ statementId: string }, { id: string }>(
    "fakturace.createFromStatement",
    {
      onSuccess: (r) => {
        successToast("Koncept dílčí faktury je hotový.");
        push(`/fakturace/${r.id}`);
      },
    },
  );
  const [resetKey, setResetKey] = useState(0);
  const [filter, setFilter] = useState("");
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [head, setHead] = useState<{ from: string | null; to: string | null; note: string } | null>(
    null,
  );
  const d = q.data;
  useEffect(() => {
    if (d && head === null)
      setHead({
        from: d.statement.periodFrom,
        to: d.statement.periodTo,
        note: d.statement.note ?? "",
      });
  }, [d, head]);
  const lines = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (d?.lines ?? []).filter(
      (l) =>
        (!onlyFilled || Number(l.quantityPeriod) > 0) &&
        (!f || `${l.code ?? ""} ${l.title} ${l.sectionTitle}`.toLowerCase().includes(f)),
    );
  }, [d, filter, onlyFilled]);
  if (q.isLoading || !d || !head) return <Skeleton className="h-48" />;

  const s = d.statement;
  const claimed = d.lines.reduce((a, l) => a + (l.amountPeriodMinor ?? 0), 0);
  const persistHead = () => {
    if (!d.editable || !head.from || !head.to) return;
    if (head.from === s.periodFrom && head.to === s.periodTo && head.note === (s.note ?? ""))
      return;
    save.mutate({ id, periodFrom: head.from, periodTo: head.to, note: head.note });
  };

  return (
    <div className="space-y-4" data-testid="statement-editor">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="Zpět na seznam soupisů" variant="ghost" onClick={onBack}>
          <ArrowLeft />
        </IconButton>
        <h2 className="text-lg font-semibold">{s.label}</h2>
        <StatusChip status={s.status} />
        <span className="text-base text-muted">{periodText(s)}</span>
        {s.invoiceId && <Chip color="blue">Vyfakturováno</Chip>}
      </div>

      <ApprovalPanel
        docType="statement"
        docId={id}
        lockedText="Schválený soupis je zamčený a podklad pro fakturu. Chcete-li ho upravit, vraťte ho do konceptu."
      />
      {s.status === "submitted" && d.money && <ApprovedAmountBox statement={s} />}

      <section className="rounded-lg border border-line p-4">
        <div className="grid gap-x-3 sm:grid-cols-3">
          <Field label="Období od">
            <DatePicker
              value={head.from}
              onChange={(v) => setHead((h) => h && { ...h, from: v })}
              disabled={!d.editable}
            />
          </Field>
          <Field label="Období do">
            <DatePicker
              value={head.to}
              onChange={(v) => setHead((h) => h && { ...h, to: v })}
              disabled={!d.editable}
            />
          </Field>
          <Field label="Poznámka">
            <Input
              value={head.note}
              readOnly={!d.editable}
              onChange={(e) => setHead({ ...head, note: e.target.value })}
              onBlur={persistHead}
            />
          </Field>
        </div>
        {d.editable && (head.from !== s.periodFrom || head.to !== s.periodTo) && (
          <Button size="sm" onClick={persistHead}>
            Uložit období
          </Button>
        )}
        {save.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {save.error.message}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium uppercase tracking-wide text-faint">
            Provedené práce
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Hledat položku"
              placeholder="Hledat položku…"
              className="w-48"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <Button
              variant={onlyFilled ? "primary" : "secondary"}
              onClick={() => setOnlyFilled((v) => !v)}
            >
              Jen vyplněné
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[56rem] text-left" data-testid="statement-lines">
            <thead className="bg-subtle text-sm text-muted">
              <tr className="h-9">
                <th className="px-3 font-medium">Položka</th>
                <th className="px-3 text-right font-medium">Rozpočet</th>
                <th className="px-3 text-right font-medium">Dříve</th>
                <th className="px-3 text-right font-medium">Za období</th>
                <th className="px-3 text-right font-medium">Celkem</th>
                <th className="px-3 text-right font-medium">Hotovo</th>
                {d.money && <th className="px-3 text-right font-medium">Částka za období</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => (
                <tr key={`${l.id}-${resetKey}`} className="h-9">
                  <td className="px-3">
                    <span className="font-medium">
                      {l.code ? `${l.code} ` : ""}
                      {l.title}
                    </span>
                    <span className="ml-2 text-sm text-faint">{l.sectionTitle}</span>
                  </td>
                  <td className="tabular px-3 text-right text-muted">
                    {qty(l.budgetQuantity)} {l.unit}
                  </td>
                  <td className="tabular px-3 text-right text-muted">{qty(l.previousQuantity)}</td>
                  <td className="px-3 text-right">
                    {d.editable ? (
                      <QtyCell
                        line={l}
                        disabled={setLine.isPending}
                        onSave={(itemId, value) =>
                          setLine.mutate(
                            { statementId: id, lines: [{ itemId, quantityPeriod: value }] },
                            // odmítnuté množství se vrátí na uloženou hodnotu
                            { onError: () => setResetKey((k) => k + 1) },
                          )
                        }
                      />
                    ) : (
                      <span className="tabular">{qty(l.quantityPeriod)}</span>
                    )}
                  </td>
                  <td className="tabular px-3 text-right">{qty(l.quantityTotal)}</td>
                  <td className="px-3">
                    <div className="ml-auto flex w-24 items-center justify-end gap-2">
                      <span
                        className="h-1.5 w-12 overflow-hidden rounded-full bg-hover"
                        aria-hidden
                      >
                        <span
                          className="block h-full bg-accent"
                          style={{ width: `${Math.min(100, l.percent)}%` }}
                        />
                      </span>
                      <span className="tabular text-sm">{l.percent.toLocaleString("cs-CZ")} %</span>
                    </div>
                  </td>
                  {d.money && (
                    <td className="tabular px-3 text-right font-medium">
                      {Number(l.quantityPeriod) > 0 ? formatMinor(l.amountPeriodMinor) : ""}
                    </td>
                  )}
                </tr>
              ))}
              {!lines.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted">
                    Žádná položka neodpovídá.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {setLine.error && (
          <Notice tone="error" title="Množství se neuložilo">
            {setLine.error.message}
          </Notice>
        )}
      </section>

      {d.money && (
        <section
          className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2"
          data-testid="statement-totals"
        >
          <div>
            <p className="text-sm text-muted">Nárokováno za období</p>
            <p className="tabular text-lg font-semibold">{formatMinor(claimed)}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Schváleno</p>
            <p className="tabular text-lg font-semibold">
              {s.status === "approved" ? formatMinor(s.approvedMinor) : "—"}
            </p>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {d.editable ? (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Smazat soupis
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          {s.status === "approved" && !s.invoiceId && can("fakturace.write") && (
            <Button
              variant="primary"
              loading={invoice.isPending}
              onClick={() => invoice.mutate({ statementId: id })}
            >
              <FileText /> Vytvořit dílčí fakturu
            </Button>
          )}
          {d.editable && (
            <Button
              variant="primary"
              loading={submit.isPending}
              disabled={!d.canSubmit}
              onClick={() => submit.mutate({ id })}
            >
              <Send /> Odeslat ke schválení
            </Button>
          )}
        </div>
      </div>
      {[submit.error, invoice.error, del.error].map(
        (e, i) =>
          e && (
            <p key={i} role="alert" className="text-sm text-danger">
              {e.message}
            </p>
          ),
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Smazat soupis"
        description={`${s.label}, ${periodText(s)}`}
        confirmLabel="Smazat"
        danger
        onConfirm={() => del.mutateAsync({ id }).then(() => undefined)}
      >
        Zadané množství se zahodí. Schválený soupis smazat nejde.
      </ConfirmDialog>
    </div>
  );
}

/* ---------- záložka ---------- */

function StatementsTab({ id }: { id: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("statement");
      if (p) setSelected(p);
    } catch {
      /* adresa bez parametrů */
    }
  }, []);
  return selected ? (
    <StatementEditor id={selected} onBack={() => setSelected(null)} />
  ) : (
    <StatementListView jobId={id} onOpen={setSelected} />
  );
}

export const tabs: RecordTab[] = [
  {
    id: "soupisy",
    label: "Soupisy prací",
    permission: ["zakazky.write", "zakazky.economics"],
    group: "fakturace",
    order: 5,
    render: ({ id }) => <StatementsTab id={id} />,
  },
];
