"use client";

import {
  Button,
  Chip,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Input,
  MoneyInput,
  cn,
  useCan,
  useEntityApi,
} from "@rebar/ui";
import { useState, type ReactNode } from "react";
import type { PaymentRow, People } from "../contract";
import type { PaymentTotals } from "../logic";
import {
  KIND_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  fmtDate,
  money,
  personName,
  useConfirmedMutation,
  usePeople,
} from "./common";
import { nextStep } from "./format";
import { TransitionDialog } from "./payment-dialogs";

/*
  Tabulka plateb (FIN-12): sloupce zakázka, klient, popis, druh, částka, fakturuje, stav, číslo faktury, vystaveno,
  splatnost, zaplaceno a podíl každé osoby; inline úprava popisu, částky a splatnosti; vystavená platba po splatnosti
  červeně; součty v patičce; na mobilu karty. Znovupoužitá na stránce Platby, v záložkách zakázky a klienta
  a v rozkliku měsíce vyrovnání.
*/

type Props = {
  rows: PaymentRow[];
  people: People;
  totals?: PaymentTotals | undefined;
  /** Zkrácená varianta (záložky): bez sloupců zakázka/klient. */
  compact?: boolean;
  showJob?: boolean;
  showClient?: boolean;
  /** Jen čtení (rozklik salda). */
  readOnly?: boolean;
  onOpen: (id: string) => void;
  emptyText?: string;
};

type Inline = { id: string; field: "description" | "amount" | "dueOn" };

