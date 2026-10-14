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
  SegmentedControl,
  Skeleton,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  successToast,
} from "@rebar/ui";
import { Plus, Split, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { COST_CATEGORY_LIST, categoryLabel, sourceLabel } from "./model";
import {
  Err,
  SourceIcon,
  type CostList,
  type CostRow,
  type ItemOption,
  type SectionOption,
} from "./ui-shared";

const sectionOptions = (sections: readonly SectionOption[]) =>
  sections.map((s) => ({ value: s.id, label: s.label }));

type AllocateInput = {
  jobId: string;
  source: string;
  ref: string;
  parts: { sectionId: string; itemId?: string | null; amountMinor?: number | null }[];
};

/** Výběr oddílu přímo v řádku nákladu: jedna volba = spárováno (a hned se přepočítá plán). */
function PairSelect({
  jobId,
  row,
  sections,
  onSplit,
}: {
  jobId: string;
  row: CostRow;
  sections: SectionOption[];
  onSplit: () => void;
}) {
  const allocate = useCommandMutation<AllocateInput>("zakazky.costs.allocate");
  const split = row.allocations.length > 1;
  const single = row.allocations.length === 1 ? row.allocations[0]!.sectionId : null;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {split ? (
        <Button size="sm" variant="secondary" onClick={onSplit} className="min-w-0 flex-1 truncate">
          Rozpad na {row.allocations.length} oddíly
        </Button>
      ) : (
        <div className="min-w-0 flex-1">
          <Combobox
            aria-label={`Oddíl rozpočtu pro náklad ${row.label}`}
            options={sectionOptions(sections)}
            value={single}
            placeholder={sections.length ? "Spárovat s oddílem…" : "Zakázka nemá rozpočet"}
            searchPlaceholder="Najít oddíl…"
            disabled={!sections.length || allocate.isPending}
            clearable
            onChange={(v) =>
              allocate.mutate({
                jobId,
                source: row.allocSource,
                ref: row.ref,
                parts: v ? [{ sectionId: v as string }] : [],
              })
            }
          />
        </div>
      )}
      <IconButton
        label="Rozdělit náklad na víc oddílů"
        variant="ghost"
        size="sm"
        disabled={!sections.length}
        onClick={onSplit}
      >
        <Split />
      </IconButton>
      <Err error={allocate.error} />
    </div>
  );
}

type Part = { sectionId: string | null; itemId: string | null; amount: number | null };

