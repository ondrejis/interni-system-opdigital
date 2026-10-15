"use client";

import { formatMinor } from "@rebar/core/shared";
import {
  Button,
  Checkbox,
  CreateDialog,
  Dialog,
  DialogContent,
  EmptyState,
  Icon,
  Input,
  RecordDialog,
  SegmentedControl,
  Skeleton,
  cn,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityDescriptor,
  useNav,
  useRecordParam,
} from "@rebar/ui";
import { useMemo, useState } from "react";
import { DOMAIN_PAYER_LABELS } from "../labels";
import { CompanyPicker, ExpiryChip, Kpi } from "../shared-ui";
import type { AssignClientResult, DomainListResult, DomainRow } from "../types";
import { BulkDomainsDialog } from "./bulk-dialog";
import { expiryState, type ExpiryLevel } from "./logic";

type Filter = "all" | "critical" | "warning" | "no_client";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const DOT: Record<ExpiryLevel, string> = {
  normal: "bg-line-strong",
  warning: "bg-warning",
  critical: "bg-danger",
  unknown: "bg-line",
};

/** Dialog „Přiřadit klienta“ vybraným doménám. */
function AssignDialog({
  ids,
  open,
  onOpenChange,
  onDone,
}: {
  ids: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [client, setClient] = useState<{ id: string | null; label: string | null }>({
    id: null,
    label: null,
  });
  const assign = useCommandMutation<
    { ids: string[]; companyId: string | null },
    AssignClientResult
  >("muj-prostor.domains.assignClient");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Přiřadit klienta"
        description={`Vybrané domény: ${ids.length}. Prázdný výběr klienta u nich odebere.`}
        data-testid="assign-dialog"
      >
        <div className="space-y-3 px-5 py-4">
          <CompanyPicker
            value={client.id}
            label={client.label}
            onChange={(id, label) => setClient({ id, label })}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => onOpenChange(false)}>Zrušit</Button>
            <Button
              variant="primary"
              loading={assign.isPending}
              data-testid="assign-submit"
              onClick={() =>
                assign.mutate(
                  { ids, companyId: client.id },
                  {
                    onSuccess: (r) => {
                      successToast(`Klient změněn u ${r.updated} domén.`);
                      onOpenChange(false);
                      onDone();
                    },
                    onError: (e) => errorToast(e.message),
                  },
                )
              }
            >
              {client.id ? "Přiřadit" : "Odebrat klienta"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DomainTableRow({
  row,
  today,
  selected,
  onSelect,
  onOpen,
}: {
  row: DomainRow;
  today: string;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onOpen: () => void;
}) {
  const state = expiryState(row.expiresOn, row.warnDays, today);
  return (
    <tr
      className={cn(
        "h-9 border-t border-line-soft hover:bg-hover",
        state.level === "critical" && "bg-danger-soft hover:bg-danger-soft",
      )}
      data-testid="domain-row"
      data-level={state.level}
      data-domain={row.domain}
    >
      <td className="w-8 pl-3">
        <Checkbox
          aria-label={`Vybrat ${row.domain}`}
          checked={selected}
          onCheckedChange={(v) => onSelect(v === true)}
        />
      </td>
      <td className="max-w-64 px-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex max-w-full items-center gap-2 text-left font-medium hover:underline"
        >
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[state.level])} />
          <span className="truncate">{row.domain}</span>
        </button>
      </td>
      <td className="max-w-56 truncate px-3">
        {row.companyName ?? (row.companyId ? "…" : <span className="text-faint">bez klienta</span>)}
      </td>
      <td className="px-3 text-muted">{row.registrar ?? ""}</td>
      <td className="whitespace-nowrap px-3">
        <ExpiryChip expiresOn={row.expiresOn} warnDays={row.warnDays} today={today} />
      </td>
      <td className="px-3 text-muted">{DOMAIN_PAYER_LABELS[row.payer]}</td>
      <td className="px-3">
        {row.autoRenew ? (
          <Icon name="check" className="size-4 text-success" aria-label="Ano" />
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="tabular whitespace-nowrap px-3 text-right text-muted">
        {row.renewalPriceMinor === null ? "" : formatMinor(row.renewalPriceMinor)}
      </td>
      <td className="max-w-48 truncate px-3 text-muted">{row.hostingName ?? ""}</td>
    </tr>
  );
}

/**
 * Stránka „Domény“ (DOM-01 až DOM-04): souhrn podle expirace, seznam seřazený od nejbližší expirace s barvou
 * (normální, upozornění, kritická podle `warn_days` domény), hromadné vložení a přiřazení klienta vybraným doménám.
 * Žádné e-maily ani notifikace: kritické domény jsou vidět jen barvou a číslem u položky v menu.
 */
export function DomainsPage() {
  const list = useCommandQuery<DomainListResult>(
    "muj-prostor.domains.list",
    {},
    { refetchInterval: 30_000 },
  );
  const descriptor = useEntityDescriptor("web_domain");
  const record = useRecordParam(true);
  const { Link } = useNav();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const data = list.data;
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = norm(q.trim());
    return data.rows.filter((r) => {
      if (
        needle &&
        !norm(`${r.domain} ${r.registrar ?? ""} ${r.companyName ?? ""}`).includes(needle)
      )
        return false;
      if (filter === "no_client") return !r.companyId;
      if (filter === "all") return true;
      return expiryState(r.expiresOn, r.warnDays, data.today).level === filter;
    });
  }, [data, q, filter]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const summary = data?.summary;
  const toggleAll = (on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const r of rows) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="domains-page">
      <div className="space-y-3 px-4 pt-3">
        {!summary ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-18 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="domains-summary">
            <Kpi
              testId="kpi-critical"
              label="Kritické"
              value={summary.critical}
              tone={summary.critical > 0 ? "danger" : undefined}
              hint="méně než hranice dní nebo po expiraci"
            />
            <Kpi
              testId="kpi-warning"
              label="Upozornění"
              value={summary.warning}
              tone={summary.warning > 0 ? "warning" : undefined}
              hint="do dvojnásobku hranice"
            />
            <Kpi
              testId="kpi-total"
              label="Domén celkem"
              value={summary.total}
              hint={`${summary.normal} v pořádku`}
            />
            <Kpi
              testId="kpi-no-client"
              label="Bez klienta"
              value={summary.withoutClient}
              hint={summary.withoutClient > 0 ? "doplňte klienty" : "vše přiřazeno"}
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Icon
              name="search"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
            />
            <Input
              aria-label="Hledat v doménách"
              placeholder="Hledat doménu, klienta…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="scrollbar-none max-w-full overflow-x-auto">
            <SegmentedControl<Filter>
              label="Filtr domén"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "Všechny", tone: "neutral" },
                { value: "critical", label: "Kritické", tone: "neutral" },
                { value: "warning", label: "Upozornění", tone: "neutral" },
                { value: "no_client", label: "Bez klienta", tone: "neutral" },
              ]}
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selected.size > 0 && (
              <Button onClick={() => setAssignOpen(true)} data-testid="assign-open">
                <Icon name="building" /> Přiřadit klienta ({selected.size})
              </Button>
            )}
            <Button onClick={() => setBulkOpen(true)} data-testid="bulk-open">
              <Icon name="list" /> Hromadně vložit
            </Button>
            <Link
              href="/muj-prostor/domeny/vse"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-base font-medium text-muted hover:bg-hover hover:text-fg"
            >
              Rozšířený seznam
            </Link>
            <Button variant="primary" onClick={() => setCreateOpen(true)} data-testid="domain-new">
              <Icon name="plus" /> Nová doména
            </Button>
          </div>
        </div>
      </div>

      <div className="scrollbar-thin mt-3 min-h-0 flex-1 overflow-auto px-4 pb-4">
        {list.isError && !data ? (
          <EmptyState
            title="Domény se nepodařilo načíst"
            description={list.error.message}
            action={<Button onClick={() => void list.refetch()}>Zkusit znovu</Button>}
          />
        ) : !data ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState
            title={data.rows.length === 0 ? "Zatím žádné domény" : "Nic nenalezeno"}
            description={
              data.rows.length === 0
                ? "Vložte seznam domén najednou, klienty doplníte potom."
                : "Zkuste jiný filtr nebo hledání."
            }
            action={
              data.rows.length === 0 ? (
                <Button variant="primary" onClick={() => setBulkOpen(true)}>
                  Hromadně vložit
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[56rem] text-base" data-testid="domains-table">
              <thead>
                <tr className="h-9 bg-subtle text-left text-sm font-medium text-muted">
                  <th className="w-8 pl-3">
                    <Checkbox
                      aria-label="Vybrat všechny zobrazené"
                      checked={allSelected}
                      onCheckedChange={(v) => toggleAll(v === true)}
                    />
                  </th>
                  <th className="px-3">Doména</th>
                  <th className="px-3">Klient</th>
                  <th className="px-3">Registrátor</th>
                  <th className="px-3">Expirace</th>
                  <th className="px-3">Platí</th>
                  <th className="px-3">Auto</th>
                  <th className="px-3 text-right">Cena obnovy</th>
                  <th className="px-3">Hosting</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <DomainTableRow
                    key={r.id}
                    row={r}
                    today={data.today}
                    selected={selected.has(r.id)}
                    onSelect={(v) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (v) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      })
                    }
                    onOpen={() => record.open(r.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data?.truncated && (
          <p className="mt-2 text-sm text-warning">Zobrazuje se prvních 5000 domén.</p>
        )}
      </div>

      <BulkDomainsDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <AssignDialog
        ids={[...selected]}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onDone={() => setSelected(new Set())}
      />
      {descriptor.data && (
        <>
          <RecordDialog
            entity={descriptor.data}
            id={record.id}
            onClose={() => {
              record.close();
              void list.refetch();
            }}
          />
          <CreateDialog
            entity={descriptor.data}
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={(row, opts) => {
              setCreateOpen(false);
              void list.refetch();
              if (opts.open) record.open(row.id);
            }}
          />
        </>
      )}
    </div>
  );
}