/** Tabulka plateb se součty a stavovým tokem. */
export function PaymentsTable({
  rows,
  people: peopleIn,
  totals,
  compact = false,
  showJob = !compact,
  showClient = !compact,
  readOnly = false,
  onOpen,
  emptyText = "Žádné platby.",
}: Props) {
  const can = useCan();
  const api = useEntityApi();
  const people = usePeople(peopleIn);
  const canWrite = !readOnly && can("finance.payments_write");
  const [inline, setInline] = useState<Inline | null>(null);
  const [transition, setTransition] = useState<{
    row: PaymentRow;
    to: "planned" | "issued" | "paid" | "canceled";
  } | null>(null);

  const update = useConfirmedMutation<
    Record<string, unknown> & { confirmRecalc?: boolean },
    unknown
  >("finance.payment.update", { success: "Uloženo.", onOk: () => setInline(null), people });

  // sloupce podílů: osoby, které mají v řádcích podíl, jinak všichni známí lidé
  const personIds = [
    ...new Set([
      ...rows.flatMap((r) => r.allocations.map((a) => a.userId)),
      ...Object.keys(totals?.allocatedByUser ?? {}),
    ]),
  ].sort((a, b) => personName(people, a).localeCompare(personName(people, b), "cs"));

  const save = (row: PaymentRow, patch: Record<string, unknown>) =>
    update.run({ id: row.id, ...patch });
  const editable = (row: PaymentRow) =>
    canWrite && row.status !== "canceled" && row.source !== "fakturoid";

  const cell = (row: PaymentRow, field: Inline["field"]): ReactNode => {
    const active = inline?.id === row.id && inline.field === field;
    const text =
      field === "description"
        ? row.description
        : field === "amount"
          ? money(row.amountMinor)
          : fmtDate(row.dueOn);
    const overdue = field === "dueOn" && row.dueState === "overdue";
    if (!active || !editable(row))
      return editable(row) ? (
        <button
          type="button"
          className={cn(
            "max-w-full truncate rounded px-1 text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-line)]",
            field === "amount" && "tabular-nums",
            overdue && "font-medium text-danger",
          )}
          title="Upravit"
          aria-label={`Upravit ${field === "description" ? "popis" : field === "amount" ? "částku" : "splatnost"}: ${text}`}
          onClick={(e) => {
            e.stopPropagation();
            setInline({ id: row.id, field });
          }}
        >
          {text}
        </button>
      ) : (
        <span
          className={cn(field === "amount" && "tabular-nums", overdue && "font-medium text-danger")}
        >
          {text}
        </span>
      );
    return (
      <span onClick={(e) => e.stopPropagation()} className="block min-w-28">
        {field === "description" ? (
          <Input
            autoFocus
            defaultValue={row.description}
            aria-label="Popis"
            onKeyDown={(e) => {
              if (e.key === "Escape") setInline(null);
              if (e.key === "Enter" && e.currentTarget.value.trim())
                save(row, { description: e.currentTarget.value.trim() });
            }}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== row.description) save(row, { description: v });
              else setInline(null);
            }}
          />
        ) : field === "amount" ? (
          <AmountEditor
            row={row}
            onSave={(v) => save(row, { amountMinor: v })}
            onCancel={() => setInline(null)}
          />
        ) : (
          <DatePicker
            open
            onOpenChange={(o) => !o && setInline(null)}
            value={row.dueOn}
            onChange={(v) => {
              if (v !== row.dueOn) save(row, { dueOn: v });
              else setInline(null);
            }}
          />
        )}
      </span>
    );
  };

  const statusCell = (row: PaymentRow): ReactNode => {
    const step = nextStep(row.status);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip color={STATUS_COLORS[row.status]!} dot>
          {STATUS_LABELS[row.status]}
        </Chip>
        {row.allocationMode === "manual" && (
          <Chip color="orange" title="Rozdělení platby bylo přepsáno ručně">
            Rozděleno ručně
          </Chip>
        )}
        {row.isPrivate && (
          <Chip color="purple" title="Soukromá platba (vidí jen vlastník, nepočítá se do salda)">
            <Icon name="lock" /> Soukromá
          </Chip>
        )}
        {canWrite && step && (
          <Button
            size="sm"
            variant={row.status === "issued" ? "primary" : "secondary"}
            onClick={(e) => {
              e.stopPropagation();
              setTransition({ row, to: step.to });
            }}
            data-testid={`step-${step.to}`}
          >
            {step.label}
          </Button>
        )}
        {canWrite && row.status !== "paid" && row.status !== "canceled" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Další akce platby"
                onClick={(e) => e.stopPropagation()}
              >
                <Icon name="more" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {row.status === "issued" && (
                <DropdownMenuItem onSelect={() => setTransition({ row, to: "planned" })}>
                  Vrátit na plánovanou
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setTransition({ row, to: "canceled" })}>
                Zrušit platbu
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  const job = (r: PaymentRow): ReactNode =>
    r.jobId ? (
      <a
        href={api.hrefFor("job", r.jobId) ?? `/zakazky/${r.jobId}`}
        className="text-accent hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {r.jobNumber}
        <span className="text-muted"> {r.jobTitle}</span>
      </a>
    ) : (
      <span className="text-muted">Bez zakázky</span>
    );
  const client = (r: PaymentRow): ReactNode =>
    r.companyId ? (
      <a
        href={api.hrefFor("company", r.companyId) ?? `/kontakty/firmy/${r.companyId}`}
        className="hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {r.companyName ?? "Klient"}
      </a>
    ) : (
      "–"
    );

  const rowTone = (r: PaymentRow) =>
    r.dueState === "overdue" ? "bg-danger-soft" : r.status === "canceled" ? "opacity-60" : "";

  if (rows.length === 0)
    return (
      <p className="px-4 py-8 text-center text-muted" data-testid="payments-empty">
        {emptyText}
      </p>
    );

  return (
    <>
      {/* mobil: karty (čtení + základní akce) */}
      <ul className="space-y-3 p-3 md:hidden" aria-label="Platby">
        {rows.map((r) => (
          <li
            key={r.id}
            className={cn("rounded-lg border border-line p-3", rowTone(r))}
            onClick={() => onOpen(r.id)}
            data-testid="payment-card"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-medium [overflow-wrap:anywhere]">{r.description}</p>
              <p className="shrink-0 font-semibold tabular-nums">{money(r.amountMinor)}</p>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {[r.jobNumber, r.companyName, KIND_LABELS[r.kind]].filter(Boolean).join(" · ")}
            </p>
            <p
              className={cn(
                "mt-0.5 text-sm",
                r.dueState === "overdue" ? "font-medium text-danger" : "text-muted",
              )}
            >
              Fakturuje {personName(people, r.issuerId)} · splatnost {fmtDate(r.dueOn)}
            </p>
            <div className="mt-2">{statusCell(r)}</div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table
          className="w-full min-w-[60rem] border-collapse text-base"
          data-testid="payments-table"
        >
          <thead>
            <tr className="h-9 border-b border-line bg-subtle text-left text-sm text-muted">
              {showJob && <th className="px-3 font-medium">Zakázka</th>}
              {showClient && <th className="px-3 font-medium">Klient</th>}
              <th className="px-3 font-medium">Popis</th>
              <th className="px-3 font-medium">Druh</th>
              <th className="px-3 text-right font-medium">Částka</th>
              <th className="px-3 font-medium">Fakturuje</th>
              <th className="px-3 font-medium">Stav</th>
              <th className="px-3 font-medium">Faktura</th>
              <th className="px-3 font-medium">Vystaveno</th>
              <th className="px-3 font-medium">Splatnost</th>
              <th className="px-3 font-medium">Zaplaceno</th>
              {personIds.map((id) => (
                <th key={id} className="px-3 text-right font-medium">
                  Podíl {personName(people, id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={cn(
                  "h-9 cursor-pointer border-b border-line-soft hover:bg-hover",
                  rowTone(r),
                )}
                onClick={() => onOpen(r.id)}
                data-testid="payment-row"
                data-status={r.status}
                data-overdue={r.dueState === "overdue" ? "true" : undefined}
              >
                {showJob && <td className="max-w-56 truncate px-3">{job(r)}</td>}
                {showClient && <td className="max-w-40 truncate px-3">{client(r)}</td>}
                <td className="max-w-64 px-3">
                  {cell(r, "description")}
                  {r.periodMonth && (
                    <span className="ml-1 text-sm text-faint">{r.periodMonth}</span>
                  )}
                </td>
                <td className="px-3 text-muted">{KIND_LABELS[r.kind]}</td>
                <td className="px-3 text-right">{cell(r, "amount")}</td>
                <td className="px-3">{personName(people, r.issuerId)}</td>
                <td className="px-3">{statusCell(r)}</td>
                <td className="px-3">
                  {r.invoiceUrl ? (
                    <a
                      href={r.invoiceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-accent hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.invoiceNumber ?? "Faktura"}
                    </a>
                  ) : (
                    (r.invoiceNumber ?? "–")
                  )}
                </td>
                <td className="px-3 tabular-nums">{fmtDate(r.issuedOn)}</td>
                <td className="px-3 tabular-nums">{cell(r, "dueOn")}</td>
                <td className="px-3 tabular-nums">{fmtDate(r.paidOn)}</td>
                {personIds.map((id) => (
                  <td key={id} className="px-3 text-right tabular-nums">
                    {r.status === "canceled"
                      ? "–"
                      : money(r.allocations.find((a) => a.userId === id)?.amountMinor ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr
                className="h-9 border-t border-line bg-subtle font-medium"
                data-testid="payments-totals"
              >
                <td className="px-3" colSpan={(showJob ? 1 : 0) + (showClient ? 1 : 0) + 2}>
                  Celkem {totals.count}{" "}
                  {totals.count === 1
                    ? "platba"
                    : totals.count >= 2 && totals.count <= 4
                      ? "platby"
                      : "plateb"}
                </td>
                <td className="px-3 text-right tabular-nums" data-testid="total-amount">
                  {money(totals.totalMinor)}
                </td>
                <td className="px-3" colSpan={6}>
                  <span className="flex flex-wrap gap-x-4 text-sm font-normal text-muted">
                    <span>Plánováno {money(totals.byStatus.planned.amountMinor)}</span>
                    <span>Vystaveno {money(totals.byStatus.issued.amountMinor)}</span>
                    <span>Zaplaceno {money(totals.byStatus.paid.amountMinor)}</span>
                    {totals.overdue.count > 0 && (
                      <span className="font-medium text-danger">
                        Po splatnosti {money(totals.overdue.amountMinor)} ({totals.overdue.count})
                      </span>
                    )}
                  </span>
                </td>
                {personIds.map((id) => (
                  <td key={id} className="px-3 text-right tabular-nums">
                    {money(totals.allocatedByUser[id] ?? 0)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {transition && (
        <TransitionDialog
          row={transition.row}
          to={transition.to}
          people={people}
          onClose={() => setTransition(null)}
        />
      )}
      {update.dialog}
    </>
  );
}

function AmountEditor({
  row,
  onSave,
  onCancel,
}: {
  row: PaymentRow;
  onSave: (minor: number) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<number | null>(row.amountMinor);
  return (
    <span
      className="flex items-center gap-1"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && v && v > 0) onSave(v);
      }}
    >
      <MoneyInput value={v} onChange={setV} aria-label="Částka" className="w-28" />
      <Button
        size="sm"
        variant="primary"
        disabled={!v || v <= 0 || v === row.amountMinor}
        onClick={() => v && onSave(v)}
      >
        Uložit
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} aria-label="Zrušit úpravu">
        <Icon name="x" />
      </Button>
    </span>
  );
}
