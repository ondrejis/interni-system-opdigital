"use client";

import {
  BigButton,
  ButtonLink,
  JobPicker,
  TOUCH_FIELD,
  TerminalCard,
  TerminalEmpty,
  TouchField,
  TouchSelect,
  cn,
  localToday,
  reportOutcome,
  useActiveJobs,
  useCommandQuery,
  useJobChoice,
  useTerminalQueue,
  type TerminalWidgetProps,
} from "@rebar/ui";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type Item = { id: string; code: string; name: string; unit: string; totalQty: string };
type Items = {
  warehouses: { id: string; name: string; kind: string }[];
  items: Item[];
  limited: boolean;
};
type Line = { item: Pick<Item, "id" | "name" | "unit" | "code">; qty: string };

const RECENT = "terminal-sklad-recent";
const WAREHOUSE = "terminal-sklad-warehouse";
const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // paměť zařízení je jen pohodlí
  }
};

const parseQty = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

/** Rychlý výdej materiálu: zakázka, hledání karty, množství a jedno odeslání. Funguje i bez signálu pro naposledy použité karty. */
export function IssueTerminalWidget({ label, variant, pageHref }: TerminalWidgetProps) {
  if (variant === "card")
    return (
      <TerminalCard title={label} icon="package" testId="tile-sklad.issue">
        <p className="mb-3 text-base text-muted">Vydejte materiál ze skladu na zakázku.</p>
        {pageHref && (
          <ButtonLink href={pageHref} variant="primary" className="w-full">
            <Plus /> Vydat materiál
          </ButtonLink>
        )}
      </TerminalCard>
    );
  return <IssueForm label={label} />;
}

