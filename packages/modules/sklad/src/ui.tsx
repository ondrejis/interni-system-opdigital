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
  cn,
  defineModuleUi,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useModuleUi,
  useNav,
  type RecordAction,
  type RecordTab,
} from "@rebar/ui";
import { Package, Plus, Trash2 } from "lucide-react";
import { IssueTerminalWidget } from "./terminal-ui";
import { useState, type ReactNode } from "react";
import {
  DOC_PERMISSION,
  DOC_TYPE_INFO,
  ORDER_STATUSES,
  formatQty,
  toMilli,
  type StockDocType,
} from "./stock-math";

/* ---------- společné ---------- */

type Warehouse = { id: string; name: string; kind: string };
type OptionItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  totalQty: string;
  minQty: string;
  avgCostMinor: number;
  lastPriceMinor: number | null;
  supplierId: string | null;
  levels: { warehouseId: string; qty: string }[];
};
type Options = { warehouses: Warehouse[]; items: OptionItem[] };

const useOptions = () => useCommandQuery<Options>("sklad.options", {});

function Err({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error.message}
    </p>
  ) : null;
}

const th = "px-3 py-2 font-medium";
const num = "tabular text-right";

/** Nákupní ceny a hodnotu zásob vidí správce skladu a držitel ekonomiky zakázek (server je jinak nevrací). */
function useSeePrices() {
  const can = useCan();
  return can(["sklad.write", "zakazky.economics"]);
}

function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[32rem] text-left">
        <thead className="bg-subtle text-sm text-muted">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

