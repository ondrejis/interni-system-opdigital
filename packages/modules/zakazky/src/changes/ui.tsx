"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Button,
  Chip,
  Combobox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  IconButton,
  Input,
  MoneyInput,
  Notice,
  Skeleton,
  Textarea,
  cn,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useNav,
  type ModulePage,
  type RecordAction,
  type RecordOverviewCard,
  type RecordTab,
} from "@rebar/ui";
import { ArrowLeft, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApprovalPanel } from "../approvals/ui";
import {
  CHANGE_LINE_LABEL,
  CHANGE_STATUS_LABEL,
  lineImpact,
  toThousandths,
  type ChangeLineKind,
} from "./calc";

/** UI oblasti „changes“ (záložka Změny). Klientský kód: žádné importy serverových částí. */
export const actions: RecordAction[] = [];
export const pages: ModulePage[] = [];

type ChangeSummary = {
  id: string;
  label: string;
  title: string;
  status: string;
  amountMinor: number;
  costImpactMinor: number;
  lineCount: number;
  decidedAt: string | null;
  decidedBy: string | null;
  lockedAt: string | null;
};
type ChangeList = {
  changes: ChangeSummary[];
  totals: { approvedMinor: number; pendingMinor: number; draftMinor: number };
};
type Line = {
  id: string;
  kind: ChangeLineKind;
  itemId: string | null;
  sectionId: string | null;
  title: string;
  unit: string;
  itemKind: string;
  quantityBefore: string;
  quantityAfter: string;
  unitCostMinor: number;
  unitPriceMinor: number;
  vatRateBp: number;
  priceImpactMinor: number;
  costImpactMinor: number;
};
type ChangeDetail = {
  change: ChangeSummary & {
    description: string | null;
    reason: string | null;
    jobId: string;
    appliedAt: string | null;
  };
  lines: Line[];
  editable: boolean;
  canSubmit: boolean;
  hasRealization: boolean;
};
type BudgetItems = {
  versionId: string | null;
  sections: { id: string; title: string; code: string | null }[];
  items: {
    id: string;
    sectionId: string;
    sectionTitle: string;
    code: string | null;
    title: string;
    unit: string;
    quantity: string;
    unitCostMinor: number;
    unitPriceMinor: number;
  }[];
};

const signed = (minor: number) => `${minor > 0 ? "+" : ""}${formatMinor(minor)}`;
const qtyText = (q: string) => Number(q).toLocaleString("cs-CZ", { maximumFractionDigits: 3 });

/** Částka se znaménkem; kladný dopad na cenu je dobrý (zelená), u nákladu je dobrý záporný (`cost`). */
function Impact({ minor, cost, className }: { minor: number; cost?: boolean; className?: string }) {
  const good = cost ? -minor : minor;
  return (
    <span
      className={cn("tabular", good > 0 && "text-success", good < 0 && "text-danger", className)}
    >
      {minor === 0 ? formatMinor(0) : signed(minor)}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const st = CHANGE_STATUS_LABEL[status] ?? CHANGE_STATUS_LABEL.draft!;
  return <Chip color={st.color}>{st.label}</Chip>;
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{children}</p>
    </div>
  );
}

/* ---------- seznam ---------- */