function IssueForm({ label }: { label: string }) {
  const { jobs, loading } = useActiveJobs(true);
  const choice = useJobChoice(jobs);
  const { submit } = useTerminalQueue();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Line["item"][]>([]);
  useEffect(() => setRecent(read<Line["item"][]>(RECENT, [])), []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const items = useCommandQuery<Items>("sklad.terminal.items", { q: debounced });
  const warehouses = items.data?.warehouses ?? [];
  const wh = warehouse || read<string>(WAREHOUSE, "") || warehouses[0]?.id || "";
  const offlineList = items.isError ? recent : null;
  const shown: Line["item"][] = offlineList ?? items.data?.items ?? [];

  function add(item: Line["item"]) {
    setLines((cur) => {
      const hit = cur.find((l) => l.item.id === item.id);
      return hit
        ? cur.map((l) => (l === hit ? { ...l, qty: fmt(parseQty(l.qty) + 1) } : l))
        : [...cur, { item, qty: "1" }];
    });
  }

  async function send() {
    setError(null);
    if (!choice.value) return setError("Vyberte zakázku.");
    if (!wh) return setError("Vyberte sklad.");
    if (!lines.length) return setError("Přidejte aspoň jednu položku.");
    if (lines.some((l) => parseQty(l.qty) <= 0))
      return setError("Množství musí být větší než nula.");
    setBusy(true);
    try {
      const out = await submit({
        command: "sklad.post",
        input: {
          type: "issue",
          date: localToday(),
          warehouseId: wh,
          jobId: choice.value,
          lines: lines.map((l) => ({ itemId: l.item.id, qty: String(parseQty(l.qty)) })),
        },
        label: `Materiál: ${lines
          .map((l) => l.item.name)
          .join(", ")
          .slice(0, 60)}`,
        group: "sklad",
        stamp: false,
      });
      if (reportOutcome(out, "Materiál vydán.")) {
        write(WAREHOUSE, wh);
        const merged = [
          ...lines.map((l) => l.item),
          ...recent.filter((r) => !lines.some((l) => l.item.id === r.id)),
        ].slice(0, 20);
        write(RECENT, merged);
        setRecent(merged);
        setLines([]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <TerminalCard title={label} icon="package" testId="tile-sklad.issue" bare>
      <div className="space-y-4">
        <JobPicker jobs={jobs} loading={loading} value={choice.value} onChange={choice.set} />
        {warehouses.length > 1 && (
          <TouchField label="Sklad">
            {(id) => (
              <TouchSelect
                id={id}
                value={wh}
                onChange={setWarehouse}
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              />
            )}
          </TouchField>
        )}

        {lines.length > 0 && (
          <ul className="space-y-2" aria-label="Vydávané položky" data-testid="issue-lines">
            {lines.map((l) => (
              <li key={l.item.id} className="rounded-xl border border-line bg-subtle p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-[17px] font-medium leading-snug">{l.item.name}</div>
                  <button
                    type="button"
                    aria-label={`Odebrat: ${l.item.name}`}
                    onClick={() => setLines((c) => c.filter((x) => x !== l))}
                    className="-mr-2 -mt-1 inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-muted active:bg-hover"
                  >
                    <Trash2 className="size-5" />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Méně"
                    onClick={() =>
                      setLines((c) =>
                        c.map((x) =>
                          x === l ? { ...x, qty: fmt(Math.max(0, parseQty(x.qty) - 1)) } : x,
                        ),
                      )
                    }
                    className="inline-flex size-14 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-bg active:bg-hover"
                  >
                    <Minus className="size-5" />
                  </button>
                  <input
                    inputMode="decimal"
                    aria-label={`Množství: ${l.item.name}`}
                    value={l.qty}
                    onChange={(e) =>
                      setLines((c) => c.map((x) => (x === l ? { ...x, qty: e.target.value } : x)))
                    }
                    className={cn(TOUCH_FIELD, "h-14 min-w-0 flex-1 text-center tabular")}
                  />
                  <button
                    type="button"
                    aria-label="Více"
                    onClick={() =>
                      setLines((c) =>
                        c.map((x) => (x === l ? { ...x, qty: fmt(parseQty(x.qty) + 1) } : x)),
                      )
                    }
                    className="inline-flex size-14 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-bg active:bg-hover"
                  >
                    <Plus className="size-5" />
                  </button>
                  <span className="w-10 shrink-0 text-base text-muted">{l.item.unit}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <TouchField label="Najít materiál">
          {(id) => (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-faint" />
              <input
                id={id}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Název, kód nebo čárový kód"
                className={cn(TOUCH_FIELD, "h-14 pl-11")}
              />
            </div>
          )}
        </TouchField>
        {offlineList && (
          <p className="text-base text-muted">Bez připojení: nabízí se naposledy vydané položky.</p>
        )}
        {shown.length === 0 && !items.isLoading ? (
          <TerminalEmpty>
            {debounced
              ? "Nic nenalezeno."
              : "Zadejte, co hledáte, nebo vyberte z naposledy vydaných."}
          </TerminalEmpty>
        ) : (
          <ul className="space-y-2" aria-label="Skladové položky" data-testid="issue-items">
            {shown.map((it) => {
              const onStock = "totalQty" in it ? (it as Item).totalQty : null;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => add(it)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-bg px-3 py-3 text-left active:bg-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] font-medium leading-snug">{it.name}</span>
                      <span className="block text-base text-muted">
                        {it.code}
                        {onStock !== null &&
                          ` · na skladě ${Number(onStock).toLocaleString("cs-CZ")} ${it.unit}`}
                      </span>
                    </span>
                    <Plus className="size-5 shrink-0 text-accent" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {items.data?.limited && (
          <p className="text-base text-muted">Zobrazeno prvních 30 položek, upřesněte hledání.</p>
        )}

        {error && (
          <p role="alert" className="text-base text-danger">
            {error}
          </p>
        )}
        <BigButton variant="primary" loading={busy} onClick={() => void send()}>
          Vydat na zakázku{lines.length ? ` (${lines.length})` : ""}
        </BigButton>
      </div>
    </TerminalCard>
  );
}