/** Rozpad nákladu na víc oddílů (a případně položek); součet částí musí sedět na částku nákladu. */
function SplitDialog({
  jobId,
  row,
  sections,
  items,
  onClose,
}: {
  jobId: string;
  row: CostRow;
  sections: SectionOption[];
  items: ItemOption[];
  onClose: () => void;
}) {
  const [parts, setParts] = useState<Part[]>(() =>
    row.allocations.length
      ? row.allocations.map((a) => ({
          sectionId: a.sectionId,
          itemId: a.itemId,
          amount: a.amountMinor ?? row.amountMinor,
        }))
      : [
          { sectionId: null, itemId: null, amount: null },
          { sectionId: null, itemId: null, amount: null },
        ],
  );
  const allocate = useCommandMutation<AllocateInput>("zakazky.costs.allocate", {
    onSuccess: () => {
      successToast("Náklad je rozdělený.");
      onClose();
    },
  });
  const sum = parts.reduce((a, p) => a + (p.amount ?? 0), 0);
  const diff = row.amountMinor - sum;
  const ready = parts.every((p) => p.sectionId && p.amount) && diff === 0;
  const patch = (i: number, p: Partial<Part>) =>
    setParts((cur) => cur.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Rozdělit náklad na oddíly"
        description={`${row.label} · ${formatMinor(row.amountMinor)}`}
        className="w-[min(40rem,calc(100vw-2rem))]"
      >
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            allocate.mutate({
              jobId,
              source: row.allocSource,
              ref: row.ref,
              parts: parts.map((p) => ({
                sectionId: p.sectionId!,
                itemId: p.itemId,
                amountMinor: p.amount,
              })),
            });
          }}
        >
          {parts.map((p, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
              <Combobox
                aria-label={`Oddíl části ${i + 1}`}
                options={sectionOptions(sections)}
                value={p.sectionId}
                placeholder="Oddíl rozpočtu…"
                onChange={(v) => patch(i, { sectionId: v as string | null, itemId: null })}
              />
              <MoneyInput
                aria-label={`Částka části ${i + 1}`}
                value={p.amount}
                onChange={(v) => patch(i, { amount: v })}
                placeholder="Částka"
              />
              <IconButton
                label={`Odebrat část ${i + 1}`}
                variant="ghost"
                disabled={parts.length <= 2}
                onClick={() => setParts((cur) => cur.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </IconButton>
              {p.sectionId && items.some((it) => it.sectionId === p.sectionId) && (
                <div className="sm:col-span-3">
                  <Combobox
                    aria-label={`Položka části ${i + 1}`}
                    options={items
                      .filter((it) => it.sectionId === p.sectionId)
                      .map((it) => ({ value: it.id, label: it.label }))}
                    value={p.itemId}
                    clearable
                    placeholder="Položka (nepovinné)"
                    onChange={(v) => patch(i, { itemId: v as string | null })}
                  />
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setParts((cur) => [...cur, { sectionId: null, itemId: null, amount: null }])
              }
            >
              <Plus /> Přidat část
            </Button>
            <span className={`tabular text-sm ${diff === 0 ? "text-success" : "text-danger"}`}>
              {diff === 0 ? "Součet sedí" : `Zbývá rozdělit ${formatMinor(diff)}`}
            </span>
          </div>
          <Err error={allocate.error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={allocate.isPending} disabled={!ready}>
              Uložit rozpad
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type OrderOpt = { id: string; number: string; title: string };

/** Ruční náklad: nový, nebo úprava. Automatické náklady (docházka, sklad, stroje, faktury) se zde nezadávají. */
function CostDialog({
  jobId,
  row,
  sections,
  prefill,
  onClose,
}: {
  jobId: string;
  row: CostRow | null;
  sections: SectionOption[];
  prefill?: { orderId?: string; title?: string; sectionId?: string | null; supplierId?: string };
  onClose: () => void;
}) {
  const api = useEntityApi();
  const orders = useCommandQuery<{ orders: OrderOpt[] }>("zakazky.orders.list", { jobId });
  const [f, setF] = useState(() => ({
    date: row?.date ?? null,
    category: row?.category ?? "material",
    title: row?.label ?? prefill?.title ?? "",
    supplierId: prefill?.supplierId ?? (null as string | null),
    supplierName: row?.supplier ?? "",
    amount: row?.amountMinor ?? (null as number | null),
    sectionId:
      row?.allocations.length === 1 ? row.allocations[0]!.sectionId : (prefill?.sectionId ?? null),
    orderId: row?.orderId ?? prefill?.orderId ?? (null as string | null),
  }));
  const save = useCommandMutation<Record<string, unknown>>("zakazky.costs.save", {
    onSuccess: () => {
      successToast(row ? "Náklad upraven." : "Náklad přidán.");
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={row ? "Upravit náklad" : "Přidat náklad"} description="Částka bez DPH.">
        <form
          className="px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              jobId,
              ...(row?.id ? { id: row.id } : {}),
              date: f.date,
              category: f.category,
              title: f.title,
              supplierId: f.supplierId,
              supplierName: f.supplierId ? null : f.supplierName || null,
              amountMinor: f.amount ?? 0,
              sectionId: f.sectionId,
              orderId: f.orderId,
            });
          }}
        >
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Datum">
              <DatePicker value={f.date} onChange={(v) => setF((s) => ({ ...s, date: v }))} />
            </Field>
            <Field label="Kategorie">
              <Combobox
                aria-label="Kategorie nákladu"
                options={COST_CATEGORY_LIST.map((c) => ({ value: c.key, label: c.label }))}
                value={f.category}
                onChange={(v) => v && setF((s) => ({ ...s, category: v as string }))}
              />
            </Field>
          </div>
          <Field label="Za co náklad je">
            <Input
              autoFocus
              value={f.title}
              onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))}
            />
          </Field>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Dodavatel z kontaktů">
              <Combobox
                aria-label="Dodavatel z kontaktů"
                load={(q) => api.lookups.records("company", q)}
                value={f.supplierId}
                selectedLabels={
                  f.supplierId && row?.supplier ? { [f.supplierId]: row.supplier } : {}
                }
                clearable
                placeholder="Vybrat firmu…"
                onChange={(v) => setF((s) => ({ ...s, supplierId: v as string | null }))}
              />
            </Field>
            <Field label="nebo dodavatel textem">
              <Input
                value={f.supplierName}
                disabled={!!f.supplierId}
                onChange={(e) => setF((s) => ({ ...s, supplierName: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Částka bez DPH">
              <MoneyInput
                aria-label="Částka nákladu bez DPH"
                value={f.amount}
                onChange={(v) => setF((s) => ({ ...s, amount: v }))}
              />
            </Field>
            <Field label="Oddíl rozpočtu">
              <Combobox
                aria-label="Oddíl rozpočtu"
                options={sectionOptions(sections)}
                value={f.sectionId}
                clearable
                placeholder="Spárovat později"
                onChange={(v) => setF((s) => ({ ...s, sectionId: v as string | null }))}
              />
            </Field>
          </div>
          <Field label="Objednávka" hint="Náklad pak snižuje otevřený závazek objednávky.">
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
          <Err error={save.error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={f.title.trim().length < 2 || !f.date || !f.amount}
            >
              {row ? "Uložit" : "Přidat náklad"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { CostDialog };

const STATUS_OPTIONS = [
  { value: "all", label: "Vše" },
  { value: "unpaired", label: "Nespárované" },
  { value: "paired", label: "Spárované" },
] as const;

/** Záložka Náklady: jeden seznam všech nákladů zakázky s párováním na oddíl přímo v řádku. */
export function CostsTab({ id }: { id: string }) {
  const [q, setQ] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | "unpaired" | "paired">("all");
  const input = useMemo(
    () => ({
      jobId: id,
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(source ? { source } : {}),
      ...(category ? { category } : {}),
      ...(status !== "all" ? { status } : {}),
    }),
    [id, q, source, category, status],
  );
  const list = useCommandQuery<CostList>("zakazky.costs.list", input);
  const auto = useCommandMutation<{ jobId: string }, { allocated: number; left: number }>(
    "zakazky.costs.autoAllocate",
    {
      onSuccess: (r) =>
        successToast(
          r.allocated
            ? `Spárováno ${r.allocated} nákladů${r.left ? `, ${r.left} zůstává k ručnímu spárování` : ""}.`
            : "Nic nešlo spárovat jednoznačně. Nastavte oddílům kategorii nákladů, nebo spárujte ručně.",
        ),
    },
  );
  const del = useCommandMutation<{ jobId: string; id: string }>("zakazky.costs.delete");
  const [edit, setEdit] = useState<CostRow | "new" | null>(null);
  // „Zapsat náklad“ z objednávky přijde s `?orderId=…&title=…`: otevře předvyplněný formulář (jednou)
  const [prefill, setPrefill] = useState<{ orderId: string; title?: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const orderId = p.get("orderId");
    if (!orderId) return;
    const title = p.get("title") ?? undefined;
    setPrefill({ orderId, ...(title ? { title } : {}) });
    setEdit("new");
    p.delete("orderId");
    p.delete("title");
    const qs = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);
  const [split, setSplit] = useState<CostRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<CostRow | null>(null);
  const d = list.data;
  const sectionLabel = (sid: string) => d?.sections.find((s) => s.id === sid)?.label ?? "";

  return (
    <div className="space-y-4" data-testid="costs-tab">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Hledat v nákladech"
          placeholder="Hledat…"
          className="w-48"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="w-40">
          <Combobox
            aria-label="Zdroj nákladu"
            options={["manual", "faktura_prijata", "dochazka", "sklad", "stroje", "diary"].map(
              (s) => ({
                value: s,
                label: sourceLabel(s),
              }),
            )}
            value={source}
            clearable
            placeholder="Všechny zdroje"
            onChange={(v) => setSource(v as string | null)}
          />
        </div>
        <div className="w-40">
          <Combobox
            aria-label="Kategorie nákladu"
            options={COST_CATEGORY_LIST.map((c) => ({ value: c.key, label: c.label }))}
            value={category}
            clearable
            placeholder="Všechny kategorie"
            onChange={(v) => setCategory(v as string | null)}
          />
        </div>
        <SegmentedControl
          label="Stav párování"
          options={STATUS_OPTIONS.map((o) => ({ ...o }))}
          value={status}
          onChange={setStatus}
        />
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            loading={auto.isPending}
            disabled={!d?.hasBudget}
            onClick={() => auto.mutate({ jobId: id })}
          >
            <Wand2 /> Spárovat automaticky
          </Button>
          <Button variant="primary" onClick={() => setEdit("new")}>
            <Plus /> Přidat náklad
          </Button>
        </div>
      </div>
      <Err error={auto.error ?? del.error} />

      {list.isLoading || !d ? (
        <Skeleton className="h-32" />
      ) : !d.rows.length ? (
        <EmptyState
          title={
            status === "all" && !q && !source && !category
              ? "Zatím žádné náklady"
              : "Nic nenalezeno"
          }
          description="Práce z docházky, materiál ze skladu, stroje a schválené přijaté faktury se objeví samy. Ostatní přidejte ručně."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[60rem] text-left">
            <thead className="bg-subtle text-sm text-muted">
              <tr className="h-9">
                <th className="px-3 font-medium">Zdroj</th>
                <th className="px-3 font-medium">Datum</th>
                <th className="px-3 font-medium">Popis</th>
                <th className="px-3 font-medium">Kategorie</th>
                <th className="px-3 text-right font-medium">Částka</th>
                <th className="w-80 px-3 font-medium">Oddíl rozpočtu</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.rows.map((r) => (
                <tr key={r.key} className="h-9" data-status={r.status}>
                  <td className="px-3">
                    <span
                      className="inline-flex items-center gap-1.5 text-muted"
                      title={sourceLabel(r.source)}
                    >
                      <SourceIcon source={r.source} />
                      <span className="hidden lg:inline">{sourceLabel(r.source)}</span>
                    </span>
                  </td>
                  <td className="tabular px-3 text-muted">{r.date ? formatDate(r.date) : "–"}</td>
                  <td className="px-3">
                    {r.href ? (
                      <a className="hover:underline" href={r.href}>
                        {r.label}
                      </a>
                    ) : (
                      r.label
                    )}
                    {r.supplier && <span className="text-muted"> · {r.supplier}</span>}
                  </td>
                  <td className="px-3">
                    <Chip>{categoryLabel(r.category)}</Chip>
                  </td>
                  <td
                    className={`tabular px-3 text-right ${r.amountMinor < 0 ? "text-success" : "font-medium"}`}
                  >
                    {formatMinor(r.amountMinor)}
                  </td>
                  <td className="px-3 py-1">
                    <PairSelect
                      jobId={id}
                      row={r}
                      sections={d.sections}
                      onSplit={() => setSplit(r)}
                    />
                    {r.status === "partial" && (
                      <p className="mt-0.5 text-xs text-warning">
                        Nespárováno {formatMinor(r.remainingMinor)}
                      </p>
                    )}
                    {r.allocations.length > 1 && (
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {r.allocations.map((a) => sectionLabel(a.sectionId)).join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="px-2">
                    {r.editable && (
                      <div className="flex gap-0.5">
                        <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>
                          Upravit
                        </Button>
                        <IconButton
                          label={`Smazat náklad ${r.label}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDel(r)}
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-subtle text-sm">
              <tr className="h-9">
                <td colSpan={4} className="px-3 text-right text-muted">
                  Celkem ({d.rows.length})
                  {d.unpairedCount > 0 && ` · nespárováno ${d.unpairedCount}`}
                </td>
                <td className="tabular px-3 text-right font-semibold">
                  {formatMinor(d.totalMinor)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {edit && d && (
        <CostDialog
          jobId={id}
          row={edit === "new" ? null : edit}
          sections={d.sections}
          {...(edit === "new" && prefill ? { prefill } : {})}
          onClose={() => {
            setEdit(null);
            setPrefill(null);
          }}
        />
      )}
      {split && d && (
        <SplitDialog
          jobId={id}
          row={split}
          sections={d.sections}
          items={d.items}
          onClose={() => setSplit(null)}
        />
      )}
      {confirmDel && (
        <Dialog open onOpenChange={(o) => !o && setConfirmDel(null)}>
          <DialogContent title="Smazat náklad?" description={confirmDel.label}>
            <div className="flex justify-end gap-2 px-5 py-4">
              <Button variant="ghost" onClick={() => setConfirmDel(null)}>
                Zrušit
              </Button>
              <Button
                variant="danger"
                loading={del.isPending}
                onClick={() =>
                  del.mutate(
                    { jobId: id, id: confirmDel.id! },
                    { onSuccess: () => setConfirmDel(null) },
                  )
                }
              >
                Smazat
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/**
 * Nespárované náklady zakázky s rychlým párováním (karta na Přehledu a nahoře v Přehledu nákladů).
 * Bez nespárovaných nákladů se nezobrazí.
 */
export function UnpairedCostsCard({ jobId, onOpenAll }: { jobId: string; onOpenAll?: () => void }) {
  const list = useCommandQuery<CostList>("zakazky.costs.list", { jobId, status: "unpaired" });
  const auto = useCommandMutation<{ jobId: string }, { allocated: number; left: number }>(
    "zakazky.costs.autoAllocate",
  );
  const [split, setSplit] = useState<CostRow | null>(null);
  const d = list.data;
  if (list.isLoading) return <Skeleton className="h-20" />;
  if (!d || !d.rows.length) return null;
  const shown = d.rows.slice(0, 5);
  return (
    <section
      aria-label="Nespárované náklady"
      className="rounded-lg border border-warning bg-warning-soft p-4"
      data-testid="unpaired-costs"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">
          Nespárované náklady: {d.rows.length} ({formatMinor(d.unpairedMinor)})
        </h3>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={auto.isPending}
            disabled={!d.hasBudget}
            onClick={() => auto.mutate({ jobId })}
          >
            <Wand2 /> Spárovat automaticky
          </Button>
          {onOpenAll && d.rows.length > shown.length && (
            <Button size="sm" variant="ghost" onClick={onOpenAll}>
              Zobrazit všechny
            </Button>
          )}
        </div>
      </div>
      <p className="mb-2 text-sm text-muted">
        Bez přiřazení k oddílu rozpočtu nejde spočítat plán vs skutečnost.
      </p>
      <ul className="divide-y divide-line">
        {shown.map((r) => (
          <li key={r.key} className="grid items-center gap-2 py-1.5 sm:grid-cols-[1fr_8rem_16rem]">
            <span className="flex min-w-0 items-center gap-1.5">
              <SourceIcon source={r.source} className="text-muted" />
              <span className="truncate">{r.label}</span>
            </span>
            <span className="tabular text-right text-sm">{formatMinor(r.remainingMinor)}</span>
            <PairSelect jobId={jobId} row={r} sections={d.sections} onSplit={() => setSplit(r)} />
          </li>
        ))}
      </ul>
      {split && (
        <SplitDialog
          jobId={jobId}
          row={split}
          sections={d.sections}
          items={d.items}
          onClose={() => setSplit(null)}
        />
      )}
      <Err error={auto.error} />
    </section>
  );
}