function ChangeListView({ jobId, onOpen }: { jobId: string; onOpen: (id: string) => void }) {
  const q = useCommandQuery<ChangeList>("zakazky.change.list", { jobId });
  const create = useCommandMutation<{ jobId: string }, { id: string }>("zakazky.change.create", {
    onSuccess: (r) => onOpen(r.id),
  });
  const newButton = (
    <Button variant="primary" loading={create.isPending} onClick={() => create.mutate({ jobId })}>
      <Plus /> Nová změna
    </Button>
  );
  if (q.isLoading) return <Skeleton className="h-32" />;
  const data = q.data;
  return (
    <div className="space-y-4">
      {!data?.changes.length ? (
        <EmptyState
          title="Zatím žádné změny"
          description="Vícepráce a méněpráce proti smlouvě se zapisují jako změny. Schválená změna se propíše do rozpočtu realizace a započítá do smluvní ceny."
          action={newButton}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Schválené změny">
              <Impact minor={data.totals.approvedMinor} />
            </Kpi>
            <Kpi label="Čekají na schválení">
              <Impact minor={data.totals.pendingMinor} />
            </Kpi>
            <Kpi label="Koncepty">
              <Impact minor={data.totals.draftMinor} />
            </Kpi>
          </div>
          <div className="flex justify-end">{newButton}</div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[40rem] text-left" data-testid="changes-list">
              <thead className="bg-subtle text-sm text-muted">
                <tr className="h-9">
                  <th className="px-3 font-medium">Číslo</th>
                  <th className="px-3 font-medium">Název</th>
                  <th className="px-3 font-medium">Stav</th>
                  <th className="px-3 text-right font-medium">Řádků</th>
                  <th className="px-3 text-right font-medium">Dopad na cenu</th>
                  <th className="px-3 font-medium">Rozhodnuto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.changes.map((c) => (
                  <tr
                    key={c.id}
                    className="h-9 cursor-pointer hover:bg-hover"
                    onClick={() => onOpen(c.id)}
                  >
                    <td className="px-3 font-mono text-sm text-muted">{c.label}</td>
                    <td className="px-3">
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(c.id);
                        }}
                      >
                        {c.title}
                      </button>
                    </td>
                    <td className="px-3">
                      <StatusChip status={c.status} />
                    </td>
                    <td className="tabular px-3 text-right text-muted">{c.lineCount}</td>
                    <td className="px-3 text-right font-medium">
                      <Impact minor={c.amountMinor} />
                    </td>
                    <td className="px-3 text-sm text-muted">
                      {c.decidedAt
                        ? `${formatDate(c.decidedAt)}${c.decidedBy ? `, ${c.decidedBy}` : ""}`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {create.error && (
        <p role="alert" className="text-sm text-danger">
          {create.error.message}
        </p>
      )}
    </div>
  );
}

/* ---------- dialog řádku ---------- */

function LineDialog({
  changeId,
  jobId,
  kind,
  line,
  onClose,
}: {
  changeId: string;
  jobId: string;
  kind: ChangeLineKind;
  line: Line | null;
  onClose: () => void;
}) {
  const budget = useCommandQuery<BudgetItems>("zakazky.change.items", { jobId });
  const save = useCommandMutation<Record<string, unknown>>("zakazky.change.line.save", {
    onSuccess: onClose,
  });
  const [itemId, setItemId] = useState<string | null>(line?.itemId ?? null);
  const [qty, setQty] = useState(line ? qtyText(line.quantityAfter).replace(/\s/g, "") : "");
  const [title, setTitle] = useState(line?.title ?? "");
  const [unit, setUnit] = useState(line?.unit ?? "ks");
  const [price, setPrice] = useState<number | null>(line ? line.unitPriceMinor : null);
  const [cost, setCost] = useState<number | null>(line ? line.unitCostMinor : null);
  const [sectionId, setSectionId] = useState<string | null>(line?.sectionId ?? null);

  const item = budget.data?.items.find((i) => i.id === itemId);
  const before = kind === "add" ? "0" : (item?.quantity ?? line?.quantityBefore ?? "0");
  const after = kind === "remove" ? "0" : qty.replace(",", ".") || "0";
  const unitPrice =
    kind === "add" ? (price ?? 0) : (item?.unitPriceMinor ?? line?.unitPriceMinor ?? 0);
  const unitCost = kind === "add" ? (cost ?? 0) : (item?.unitCostMinor ?? line?.unitCostMinor ?? 0);
  const impact = lineImpact({
    kind,
    quantityBefore: before,
    quantityAfter: after,
    unitCostMinor: unitCost,
    unitPriceMinor: unitPrice,
  });
  const valid =
    kind === "add"
      ? title.trim().length > 1 && toThousandths(after) > 0
      : !!itemId && (kind === "remove" || toThousandths(after) !== toThousandths(before));

  const heading = line ? `Upravit řádek: ${CHANGE_LINE_LABEL[kind]}` : CHANGE_LINE_LABEL[kind];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={heading}>
        <form
          className="px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              changeId,
              ...(line ? { id: line.id } : {}),
              kind,
              ...(kind === "add"
                ? {
                    title: title.trim(),
                    unit: unit.trim() || "ks",
                    quantityAfter: after,
                    unitPriceMinor: price ?? 0,
                    unitCostMinor: cost ?? 0,
                    ...(sectionId ? { sectionId } : {}),
                  }
                : { itemId, ...(kind === "qty" ? { quantityAfter: after } : {}) }),
            });
          }}
        >
          {kind !== "add" && (
            <Field label="Položka rozpočtu">
              <Combobox
                aria-label="Položka rozpočtu"
                value={itemId}
                disabled={!!line}
                placeholder="Vyberte položku"
                searchPlaceholder="Hledat položku…"
                options={(budget.data?.items ?? []).map((i) => ({
                  value: i.id,
                  label: `${i.code ? `${i.code} ` : ""}${i.title}`,
                  hint: `${i.sectionTitle}, ${qtyText(i.quantity)} ${i.unit}`,
                }))}
                onChange={(v) => {
                  setItemId(v as string | null);
                  const it = budget.data?.items.find((x) => x.id === v);
                  if (it && kind === "qty") setQty(qtyText(it.quantity).replace(/\s/g, ""));
                }}
              />
            </Field>
          )}
          {kind === "add" && (
            <>
              <Field label="Název nové položky">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              </Field>
              {!!budget.data?.sections.length && (
                <Field label="Oddíl rozpočtu" hint="Prázdné = oddíl „Změny“ v rozpočtu realizace.">
                  <Combobox
                    aria-label="Oddíl rozpočtu"
                    value={sectionId}
                    clearable
                    placeholder="Oddíl Změny"
                    options={budget.data.sections.map((s) => ({
                      value: s.id,
                      label: `${s.code ? `${s.code} ` : ""}${s.title}`,
                    }))}
                    onChange={(v) => setSectionId(v as string | null)}
                  />
                </Field>
              )}
            </>
          )}
          {kind !== "remove" && (
            <div className="grid grid-cols-2 gap-x-3">
              <Field label={kind === "add" ? "Množství" : "Nové množství"}>
                <Input
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  aria-label="Množství"
                />
              </Field>
              {kind === "add" ? (
                <Field label="Jednotka">
                  <Input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={12} />
                </Field>
              ) : (
                <Field label="Dosavadní množství">
                  <Input readOnly value={item ? `${qtyText(before)} ${item.unit}` : ""} />
                </Field>
              )}
            </div>
          )}
          {kind === "add" && (
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="Prodejní cena za jednotku">
                <MoneyInput
                  aria-label="Prodejní cena za jednotku"
                  value={price}
                  onChange={setPrice}
                />
              </Field>
              <Field label="Nákladová cena za jednotku">
                <MoneyInput
                  aria-label="Nákladová cena za jednotku"
                  value={cost}
                  onChange={setCost}
                />
              </Field>
            </div>
          )}
          <div className="rounded-lg bg-subtle p-3 text-base" data-testid="line-preview">
            <p className="flex justify-between gap-3">
              <span className="text-muted">
                Množství: {qtyText(before)} → {qtyText(after)}
              </span>
            </p>
            <p className="mt-1 flex justify-between gap-3">
              <span className="text-muted">Dopad na cenu</span>
              <Impact minor={impact.priceImpactMinor} className="font-medium" />
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-muted">Dopad na náklad</span>
              <Impact minor={impact.costImpactMinor} cost />
            </p>
          </div>
          {save.error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {save.error.message}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!valid}>
              {line ? "Uložit" : "Přidat řádek"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- editor změny ---------- */

function ChangeEditor({ id, jobId, onBack }: { id: string; jobId: string; onBack: () => void }) {
  const q = useCommandQuery<ChangeDetail>("zakazky.change.get", { id });
  const summary = useCommandQuery<{ contractMinor: number }>("zakazky.summary", { jobId });
  const [dialog, setDialog] = useState<{ kind: ChangeLineKind; line: Line | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useCommandMutation<Record<string, unknown>>("zakazky.change.save");
  /** Rozběhnuté ukládání hlavičky (po opuštění pole): odeslání ke schválení na něj počká, ať se nezamkne starý název. */
  const saving = useRef<Promise<unknown> | null>(null);
  const del = useCommandMutation<{ id: string }>("zakazky.change.delete", { onSuccess: onBack });
  const delLine = useCommandMutation<{ id: string }>("zakazky.change.line.delete");
  const submit = useCommandMutation<{ id: string }, { status: string }>("zakazky.change.submit", {
    onSuccess: (r) =>
      successToast(r.status === "approved" ? "Změna je schválená." : "Odesláno ke schválení."),
  });
  const [head, setHead] = useState<{ title: string; reason: string; description: string } | null>(
    null,
  );
  const d = q.data;
  useEffect(() => {
    if (d && head === null)
      setHead({
        title: d.change.title,
        reason: d.change.reason ?? "",
        description: d.change.description ?? "",
      });
  }, [d, head]);
  if (q.isLoading || !d || !head) return <Skeleton className="h-48" />;

  const c = d.change;
  const editable = d.editable;
  const price = d.lines.reduce((a, l) => a + l.priceImpactMinor, 0);
  const cost = d.lines.reduce((a, l) => a + l.costImpactMinor, 0);
  const persist = () => {
    if (!editable) return;
    if (
      head.title === c.title &&
      head.reason === (c.reason ?? "") &&
      head.description === (c.description ?? "")
    )
      return;
    if (head.title.trim().length < 2) return;
    saving.current = save
      .mutateAsync({
        id,
        title: head.title,
        reason: head.reason,
        description: head.description,
      })
      .catch(() => undefined); // chybu ukazuje `save.error` pod polem
  };
  // smluvní cena: u schválené změny už ji obsahuje
  const contractNow = summary.data?.contractMinor;
  const contractBefore =
    contractNow === undefined
      ? null
      : c.status === "approved"
        ? contractNow - c.amountMinor
        : contractNow;
  const contractAfter = contractBefore === null ? null : contractBefore + price;

  return (
    <div className="space-y-4" data-testid="change-editor">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="Zpět na seznam změn" variant="ghost" onClick={onBack}>
          <ArrowLeft />
        </IconButton>
        <span className="font-mono text-base text-muted">{c.label}</span>
        <StatusChip status={c.status} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{c.title}</h2>
      </div>

      <ApprovalPanel
        docType="change"
        docId={id}
        lockedText="Schválená změna je zamčená. Chcete-li ji upravit, vraťte ji do konceptu (smí jen ten, kdo schvaluje bez limitu)."
      />
      {!editable && c.status === "draft" && (
        <Notice tone="info">Změnu nemáte oprávnění upravovat.</Notice>
      )}

      <section className="rounded-lg border border-line p-4">
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Název změny">
            <Input
              value={head.title}
              readOnly={!editable}
              onChange={(e) => setHead({ ...head, title: e.target.value })}
              onBlur={persist}
            />
          </Field>
          <Field label="Důvod změny">
            <Input
              value={head.reason}
              readOnly={!editable}
              placeholder="Např. požadavek investora"
              onChange={(e) => setHead({ ...head, reason: e.target.value })}
              onBlur={persist}
            />
          </Field>
        </div>
        <Field label="Popis">
          <Textarea
            value={head.description}
            readOnly={!editable}
            onChange={(e) => setHead({ ...head, description: e.target.value })}
            onBlur={persist}
          />
        </Field>
        {save.error && (
          <p role="alert" className="text-sm text-danger">
            {save.error.message}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium uppercase tracking-wide text-faint">Řádky změny</h3>
          {editable && (
            <div className="flex flex-wrap gap-2">
              {d.hasRealization && (
                <>
                  <Button onClick={() => setDialog({ kind: "qty", line: null })}>
                    Změna množství
                  </Button>
                  <Button onClick={() => setDialog({ kind: "remove", line: null })}>
                    Odebrat položku
                  </Button>
                </>
              )}
              <Button onClick={() => setDialog({ kind: "add", line: null })}>
                <Plus /> Nová položka
              </Button>
            </div>
          )}
        </div>
        {!d.lines.length ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-muted">
            Změna zatím nemá žádný řádek.
            {!d.hasRealization && " Rozpočet realizace ještě není, lze přidat jen nové položky."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[46rem] text-left" data-testid="change-lines">
              <thead className="bg-subtle text-sm text-muted">
                <tr className="h-9">
                  <th className="px-3 font-medium">Typ</th>
                  <th className="px-3 font-medium">Položka</th>
                  <th className="px-3 text-right font-medium">Množství</th>
                  <th className="px-3 text-right font-medium">Cena / j.</th>
                  <th className="px-3 text-right font-medium">Dopad na cenu</th>
                  <th className="px-3 text-right font-medium">Dopad na náklad</th>
                  {editable && <th className="w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.lines.map((l) => (
                  <tr key={l.id} className="h-9">
                    <td className="px-3">
                      <Chip
                        color={l.kind === "add" ? "blue" : l.kind === "remove" ? "red" : "gray"}
                      >
                        {CHANGE_LINE_LABEL[l.kind]}
                      </Chip>
                    </td>
                    <td className="px-3">{l.title}</td>
                    <td className="tabular px-3 text-right">
                      {l.kind === "add" ? "" : `${qtyText(l.quantityBefore)} → `}
                      {qtyText(l.quantityAfter)} {l.unit}
                    </td>
                    <td className="tabular px-3 text-right text-muted">
                      {formatMinor(l.unitPriceMinor)}
                    </td>
                    <td className="px-3 text-right font-medium">
                      <Impact minor={l.priceImpactMinor} />
                    </td>
                    <td className="px-3 text-right">
                      <Impact minor={l.costImpactMinor} cost />
                    </td>
                    {editable && (
                      <td className="px-2">
                        <div className="flex justify-end">
                          <IconButton
                            label={`Upravit řádek ${l.title}`}
                            variant="ghost"
                            size="sm"
                            onClick={() => setDialog({ kind: l.kind, line: l })}
                          >
                            <Pencil />
                          </IconButton>
                          <IconButton
                            label={`Odebrat řádek ${l.title}`}
                            variant="ghost"
                            size="sm"
                            onClick={() => delLine.mutate({ id: l.id })}
                          >
                            <Trash2 />
                          </IconButton>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {delLine.error && (
          <p role="alert" className="text-sm text-danger">
            {delLine.error.message}
          </p>
        )}
      </section>

      <section
        className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="change-impact"
      >
        <div>
          <p className="text-sm text-muted">Dopad na cenu</p>
          <p className="text-lg font-semibold">
            <Impact minor={price} />
          </p>
        </div>
        <div>
          <p className="text-sm text-muted">Dopad na náklad</p>
          <p className="text-lg font-semibold">
            <Impact minor={cost} cost />
          </p>
        </div>
        <div>
          <p className="text-sm text-muted">Dopad na marži</p>
          <p className="text-lg font-semibold">
            <Impact minor={price - cost} />
          </p>
        </div>
        <div>
          <p className="text-sm text-muted">Smluvní cena</p>
          <p className="tabular text-lg font-semibold">
            {contractBefore === null
              ? "—"
              : `${formatMinor(contractBefore)} → ${formatMinor(contractAfter)}`}
          </p>
        </div>
      </section>

      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Smazat změnu
          </Button>
          <Button
            variant="primary"
            loading={submit.isPending}
            disabled={!d.canSubmit}
            onClick={() => {
              // první se dokončí rozepsaná úprava hlavičky (po odeslání je změna zamčená a úprava by se ztratila)
              persist();
              void Promise.resolve(saving.current).then(() => submit.mutate({ id }));
            }}
          >
            <Send /> Odeslat ke schválení
          </Button>
        </div>
      )}
      {submit.error && (
        <p role="alert" className="text-sm text-danger">
          {submit.error.message}
        </p>
      )}
      {del.error && (
        <p role="alert" className="text-sm text-danger">
          {del.error.message}
        </p>
      )}

      {dialog && (
        <LineDialog
          key={`${dialog.kind}-${dialog.line?.id ?? "new"}`}
          changeId={id}
          jobId={jobId}
          kind={dialog.kind}
          line={dialog.line}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Smazat změnu"
        description={`${c.label} ${c.title}`}
        confirmLabel="Smazat"
        danger
        onConfirm={() => del.mutateAsync({ id }).then(() => undefined)}
      >
        Změna i její řádky se odstraní. Schválenou změnu smazat nejde.
      </ConfirmDialog>
    </div>
  );
}

/* ---------- záložka ---------- */

function ChangesTab({ id }: { id: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("change");
      if (p) setSelected(p);
    } catch {
      /* adresa bez parametrů */
    }
  }, []);
  return selected ? (
    <ChangeEditor id={selected} jobId={id} onBack={() => setSelected(null)} />
  ) : (
    <ChangeListView jobId={id} onOpen={setSelected} />
  );
}

export const tabs: RecordTab[] = [
  {
    id: "zmeny",
    label: "Změny",
    permission: "zakazky.economics",
    group: "zmeny",
    order: 10,
    render: ({ id }) => <ChangesTab id={id} />,
  },
];

/* ---------- karta na Přehledu zakázky ---------- */

function ChangesCard({ id }: { id: string }) {
  const { Link } = useNav();
  const q = useCommandQuery<ChangeList>("zakazky.change.list", { jobId: id });
  const d = q.data;
  if (!d?.changes.length) return null;
  const open = d.changes.filter((c) => c.status === "draft" || c.status === "sent");
  return (
    <section className="rounded-lg border border-line p-4" data-testid="overview-changes">
      <h3 className="mb-2 text-sm font-semibold">Změny</h3>
      <p className="flex justify-between gap-3 text-base">
        <span className="text-muted">Schválené</span>
        <Impact minor={d.totals.approvedMinor} className="font-medium" />
      </p>
      <p className="flex justify-between gap-3 text-base">
        <span className="text-muted">Rozpracované a čekající ({open.length})</span>
        <Impact minor={d.totals.pendingMinor + d.totals.draftMinor} />
      </p>
      <Link
        href={`/zakazky/${id}?tab=zmeny`}
        className="mt-2 inline-block text-sm text-accent hover:underline"
      >
        Otevřít změny
      </Link>
    </section>
  );
}

export const overviewCards: RecordOverviewCard[] = [
  {
    id: "changes",
    order: 66,
    permission: "zakazky.economics",
    render: ({ id }) => <ChangesCard id={id} />,
  },
];