function TabBody({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

const typeColor = (t: string) => DOC_TYPE_INFO[t as StockDocType]?.color ?? "gray";
const typeLabel = (t: string) => DOC_TYPE_INFO[t as StockDocType]?.short ?? t;

/** Množství s jednotkou a znaménkem pohybu (výdej záporně). */
function signed(type: string, qty: string): string {
  const q = toMilli(qty);
  if (type === "issue") return `−${formatQty(qty)}`;
  if (type === "transfer") return formatQty(qty);
  return q > 0 && type !== "adjustment"
    ? `+${formatQty(qty)}`
    : q > 0
      ? `+${formatQty(qty)}`
      : formatQty(qty);
}

/* ---------- řádky dokladu / objednávky ---------- */

type Row = { itemId: string | null; qty: string; price: number | null };
const emptyRow = (): Row => ({ itemId: null, qty: "", price: null });

function LineRows({
  rows,
  onChange,
  items,
  warehouseId,
  showPrice,
  checkAvailability,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  items: OptionItem[];
  warehouseId?: string | null;
  showPrice?: boolean;
  checkAvailability?: boolean;
}) {
  const set = (i: number, patch: Partial<Row>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const at = (it: OptionItem) =>
    warehouseId ? (it.levels.find((l) => l.warehouseId === warehouseId)?.qty ?? "0") : it.totalQty;
  return (
    <div className="space-y-2" data-testid="stock-lines">
      {rows.map((r, i) => {
        const it = items.find((x) => x.id === r.itemId);
        const available = it ? at(it) : null;
        const over = !!(checkAvailability && it && toMilli(r.qty || 0) > toMilli(available ?? 0));
        return (
          <div
            key={i}
            className="grid grid-cols-[1fr_6.5rem_auto] items-start gap-2 sm:grid-cols-[1fr_6.5rem_8rem_auto]"
          >
            <div className="min-w-0">
              <Combobox
                options={items.map((x) => ({
                  value: x.id,
                  label: `${x.code} · ${x.name}`,
                  hint: `${formatQty(at(x))} ${x.unit}`,
                }))}
                value={r.itemId}
                onChange={(v) => {
                  const picked = items.find((x) => x.id === v);
                  set(i, {
                    itemId: v as string | null,
                    price: showPrice ? (picked?.lastPriceMinor ?? null) : null,
                  });
                }}
                aria-label={`Položka ${i + 1}`}
                placeholder="Položka…"
                searchPlaceholder="Kód nebo název"
              />
              {it && (
                <p className={cn("mt-1 text-sm", over ? "text-danger" : "text-muted")}>
                  {checkAvailability ? "K dispozici" : "Skladem"} {formatQty(available ?? 0)}{" "}
                  {it.unit}
                </p>
              )}
            </div>
            <div>
              <Input
                aria-label={`Množství ${i + 1}`}
                inputMode="decimal"
                placeholder={it ? it.unit : "Množství"}
                className={cn("text-right", over && "border-danger")}
                value={r.qty}
                onChange={(e) => set(i, { qty: e.target.value.replace(/[^\d.,]/g, "") })}
              />
            </div>
            {showPrice && (
              <div className="hidden sm:block">
                <MoneyInput
                  key={`${i}-${r.itemId ?? ""}`}
                  aria-label={`Cena za jednotku ${i + 1}`}
                  value={r.price}
                  onChange={(price) => set(i, { price })}
                  placeholder="Cena / j."
                />
              </div>
            )}
            <IconButton
              label={`Odebrat řádek ${i + 1}`}
              onClick={() =>
                onChange(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : [emptyRow()])
              }
            >
              <Trash2 />
            </IconButton>
          </div>
        );
      })}
      <Button type="button" variant="ghost" onClick={() => onChange([...rows, emptyRow()])}>
        <Plus /> Přidat položku
      </Button>
    </div>
  );
}

const cleanLines = (rows: Row[], withPrice: boolean) =>
  rows
    .filter((r) => r.itemId && toMilli(r.qty || 0) !== 0)
    .map((r) => ({
      itemId: r.itemId!,
      qty: r.qty.replace(",", "."),
      ...(withPrice && r.price !== null ? { unitPriceMinor: r.price } : {}),
    }));

function NoWarehouse() {
  const { Link } = useNav();
  return (
    <p role="status" className="rounded-lg border border-line bg-subtle p-3">
      Nejdřív založte umístění zásob (sklad, dílna, vozidlo).{" "}
      <Link href="/sklad/umisteni" className="text-accent hover:underline">
        Přidat umístění
      </Link>
    </p>
  );
}

/* ---------- doklad (příjem, výdej, převod, vratka) ---------- */

export function DocForm({
  type,
  jobId: fixedJob,
  onDone,
}: {
  type: Exclude<StockDocType, "adjustment">;
  jobId?: string | null;
  onDone: () => void;
}) {
  const api = useEntityApi();
  const opts = useOptions();
  const [date, setDate] = useState<string | null>(todayIso());
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(fixedJob ?? null);
  const [docNo, setDocNo] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [formError, setFormError] = useState<Error | null>(null);
  const info = DOC_TYPE_INFO[type];
  const wh = opts.data?.warehouses ?? [];
  const source = warehouseId ?? wh.find((w) => w.kind === "warehouse")?.id ?? wh[0]?.id ?? null;
  const post = useCommandMutation<
    Record<string, unknown>,
    { number: string; totalMinor: number | null }
  >("sklad.post", {
    onSuccess: (r) => {
      successToast(
        `Zaúčtováno: ${r.number}${r.totalMinor === null ? "" : ` · ${formatMinor(r.totalMinor)}`}`,
      );
      onDone();
    },
  });
  if (opts.isLoading || !opts.data) return <Skeleton className="m-5 h-48" />;
  const outgoing = type === "issue" || type === "transfer";
  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!source) return setFormError(new Error("Vyberte umístění."));
        setFormError(null);
        post.mutate({
          type,
          date,
          warehouseId: source,
          ...(type === "transfer" ? { targetWarehouseId: targetId } : {}),
          ...(type === "receipt" ? { supplierId, supplierDocNo: docNo || null } : {}),
          ...(type === "issue" || type === "return" ? { jobId } : {}),
          note: note || null,
          lines: cleanLines(rows, type === "receipt"),
        });
      }}
    >
      <p className="text-muted">{info.hint}</p>
      {wh.length === 0 && <NoWarehouse />}
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Datum">
          <DatePicker value={date} onChange={setDate} clearable={false} />
        </Field>
        <Field
          label={type === "transfer" ? "Z umístění" : type === "receipt" ? "Příjem na" : "Umístění"}
        >
          <Combobox
            options={wh.map((w) => ({ value: w.id, label: w.name }))}
            value={source}
            onChange={(v) => setWarehouseId(v as string | null)}
            aria-label="Umístění"
            placeholder="Vyberte umístění"
          />
        </Field>
        {type === "transfer" && (
          <Field label="Na umístění">
            <Combobox
              options={wh
                .filter((w) => w.id !== source)
                .map((w) => ({ value: w.id, label: w.name }))}
              value={targetId}
              onChange={(v) => setTargetId(v as string | null)}
              aria-label="Cílové umístění"
              placeholder="Vyberte cíl"
            />
          </Field>
        )}
        {type === "receipt" && (
          <>
            <Field label="Dodavatel">
              <Combobox
                load={(s) => api.lookups.records("company", s)}
                value={supplierId}
                onChange={(v) => setSupplierId(v as string | null)}
                aria-label="Dodavatel"
                placeholder="Vyberte dodavatele"
                clearable
              />
            </Field>
            <Field label="Doklad dodavatele" hint="Číslo dodacího listu nebo faktury.">
              <Input value={docNo} onChange={(e) => setDocNo(e.target.value)} />
            </Field>
          </>
        )}
        {(type === "issue" || type === "return") && !fixedJob && (
          <Field label="Zakázka">
            <Combobox
              load={(s) => api.lookups.records("job", s)}
              value={jobId}
              onChange={(v) => setJobId(v as string | null)}
              aria-label="Zakázka"
              placeholder="Vyberte zakázku"
              clearable
            />
          </Field>
        )}
      </div>
      <LineRows
        rows={rows}
        onChange={setRows}
        items={opts.data.items}
        warehouseId={source}
        showPrice={type === "receipt"}
        checkAvailability={outgoing}
      />
      <Field label="Poznámka" htmlFor="doc-note">
        <Textarea
          id="doc-note"
          className="min-h-14"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Err error={formError ?? post.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Zrušit
        </Button>
        <Button type="submit" variant="primary" loading={post.isPending}>
          Zaúčtovat {info.label.toLowerCase()}
        </Button>
      </div>
    </form>
  );
}

function DocDialog({
  type,
  onClose,
}: {
  type: Exclude<StockDocType, "adjustment"> | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      {type && (
        <DialogContent
          title={DOC_TYPE_INFO[type].label}
          className="w-[min(52rem,calc(100vw-2rem))]"
        >
          <DocForm type={type} onDone={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}

/* ---------- objednávka ---------- */

function OrderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useEntityApi();
  const { push } = useNav();
  const opts = useOptions();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [expected, setExpected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const create = useCommandMutation<Record<string, unknown>, { id: string; number: string }>(
    "sklad.order.create",
    {
      onSuccess: (r) => {
        successToast(`Objednávka ${r.number} vytvořena.`);
        onClose();
        push(`/sklad/objednavky/${r.id}`);
      },
    },
  );
  const wh = opts.data?.warehouses ?? [];
  const target = warehouseId ?? wh.find((w) => w.kind === "warehouse")?.id ?? wh[0]?.id ?? null;
  const submit = (send: boolean) =>
    create.mutate({
      supplierId,
      warehouseId: target,
      expectedDate: expected,
      note: note || null,
      send,
      lines: cleanLines(rows, true),
    });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Nová objednávka" className="w-[min(52rem,calc(100vw-2rem))]">
        {!opts.data ? (
          <Skeleton className="m-5 h-48" />
        ) : (
          <form
            className="space-y-3 px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit(true);
            }}
          >
            {wh.length === 0 && <NoWarehouse />}
            <div className="grid gap-x-3 sm:grid-cols-3">
              <Field label="Dodavatel">
                <Combobox
                  load={(s) => api.lookups.records("company", s)}
                  value={supplierId}
                  onChange={(v) => setSupplierId(v as string | null)}
                  aria-label="Dodavatel"
                  placeholder="Vyberte dodavatele"
                />
              </Field>
              <Field label="Příjem do">
                <Combobox
                  options={wh.map((w) => ({ value: w.id, label: w.name }))}
                  value={target}
                  onChange={(v) => setWarehouseId(v as string | null)}
                  aria-label="Příjem do"
                />
              </Field>
              <Field label="Očekávaná dodávka">
                <DatePicker value={expected} onChange={setExpected} />
              </Field>
            </div>
            <LineRows rows={rows} onChange={setRows} items={opts.data.items} showPrice />
            <Field label="Poznámka" htmlFor="po-note">
              <Textarea
                id="po-note"
                className="min-h-14"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <Err error={create.error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Zrušit
              </Button>
              <Button
                type="button"
                variant="secondary"
                loading={create.isPending}
                onClick={() => submit(false)}
              >
                Uložit koncept
              </Button>
              <Button type="submit" variant="primary" loading={create.isPending}>
                Vytvořit a odeslat
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- inventura: založení ---------- */

function CountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const opts = useOptions();
  const { push } = useNav();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const start = useCommandMutation<{ warehouseId: string }, { id: string; created: boolean }>(
    "sklad.count.start",
    {
      onSuccess: (r) => {
        successToast(r.created ? "Inventura založena." : "Na tomto umístění už inventura probíhá.");
        onClose();
        push(`/sklad/inventury/${r.id}`);
      },
    },
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Nová inventura"
        description="Zapíšete napočítané množství, rozdíly se zaúčtují při uzavření."
      >
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (warehouseId) start.mutate({ warehouseId });
          }}
        >
          <Field label="Umístění">
            <Combobox
              options={(opts.data?.warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))}
              value={warehouseId}
              onChange={(v) => setWarehouseId(v as string | null)}
              aria-label="Umístění"
              placeholder="Vyberte umístění"
            />
          </Field>
          <Err error={start.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={start.isPending}
              disabled={!warehouseId}
            >
              Založit inventuru
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- přehled zásob ---------- */

type OverviewRow = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  totalQty: string;
  minQty: string;
  belowMin: boolean;
  avgCostMinor: number;
  valueMinor: number;
  supplierName: string | null;
  levels: { warehouseId: string; qty: string }[];
};
type Overview = {
  rows: OverviewRow[];
  truncated: boolean;
  summary: { items: number; valueMinor: number; low: number };
  categories: string[];
};

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={cn("tabular text-2xl font-semibold", tone === "warning" && "text-warning")}>
        {value}
      </div>
    </div>
  );
}

function OverviewPage({ query }: { query: Record<string, string> }) {
  const { Link } = useNav();
  const can = useCan();
  const seePrices = useSeePrices();
  const hasJobs = useModuleUi().has("zakazky");
  const opts = useOptions();
  const [q, setQ] = useState(query.q ?? "");
  const [category, setCategory] = useState<string | null>(query.category ?? null);
  const [warehouseId, setWarehouseId] = useState<string | null>(query.warehouse ?? null);
  const [low, setLow] = useState(query.low === "1");
  const [doc, setDoc] = useState<Exclude<StockDocType, "adjustment"> | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const data = useCommandQuery<Overview>("sklad.overview", {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(category ? { category } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(low ? { lowOnly: true } : {}),
  });
  const wh = opts.data?.warehouses ?? [];
  const whName = (id: string) => wh.find((w) => w.id === id)?.name ?? "—";
  const actions: { type: Exclude<StockDocType, "adjustment">; jobs?: boolean }[] = [
    { type: "receipt" },
    { type: "issue", jobs: true },
    { type: "transfer" },
    { type: "return", jobs: true },
  ];
  return (
    <div
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
      data-testid="stock-overview"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {actions
            .filter((a) => can(DOC_PERMISSION[a.type]) && (!a.jobs || hasJobs))
            .map((a) => (
              <Button
                key={a.type}
                variant={a.type === "receipt" || a.type === "issue" ? "primary" : "secondary"}
                onClick={() => setDoc(a.type)}
              >
                {DOC_TYPE_INFO[a.type].short}
              </Button>
            ))}
          {can("sklad.write") && (
            <Button variant="secondary" onClick={() => setOrderOpen(true)}>
              Objednávka
            </Button>
          )}
          {can("sklad.inventory") && (
            <Button variant="secondary" onClick={() => setCountOpen(true)}>
              Inventura
            </Button>
          )}
        </div>

        <div className={cn("grid gap-3", seePrices ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {seePrices && (
            <Kpi label="Hodnota zásob" value={formatMinor(data.data?.summary.valueMinor ?? 0)} />
          )}
          <Kpi label="Aktivních položek" value={String(data.data?.summary.items ?? 0)} />
          <Kpi
            label="Pod minimem"
            value={String(data.data?.summary.low ?? 0)}
            {...(data.data?.summary.low ? { tone: "warning" as const } : {})}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Hledat položku"
            className="w-full sm:w-56"
            placeholder="Hledat kód, název, EAN…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="w-full sm:w-48">
            <Combobox
              options={(data.data?.categories ?? []).map((c) => ({ value: c, label: c }))}
              value={category}
              onChange={(v) => setCategory(v as string | null)}
              placeholder="Všechny kategorie"
              clearable
            />
          </div>
          <div className="w-full sm:w-48">
            <Combobox
              options={wh.map((w) => ({ value: w.id, label: w.name }))}
              value={warehouseId}
              onChange={(v) => setWarehouseId(v as string | null)}
              placeholder="Všechna umístění"
              clearable
            />
          </div>
          <Button
            variant={low ? "primary" : "secondary"}
            aria-pressed={low}
            onClick={() => setLow(!low)}
          >
            Jen pod minimem
          </Button>
        </div>

        {data.isLoading ? (
          <Skeleton className="h-64" />
        ) : data.data && data.data.rows.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title="Žádné položky"
            description="Založte skladové karty a zaúčtujte první příjem."
            action={
              can("sklad.write") ? (
                <Link href="/sklad/karty" className="text-accent hover:underline">
                  Skladové karty
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Table
            head={
              <>
                <th className={th}>Kód</th>
                <th className={th}>Název</th>
                <th className={cn(th, "text-right")}>Skladem</th>
                <th className={cn(th, "text-right")}>Minimum</th>
                <th className={th}>Po umístěních</th>
                {seePrices && <th className={cn(th, "text-right")}>Průměrná cena</th>}
                {seePrices && <th className={cn(th, "text-right")}>Hodnota</th>}
              </>
            }
          >
            {(data.data?.rows ?? []).map((r) => (
              <tr key={r.id} className="hover:bg-hover" data-testid="stock-row">
                <td className="px-3 py-2 text-muted">{r.code}</td>
                <td className="px-3 py-2">
                  <Link href={`/sklad/karty/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  {r.category && <div className="text-sm text-muted">{r.category}</div>}
                </td>
                <td className={cn("px-3 py-2", num, r.belowMin && "font-semibold text-warning")}>
                  {formatQty(r.totalQty)} {r.unit}
                </td>
                <td className={cn("px-3 py-2 text-muted", num)}>
                  {toMilli(r.minQty) ? `${formatQty(r.minQty)} ${r.unit}` : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.levels.map((l) => (
                      <Chip key={l.warehouseId}>
                        {whName(l.warehouseId)} {formatQty(l.qty)}
                      </Chip>
                    ))}
                  </div>
                </td>
                {seePrices && (
                  <td className={cn("px-3 py-2", num)}>{formatMinor(r.avgCostMinor)}</td>
                )}
                {seePrices && <td className={cn("px-3 py-2", num)}>{formatMinor(r.valueMinor)}</td>}
              </tr>
            ))}
          </Table>
        )}
        {data.data?.truncated && (
          <p className="text-sm text-muted">Zobrazeno prvních 1000 položek, upřesněte hledání.</p>
        )}
      </div>
      <DocDialog type={doc} onClose={() => setDoc(null)} />
      <OrderDialog open={orderOpen} onClose={() => setOrderOpen(false)} />
      <CountDialog open={countOpen} onClose={() => setCountOpen(false)} />
    </div>
  );
}

/* ---------- záložky na detailech ---------- */

type ItemDetail = {
  unit: string;
  totalQty: string;
  minQty: string;
  avgCostMinor: number;
  valueMinor: number;
  levels: { warehouseId: string; name: string; kind: string; qty: string }[];
  moves: {
    docId: string;
    number: string;
    type: string;
    date: string;
    qty: string;
    unitCost: string;
    totalMinor: number;
    warehouse: string;
    target: string | null;
    job: string | null;
    supplier: string | null;
  }[];
};

function ItemTab({ id }: { id: string }) {
  const { Link } = useNav();
  const q = useCommandQuery<ItemDetail>("sklad.itemDetail", { id });
  const seePrices = useSeePrices();
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  const d = q.data;
  return (
    <TabBody>
      <div className={cn("grid gap-3", seePrices ? "grid-cols-3" : "grid-cols-1")}>
        <Kpi label="Skladem" value={`${formatQty(d.totalQty)} ${d.unit}`} />
        {seePrices && <Kpi label="Průměrná cena" value={formatMinor(d.avgCostMinor)} />}
        {seePrices && <Kpi label="Hodnota" value={formatMinor(d.valueMinor)} />}
      </div>
      <section>
        <h3 className="mb-2 font-semibold">Po umístěních</h3>
        {d.levels.length === 0 ? (
          <p className="text-muted">Nikde není na skladě.</p>
        ) : (
          <Table
            head={
              <>
                <th className={th}>Umístění</th>
                <th className={cn(th, "text-right")}>Množství</th>
              </>
            }
          >
            {d.levels.map((l) => (
              <tr key={l.warehouseId}>
                <td className="px-3 py-2">{l.name}</td>
                <td className={cn("px-3 py-2", num)}>
                  {formatQty(l.qty)} {d.unit}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Pohyby (posledních 100)</h3>
        {d.moves.length === 0 ? (
          <p className="text-muted">Zatím žádné pohyby.</p>
        ) : (
          <Table
            head={
              <>
                <th className={th}>Datum</th>
                <th className={th}>Doklad</th>
                <th className={th}>Kde / zakázka</th>
                <th className={cn(th, "text-right")}>Množství</th>
                {seePrices && <th className={cn(th, "text-right")}>Hodnota</th>}
              </>
            }
          >
            {d.moves.map((m, i) => (
              <tr key={`${m.docId}-${i}`}>
                <td className="px-3 py-2">{formatDate(m.date)}</td>
                <td className="px-3 py-2">
                  <Link href={`/sklad/doklady/${m.docId}`} className="hover:underline">
                    {m.number}
                  </Link>{" "}
                  <Chip color={typeColor(m.type)}>{typeLabel(m.type)}</Chip>
                </td>
                <td className="px-3 py-2 text-muted">
                  {m.target ? `${m.warehouse} → ${m.target}` : m.warehouse}
                  {m.job ? ` · ${m.job}` : ""}
                  {m.supplier ? ` · ${m.supplier}` : ""}
                </td>
                <td className={cn("px-3 py-2", num)}>{signed(m.type, m.qty)}</td>
                {seePrices && <td className={cn("px-3 py-2", num)}>{formatMinor(m.totalMinor)}</td>}
              </tr>
            ))}
          </Table>
        )}
      </section>
    </TabBody>
  );
}

function WarehouseTab({ id }: { id: string }) {
  const { Link } = useNav();
  const q = useCommandQuery<
    { itemId: string; code: string; name: string; unit: string; qty: string; valueMinor: number }[]
  >("sklad.warehouseStock", { id });
  const seePrices = useSeePrices();
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  if (!q.data.length) return <p className="text-muted">Na tomto umístění nejsou žádné zásoby.</p>;
  return (
    <TabBody>
      <Table
        head={
          <>
            <th className={th}>Položka</th>
            <th className={cn(th, "text-right")}>Množství</th>
            {seePrices && <th className={cn(th, "text-right")}>Hodnota</th>}
          </>
        }
      >
        {q.data.map((r) => (
          <tr key={r.itemId}>
            <td className="px-3 py-2">
              <Link href={`/sklad/karty/${r.itemId}`} className="hover:underline">
                {r.name}
              </Link>
              <span className="ml-2 text-muted">{r.code}</span>
            </td>
            <td className={cn("px-3 py-2", num)}>
              {formatQty(r.qty)} {r.unit}
            </td>
            {seePrices && <td className={cn("px-3 py-2", num)}>{formatMinor(r.valueMinor)}</td>}
          </tr>
        ))}
      </Table>
    </TabBody>
  );
}

function DocTab({ id }: { id: string }) {
  const { Link } = useNav();
  const q = useCommandQuery<{
    type: string;
    totalMinor: number;
    lines: {
      id: string;
      itemId: string;
      code: string;
      name: string;
      unit: string;
      qty: string;
      unitCost: string;
      totalMinor: number;
    }[];
  }>("sklad.doc", { id });
  const seePrices = useSeePrices();
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  return (
    <TabBody>
      <Table
        head={
          <>
            <th className={th}>Položka</th>
            <th className={cn(th, "text-right")}>Množství</th>
            {seePrices && <th className={cn(th, "text-right")}>Cena / j.</th>}
            {seePrices && <th className={cn(th, "text-right")}>Celkem</th>}
          </>
        }
      >
        {q.data.lines.map((l) => (
          <tr key={l.id}>
            <td className="px-3 py-2">
              <Link href={`/sklad/karty/${l.itemId}`} className="hover:underline">
                {l.name}
              </Link>
              <span className="ml-2 text-muted">{l.code}</span>
            </td>
            <td className={cn("px-3 py-2", num)}>
              {signed(q.data.type, l.qty)} {l.unit}
            </td>
            {seePrices && (
              <td className={cn("px-3 py-2", num)}>
                {formatMinor(Math.round(Number(l.unitCost)))}
              </td>
            )}
            {seePrices && <td className={cn("px-3 py-2", num)}>{formatMinor(l.totalMinor)}</td>}
          </tr>
        ))}
      </Table>
      {seePrices && (
        <p className="text-right font-semibold">Celkem {formatMinor(q.data.totalMinor)}</p>
      )}
    </TabBody>
  );
}

type OrderDetail = {
  status: string;
  warehouseId: string;
  lines: {
    id: string;
    itemId: string;
    code: string;
    name: string;
    unit: string;
    qty: string;
    receivedQty: string;
    unitPriceMinor: number | null;
  }[];
  receipts: {
    id: string;
    number: string;
    date: string;
    totalMinor: number;
    supplierDocNo: string | null;
  }[];
};

function OrderTab({ id }: { id: string }) {
  const { Link } = useNav();
  const q = useCommandQuery<OrderDetail>("sklad.order", { id });
  const seePrices = useSeePrices();
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  const total = q.data.lines.reduce(
    (a, l) => a + Math.round((toMilli(l.qty) * (l.unitPriceMinor ?? 0)) / 1000),
    0,
  );
  return (
    <TabBody>
      <Table
        head={
          <>
            <th className={th}>Položka</th>
            <th className={cn(th, "text-right")}>Objednáno</th>
            <th className={cn(th, "text-right")}>Přijato</th>
            {seePrices && <th className={cn(th, "text-right")}>Cena / j.</th>}
          </>
        }
      >
        {q.data.lines.map((l) => {
          const done = toMilli(l.receivedQty) >= toMilli(l.qty);
          return (
            <tr key={l.id}>
              <td className="px-3 py-2">
                <Link href={`/sklad/karty/${l.itemId}`} className="hover:underline">
                  {l.name}
                </Link>
                <span className="ml-2 text-muted">{l.code}</span>
              </td>
              <td className={cn("px-3 py-2", num)}>
                {formatQty(l.qty)} {l.unit}
              </td>
              <td className={cn("px-3 py-2", num, done && "text-success")}>
                {formatQty(l.receivedQty)} {l.unit}
              </td>
              {seePrices && (
                <td className={cn("px-3 py-2", num)}>
                  {l.unitPriceMinor === null ? "—" : formatMinor(l.unitPriceMinor)}
                </td>
              )}
            </tr>
          );
        })}
      </Table>
      {seePrices && total > 0 && (
        <p className="text-right font-semibold">Objednáno za {formatMinor(total)} bez DPH</p>
      )}
      {q.data.receipts.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Příjemky</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {q.data.receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <Link href={`/sklad/doklady/${r.id}`} className="hover:underline">
                  {r.number}
                </Link>
                <span className="text-muted">
                  {formatDate(r.date)}
                  {r.supplierDocNo ? ` · ${r.supplierDocNo}` : ""}
                </span>
                {seePrices && <span className="tabular">{formatMinor(r.totalMinor)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </TabBody>
  );
}

function ReceiveForm({ id, onDone }: { id: string; onDone: () => void }) {
  const q = useCommandQuery<OrderDetail>("sklad.order", { id });
  const [docNo, setDocNo] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [price, setPrice] = useState<Record<string, number | null>>({});
  const receive = useCommandMutation<Record<string, unknown>, { number: string }>(
    "sklad.order.receive",
    {
      onSuccess: (r) => {
        successToast(`Příjem zaúčtován: ${r.number}`);
        onDone();
      },
    },
  );
  if (q.isLoading || !q.data) return <Skeleton className="m-5 h-40" />;
  const remaining = (l: OrderDetail["lines"][number]) =>
    Math.max(0, toMilli(l.qty) - toMilli(l.receivedQty)) / 1000;
  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        receive.mutate({
          id,
          supplierDocNo: docNo || null,
          lines: q.data!.lines.map((l) => ({
            lineId: l.id,
            qty: (qty[l.id] ?? String(remaining(l))).replace(",", "."),
            ...((price[l.id] ?? l.unitPriceMinor) !== null &&
            (price[l.id] ?? l.unitPriceMinor) !== undefined
              ? { unitPriceMinor: (price[l.id] ?? l.unitPriceMinor)! }
              : {}),
          })),
        });
      }}
    >
      <Field label="Doklad dodavatele" hint="Číslo dodacího listu nebo faktury (nepovinné).">
        <Input value={docNo} onChange={(e) => setDocNo(e.target.value)} />
      </Field>
      <Table
        head={
          <>
            <th className={th}>Položka</th>
            <th className={cn(th, "text-right")}>Zbývá</th>
            <th className={th}>Přijato teď</th>
            <th className={th}>Cena / j.</th>
          </>
        }
      >
        {q.data.lines.map((l) => (
          <tr key={l.id}>
            <td className="px-3 py-2">{l.name}</td>
            <td className={cn("px-3 py-2", num)}>
              {formatQty(remaining(l))} {l.unit}
            </td>
            <td className="px-2 py-1.5">
              <Input
                aria-label={`Přijato ${l.name}`}
                inputMode="decimal"
                className="w-24 text-right"
                value={qty[l.id] ?? String(remaining(l)).replace(".", ",")}
                onChange={(e) => setQty({ ...qty, [l.id]: e.target.value.replace(/[^\d.,]/g, "") })}
              />
            </td>
            <td className="px-2 py-1.5">
              <MoneyInput
                aria-label={`Cena ${l.name}`}
                value={price[l.id] !== undefined ? price[l.id]! : l.unitPriceMinor}
                onChange={(v) => setPrice({ ...price, [l.id]: v })}
                className="w-28"
              />
            </td>
          </tr>
        ))}
      </Table>
      <Err error={receive.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Zrušit
        </Button>
        <Button type="submit" variant="primary" loading={receive.isPending}>
          Zaúčtovat příjem
        </Button>
      </div>
    </form>
  );
}

function ConfirmForm({
  text,
  action,
  loading,
  error,
  onConfirm,
  onClose,
  danger,
}: {
  text: string;
  action: string;
  loading: boolean;
  error: Error | null;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <div className="space-y-4 px-5 py-4">
      <p>{text}</p>
      <Err error={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Zpět
        </Button>
        <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
          {action}
        </Button>
      </div>
    </div>
  );
}

function OrderStatusForm({
  id,
  status,
  text,
  action,
  danger,
  close,
}: {
  id: string;
  status: "sent" | "cancelled";
  text: string;
  action: string;
  danger?: boolean;
  close: () => void;
}) {
  const m = useCommandMutation<{ id: string; status: string }>("sklad.order.setStatus", {
    onSuccess: close,
  });
  return (
    <ConfirmForm
      text={text}
      action={action}
      {...(danger ? { danger } : {})}
      loading={m.isPending}
      error={m.error}
      onConfirm={() => m.mutate({ id, status })}
      onClose={close}
    />
  );
}

type CountDetail = {
  status: string;
  warehouseId: string;
  lines: {
    id: string;
    itemId: string;
    code: string;
    name: string;
    unit: string;
    expectedQty: string;
    countedQty: string | null;
    currentQty: string;
  }[];
};

function CountTab({ id }: { id: string }) {
  const opts = useOptions();
  const q = useCommandQuery<CountDetail>("sklad.count", { id });
  const [local, setLocal] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const save = useCommandMutation<{ lineId: string; counted: string | null }>(
    "sklad.count.saveLine",
    {
      invalidate: [["command", "sklad.count"]],
    },
  );
  const add = useCommandMutation<{ countId: string; itemId: string }>("sklad.count.addLine", {
    onSuccess: () => setAdding(null),
  });
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  const open = q.data.status === "open";
  const have = new Set(q.data.lines.map((l) => l.itemId));
  return (
    <TabBody>
      <Table
        head={
          <>
            <th className={th}>Položka</th>
            <th className={cn(th, "text-right")}>V systému</th>
            <th className={th}>Napočítáno</th>
            <th className={cn(th, "text-right")}>Rozdíl</th>
          </>
        }
      >
        {q.data.lines.map((l) => {
          const counted =
            local[l.id] ??
            (l.countedQty === null ? "" : String(Number(l.countedQty)).replace(".", ","));
          const diff =
            counted.trim() === ""
              ? null
              : (toMilli(counted.replace(",", ".")) - toMilli(l.currentQty)) / 1000;
          return (
            <tr key={l.id} data-testid="count-row">
              <td className="px-3 py-2">
                {l.name} <span className="text-muted">{l.code}</span>
              </td>
              <td className={cn("px-3 py-2", num)}>
                {formatQty(l.currentQty)} {l.unit}
              </td>
              <td className="px-2 py-1.5">
                {open ? (
                  <Input
                    aria-label={`Napočítáno ${l.name}`}
                    inputMode="decimal"
                    className="w-28 text-right"
                    value={counted}
                    onChange={(e) =>
                      setLocal({ ...local, [l.id]: e.target.value.replace(/[^\d.,]/g, "") })
                    }
                    onBlur={() => {
                      if (local[l.id] === undefined) return;
                      save.mutate({
                        lineId: l.id,
                        counted: local[l.id]!.trim() === "" ? null : local[l.id]!.replace(",", "."),
                      });
                    }}
                  />
                ) : (
                  <span className="tabular">{counted === "" ? "—" : `${counted} ${l.unit}`}</span>
                )}
              </td>
              <td
                className={cn(
                  "px-3 py-2",
                  num,
                  diff !== null && diff < 0 && "text-danger",
                  diff !== null && diff > 0 && "text-success",
                )}
              >
                {diff === null
                  ? "—"
                  : diff === 0
                    ? "0"
                    : `${diff > 0 ? "+" : ""}${formatQty(diff)}`}
              </td>
            </tr>
          );
        })}
      </Table>
      <Err error={save.error ?? add.error} />
      {open && (
        <div className="flex max-w-lg items-center gap-2">
          <div className="min-w-0 flex-1">
            <Combobox
              options={(opts.data?.items ?? [])
                .filter((i) => !have.has(i.id))
                .map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` }))}
              value={adding}
              onChange={(v) => setAdding(v as string | null)}
              placeholder="Přidat nalezenou položku…"
            />
          </div>
          <Button
            variant="secondary"
            disabled={!adding}
            loading={add.isPending}
            onClick={() => adding && add.mutate({ countId: id, itemId: adding })}
          >
            Přidat
          </Button>
        </div>
      )}
    </TabBody>
  );
}

function CountCloseForm({ id, close }: { id: string; close: () => void }) {
  const m = useCommandMutation<{ id: string }, { docNumber: string | null }>("sklad.count.close", {
    onSuccess: (r) => {
      successToast(
        r.docNumber
          ? `Inventura uzavřena, rozdíly zaúčtovány: ${r.docNumber}`
          : "Inventura uzavřena bez rozdílů.",
      );
      close();
    },
  });
  return (
    <ConfirmForm
      text="Rozdíly mezi napočítaným a aktuálním stavem se zaúčtují inventurním dokladem a inventura se uzavře. Vyplněné musí být všechny položky (i nula)."
      action="Uzavřít inventuru"
      loading={m.isPending}
      error={m.error}
      onConfirm={() => m.mutate({ id })}
      onClose={close}
    />
  );
}

function JobMaterialTab({ id }: { id: string }) {
  const can = useCan();
  const { Link } = useNav();
  const q = useCommandQuery<{
    lines: {
      itemId: string;
      code: string;
      name: string;
      unit: string;
      qty: string;
      valueMinor: number;
    }[];
    totalMinor: number;
  }>("sklad.jobMaterial", { jobId: id });
  const [doc, setDoc] = useState<"issue" | "return" | null>(null);
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  return (
    <TabBody>
      <div className="flex flex-wrap gap-2">
        {can("sklad.issue") && (
          <>
            <Button variant="primary" onClick={() => setDoc("issue")}>
              Vydat materiál
            </Button>
            <Button variant="secondary" onClick={() => setDoc("return")}>
              Vrátit materiál
            </Button>
          </>
        )}
      </div>
      {q.data.lines.length === 0 ? (
        <p className="text-muted">Na zakázku zatím nebyl vydán žádný materiál.</p>
      ) : (
        <>
          <Table
            head={
              <>
                <th className={th}>Položka</th>
                <th className={cn(th, "text-right")}>Spotřeba</th>
                <th className={cn(th, "text-right")}>Hodnota</th>
              </>
            }
          >
            {q.data.lines.map((l) => (
              <tr key={l.itemId}>
                <td className="px-3 py-2">
                  <Link href={`/sklad/karty/${l.itemId}`} className="hover:underline">
                    {l.name}
                  </Link>
                  <span className="ml-2 text-muted">{l.code}</span>
                </td>
                <td className={cn("px-3 py-2", num)}>
                  {formatQty(l.qty)} {l.unit}
                </td>
                <td className={cn("px-3 py-2", num)}>{formatMinor(l.valueMinor)}</td>
              </tr>
            ))}
          </Table>
          <p className="text-right font-semibold">
            Materiál celkem {formatMinor(q.data.totalMinor)}
          </p>
        </>
      )}
      <Dialog open={!!doc} onOpenChange={(o) => !o && setDoc(null)}>
        {doc && (
          <DialogContent
            title={DOC_TYPE_INFO[doc].label}
            className="w-[min(52rem,calc(100vw-2rem))]"
          >
            <DocForm type={doc} jobId={id} onDone={() => setDoc(null)} />
          </DialogContent>
        )}
      </Dialog>
    </TabBody>
  );
}

const tab = (
  id: string,
  label: string,
  Component: (p: { id: string }) => ReactNode,
  permission = "sklad.read",
): RecordTab => ({
  id,
  label,
  permission,
  render: ({ id: recordId }) => <Component id={recordId} />,
});

const statusOf = (row: Record<string, unknown>) => String(row.status ?? "");

const orderActions: RecordAction[] = [
  {
    id: "receive",
    label: "Přijmout zboží",
    primary: true,
    permission: "sklad.write",
    visible: (row) => ["draft", "sent", "partial"].includes(statusOf(row)),
    dialog: {
      title: "Přijetí zboží",
      render: ({ id, close }) => <ReceiveForm id={id} onDone={close} />,
    },
  },
  {
    id: "send",
    label: "Označit jako odeslanou",
    permission: "sklad.write",
    visible: (row) => statusOf(row) === "draft",
    dialog: {
      title: "Odeslat objednávku",
      render: ({ id, close }) => (
        <OrderStatusForm
          id={id}
          status="sent"
          text="Objednávka se označí jako odeslaná dodavateli. Objednávku samotnou systém neodesílá, pošlete ji dodavateli sami."
          action="Označit jako odeslanou"
          close={close}
        />
      ),
    },
  },
  {
    id: "cancel",
    label: "Zrušit objednávku",
    permission: "sklad.write",
    visible: (row) => ["draft", "sent", "partial"].includes(statusOf(row)),
    dialog: {
      title: "Zrušit objednávku",
      render: ({ id, close }) => (
        <OrderStatusForm
          id={id}
          status="cancelled"
          text="Objednávka se zruší. Už přijaté zboží zůstane na skladě."
          action="Zrušit objednávku"
          danger
          close={close}
        />
      ),
    },
  },
];

const countActions: RecordAction[] = [
  {
    id: "close",
    label: "Uzavřít inventuru",
    primary: true,
    permission: "sklad.inventory",
    visible: (row) => statusOf(row) === "open",
    dialog: {
      title: "Uzavřít inventuru",
      render: ({ id, close }) => <CountCloseForm id={id} close={close} />,
    },
  },
];

const jobActions: RecordAction[] = [
  {
    id: "issue",
    label: "Vydat materiál",
    permission: "sklad.issue",
    dialog: {
      title: DOC_TYPE_INFO.issue.label,
      render: ({ id, close }) => <DocForm type="issue" jobId={id} onDone={close} />,
    },
  },
];

export const ui = defineModuleUi({
  terminalWidgets: { "sklad.issue": { Widget: IssueTerminalWidget } },
  recordTabs: {
    stock_item: [tab("stav", "Stav a pohyby", ItemTab)],
    warehouse: [tab("zasoby", "Zásoby", WarehouseTab)],
    stock_doc: [tab("polozky", "Položky", DocTab)],
    purchase_order: [tab("polozky", "Položky", OrderTab)],
    stock_count: [tab("pocitani", "Počítání", CountTab)],
    job: [{ ...tab("material", "Materiál", JobMaterialTab), group: "naklady", order: 20 }],
  },
  recordActions: {
    purchase_order: orderActions,
    stock_count: countActions,
    job: jobActions,
  },
  pages: [{ path: "/sklad", render: ({ query }) => <OverviewPage query={query} /> }],
});

export { ORDER_STATUSES };
