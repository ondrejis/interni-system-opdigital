"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  Field,
  Input,
  MoneyInput,
  Notice,
  RelatedRecords,
  SegmentedControl,
  Skeleton,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useNav,
  type ModulePage,
  type RecordAction,
  type RecordTab,
} from "@rebar/ui";
import {
  Banknote,
  FileCheck2,
  FilePlus2,
  HandCoins,
  ListChecks,
  Lock,
  Percent,
  ReceiptText,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { REVERSE_CHARGE_TEXT, retentionPct } from "../totals";

/** UI oblasti „billing“. Klientský kód: žádné importy serverových částí. */

type Summary = {
  currency: string;
  phase: string;
  vatMode: "standard" | "reverse_charge";
  retentionBp: number;
  contractMinor: number;
  originalContractMinor: number;
  extraChangesMinor: number;
  hasBudget: boolean;
  invoicedMinor: number;
  paidNetMinor: number;
  remainingToInvoiceMinor: number;
  retentionHeldMinor: number;
  retentionReleasedMinor: number;
  advancesPaidMinor: number;
  advancesToDeduct: number;
  unpaidAdvances: number;
  finalIssued: boolean;
  hasReleaseDraft: boolean;
  outstandingMinor: number;
  statements: {
    id: string;
    number: number;
    periodFrom: string;
    periodTo: string;
    status: string;
    approvedMinor: number;
    invoiceId: string | null;
  }[];
};

type Settlement = {
  currency: string;
  vatMode: "standard" | "reverse_charge";
  retentionBp: number;
  contractMinor: number;
  billedBeforeMinor: number;
  advancesMinor: number;
  retentionMinor: number;
  netMinor: number;
  grossMinor: number;
  advances: { invoiceId: string; number: string; netMinor: number }[];
  unpaidAdvances: { invoiceId: string; number: string; remainingMinor: number }[];
  finalIssued: boolean;
  warnings: string[];
};

/** Fáze zakázky, ve kterých se jednotlivé doklady nabízejí. */
const PHASE_PROFORMA = ["preparation", "execution", "handover"];
const PHASE_PARTIAL = ["execution", "handover", "warranty"];
const PHASE_FINAL = ["execution", "handover", "warranty"];
const PHASE_RELEASE = ["handover", "warranty", "closed"];

function Err({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error.message}
    </p>
  ) : null;
}

function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <div className="text-sm text-muted">{label}</div>
      <div className="tabular mt-0.5 text-lg font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-sm text-faint">{hint}</div>}
    </div>
  );
}

/* ---------- přehledová karta ---------- */

function SummaryCard({ s }: { s: Summary }) {
  const m = (v: number) => formatMinor(v, s.currency);
  const pct = (v: number) =>
    s.contractMinor > 0 ? Math.max(0, Math.min(100, (v / s.contractMinor) * 100)) : 0;
  return (
    <section
      className="rounded-lg border border-line p-4"
      data-testid="job-invoice-summary"
      aria-label="Přehled fakturace"
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <h2 className="text-sm font-semibold">Fakturace vůči smluvní ceně</h2>
        {s.vatMode === "reverse_charge" && (
          <Chip color="purple" title={REVERSE_CHARGE_TEXT} data-testid="vat-mode-chip">
            Přenesená daňová povinnost
          </Chip>
        )}
        {s.retentionBp > 0 && <Chip color="teal">Zádržné {retentionPct(s.retentionBp)} %</Chip>}
        <span className="ml-auto text-sm text-faint">částky bez DPH</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-hover"
        role="img"
        aria-label={`Vyfakturováno ${Math.round(pct(s.invoicedMinor))} %, uhrazeno ${Math.round(pct(s.paidNetMinor))} % smluvní ceny`}
      >
        <div className="relative h-full" style={{ width: `${pct(s.invoicedMinor)}%` }}>
          <div className="absolute inset-0 bg-accent/35" />
          <div
            className="absolute inset-y-0 left-0 bg-accent"
            style={{
              width:
                s.invoicedMinor > 0
                  ? `${Math.min(100, (s.paidNetMinor / s.invoicedMinor) * 100)}%`
                  : "0%",
            }}
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Smluvní cena"
          value={m(s.contractMinor)}
          hint={
            s.extraChangesMinor ? `z toho změny mimo rozpočet ${m(s.extraChangesMinor)}` : undefined
          }
          testId="stat-contract"
        />
        <Stat
          label="Fakturováno"
          value={m(s.invoicedMinor)}
          hint={s.advancesPaidMinor ? `zálohy zaplaceno ${m(s.advancesPaidMinor)}` : undefined}
          testId="stat-invoiced"
        />
        <Stat label="Uhrazeno" value={m(s.paidNetMinor)} testId="stat-paid" />
        <Stat
          label="Zbývá vyfakturovat"
          value={m(s.remainingToInvoiceMinor)}
          hint={s.retentionHeldMinor ? `z toho zádržné ${m(s.retentionHeldMinor)}` : undefined}
          testId="stat-remaining"
        />
      </div>
      {(s.retentionBp > 0 || s.retentionHeldMinor > 0 || s.retentionReleasedMinor > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 lg:grid-cols-4">
          <Stat
            label="Zádržné drženo"
            value={m(s.retentionHeldMinor)}
            testId="stat-retention-held"
          />
          <Stat
            label="Zádržné uvolněno"
            value={m(s.retentionReleasedMinor)}
            testId="stat-retention-released"
          />
          <Stat
            label="Zálohy k odečtení"
            value={String(s.advancesToDeduct)}
            hint={s.unpaidAdvances ? `${s.unpaidAdvances} čeká na úhradu` : undefined}
          />
          <Stat label="K úhradě s DPH" value={m(s.outstandingMinor)} />
        </div>
      )}
    </section>
  );
}

/* ---------- dialogy ---------- */

function useCreated() {
  const api = useEntityApi();
  const { push } = useNav();
  return (id: string) => {
    successToast("Koncept faktury je připravený. Zkontrolujte položky a vystavte ho.");
    push(api.hrefFor("invoice", id) ?? "/fakturace");
  };
}

/** Záloha a ruční dílčí faktura: procento ze smluvní ceny, nebo pevná částka. */
function AmountDialog({
  jobId,
  kind,
  title,
  description,
  open,
  onOpenChange,
}: {
  jobId: string;
  kind: "proforma" | "partial";
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const created = useCreated();
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [percent, setPercent] = useState("30");
  const [amount, setAmount] = useState<number | null>(null);
  const run = useCommandMutation<
    { jobId: string; kind: string; percent?: number; amountMinor?: number },
    { id: string }
  >("fakturace.createFromJob", {
    onSuccess: (r) => {
      onOpenChange(false);
      created(r.id);
    },
  });
  const valid = mode === "percent" ? Number(percent.replace(",", ".")) > 0 : (amount ?? 0) > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            run.mutate(
              mode === "percent"
                ? { jobId, kind, percent: Number(percent.replace(",", ".")) }
                : { jobId, kind, amountMinor: amount ?? 0 },
            );
          }}
        >
          <SegmentedControl
            label="Způsob zadání"
            value={mode}
            onChange={setMode}
            options={[
              { value: "percent", label: "Procento ceny" },
              { value: "amount", label: "Pevná částka" },
            ]}
          />
          {mode === "percent" ? (
            <Field label="Kolik procent smluvní ceny" htmlFor="pct">
              <Input
                id="pct"
                autoFocus
                inputMode="decimal"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Částka bez DPH" htmlFor="amt">
              <MoneyInput id="amt" value={amount} onChange={setAmount} />
            </Field>
          )}
          <Err error={run.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={run.isPending} disabled={!valid}>
              Vytvořit koncept
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Dílčí faktura: ze schváleného soupisu prací, nebo ručně procentem / částkou. */
function PartialDialog({
  s,
  jobId,
  open,
  onOpenChange,
  onManual,
}: {
  s: Summary;
  jobId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onManual: () => void;
}) {
  const created = useCreated();
  const ready = s.statements.filter((x) => x.status === "approved" && !x.invoiceId);
  const run = useCommandMutation<{ statementId: string }, { id: string }>(
    "fakturace.createFromStatement",
    {
      onSuccess: (r) => {
        onOpenChange(false);
        created(r.id);
      },
    },
  );
  void jobId;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Dílčí faktura"
        description="Nejpřesnější je faktura ze schváleného soupisu provedených prací, řádky vzniknou po položkách rozpočtu."
      >
        <div className="space-y-3 px-5 py-4">
          {ready.length ? (
            <ul
              className="divide-y divide-line rounded-lg border border-line"
              data-testid="statement-list"
            >
              {ready.map((st) => (
                <li key={st.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">Soupis č. {st.number}</div>
                    <div className="text-sm text-muted">
                      {formatDate(st.periodFrom)} – {formatDate(st.periodTo)}
                    </div>
                  </div>
                  <span className="tabular font-medium">
                    {formatMinor(st.approvedMinor, s.currency)}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={run.isPending && run.variables?.statementId === st.id}
                    onClick={() => run.mutate({ statementId: st.id })}
                  >
                    Vytvořit fakturu
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <Notice>
              Žádný schválený soupis prací nečeká na fakturu. Soupis sestavíte v záložce Soupisy
              prací.
            </Notice>
          )}
          <Err error={run.error} />
          <div className="flex justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
                onManual();
              }}
            >
              <Percent /> Zadat ručně
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Zavřít
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
  sign,
}: {
  label: ReactNode;
  value: string;
  muted?: boolean;
  strong?: boolean;
  sign?: "-" | "=";
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-6 py-1 ${muted ? "text-muted" : ""} ${strong ? "border-t border-line pt-2 font-semibold" : ""}`}
    >
      <dt>
        {sign && (
          <span className="mr-1.5 inline-block w-3 text-faint">{sign === "-" ? "−" : "="}</span>
        )}
        {label}
      </dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

/** Konečná faktura: rekapitulace s odečty, potom vytvoření konceptu. */
function FinalDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const created = useCreated();
  const q = useCommandQuery<Settlement>("fakturace.finalSettlement", { jobId }, { enabled: open });
  const run = useCommandMutation<{ jobId: string; kind: string }, { id: string }>(
    "fakturace.createFromJob",
    {
      onSuccess: (r) => {
        onOpenChange(false);
        created(r.id);
      },
    },
  );
  const f = q.data;
  const m = (v: number) => formatMinor(v, f?.currency ?? "CZK");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Konečná faktura"
        description="Vyúčtování zakázky: smluvní cena po odečtení dříve fakturovaného, zaplacených záloh a zádržného."
      >
        <div className="space-y-3 px-5 py-4">
          {!f ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <dl className="text-base" data-testid="final-settlement">
                <Row label="Smluvní cena (včetně schválených změn)" value={m(f.contractMinor)} />
                <Row
                  sign="-"
                  label="Dříve fakturované plnění"
                  value={m(f.billedBeforeMinor)}
                  muted
                />
                <Row
                  sign="-"
                  label={
                    f.advances.length
                      ? `Zaplacené zálohy (${f.advances.map((a) => a.number).join(", ")})`
                      : "Zaplacené zálohy"
                  }
                  value={m(f.advancesMinor)}
                  muted
                />
                {f.retentionBp > 0 && (
                  <Row
                    sign="-"
                    label={`Zádržné ${retentionPct(f.retentionBp)} % ze zbývajícího plnění`}
                    value={m(f.retentionMinor)}
                    muted
                  />
                )}
                <Row sign="=" label="K fakturaci bez DPH" value={m(f.netMinor)} strong />
                {f.vatMode === "reverse_charge" ? (
                  <p className="pt-1 text-sm text-muted">{REVERSE_CHARGE_TEXT}</p>
                ) : (
                  <Row label="Celkem k úhradě s DPH" value={m(f.grossMinor)} muted />
                )}
              </dl>
              {f.warnings.map((w) => (
                <Notice key={w} tone="warning">
                  {w}
                </Notice>
              ))}
            </>
          )}
          <Err error={run.error ?? (q.error as Error | null)} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button
              variant="primary"
              loading={run.isPending}
              disabled={!f || f.finalIssued}
              onClick={() => run.mutate({ jobId, kind: "final" })}
            >
              Vytvořit koncept
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Uvolnění zádržného: celé drženo, nebo zadaná část. */
function ReleaseDialog({
  s,
  jobId,
  open,
  onOpenChange,
}: {
  s: Summary;
  jobId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const created = useCreated();
  const [amount, setAmount] = useState<number | null>(null);
  const run = useCommandMutation<{ jobId: string; amountMinor?: number }, { id: string }>(
    "fakturace.releaseRetention",
    {
      onSuccess: (r) => {
        onOpenChange(false);
        created(r.id);
      },
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Uvolnění zádržného"
        description="Samostatný doklad na stržené zádržné; DPH se přizná podle původních sazeb."
      >
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            run.mutate({ jobId, ...(amount ? { amountMinor: amount } : {}) });
          }}
        >
          <p className="text-muted">
            Drženo {formatMinor(s.retentionHeldMinor, s.currency)}, dosud uvolněno{" "}
            {formatMinor(s.retentionReleasedMinor, s.currency)}.
          </p>
          <Field label="Částka bez DPH (prázdné = celé drženo zádržné)" htmlFor="rel-amt">
            <MoneyInput
              id="rel-amt"
              value={amount}
              onChange={setAmount}
              placeholder={formatMinor(s.retentionHeldMinor, s.currency)}
            />
          </Field>
          <Err error={run.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={run.isPending}>
              Vytvořit koncept
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- záložka Faktury na zakázce ---------- */

type Dlg = null | "proforma" | "partial" | "manual" | "final" | "release";

export function JobInvoicesTab({ id }: { id: string }) {
  const q = useCommandQuery<Summary>("fakturace.jobSummary", { jobId: id });
  const [dlg, setDlg] = useState<Dlg>(null);
  const s = q.data;
  if (!s) return <Skeleton className="h-40" />;
  const close = (v: boolean) => !v && setDlg(null);
  const canProforma = PHASE_PROFORMA.includes(s.phase);
  const canPartial = PHASE_PARTIAL.includes(s.phase);
  const canFinal = PHASE_FINAL.includes(s.phase) && !s.finalIssued;
  const canRelease =
    PHASE_RELEASE.includes(s.phase) && s.retentionHeldMinor > 0 && !s.hasReleaseDraft;
  const readyStatements = s.statements.filter(
    (x) => x.status === "approved" && !x.invoiceId,
  ).length;
  const primary =
    s.phase === "preparation"
      ? "proforma"
      : s.phase === "execution"
        ? "partial"
        : s.phase === "handover" || s.phase === "warranty"
          ? canRelease && !canFinal
            ? "release"
            : "final"
          : null;
  const variant = (k: string) => (primary === k ? "primary" : "secondary");
  const nothing = !canProforma && !canPartial && !canFinal && !canRelease;
  return (
    <div className="space-y-4">
      <SummaryCard s={s} />
      {s.vatMode === "reverse_charge" && (
        <Notice tone="info" title="Přenesená daňová povinnost">
          Faktury této zakázky se vystavují bez DPH s textem „{REVERSE_CHARGE_TEXT}“. Odběratel musí
          mít DIČ.
        </Notice>
      )}
      <div className="flex flex-wrap gap-2" data-testid="billing-actions">
        {canProforma && (
          <Button variant={variant("proforma")} onClick={() => setDlg("proforma")}>
            <Banknote /> Zálohová faktura
          </Button>
        )}
        {canPartial && (
          <Button variant={variant("partial")} onClick={() => setDlg("partial")}>
            <ListChecks /> Dílčí faktura
            {readyStatements > 0 && (
              <span className="chip" data-color="blue">
                {readyStatements} soupis{readyStatements > 1 ? "y" : ""}
              </span>
            )}
          </Button>
        )}
        {canFinal && (
          <Button variant={variant("final")} onClick={() => setDlg("final")}>
            <FileCheck2 /> Konečná faktura
          </Button>
        )}
        {canRelease && (
          <Button variant={variant("release")} onClick={() => setDlg("release")}>
            <HandCoins /> Uvolnit zádržné
          </Button>
        )}
        {nothing && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <FilePlus2 className="size-4" aria-hidden /> V této fázi zakázky se nové doklady
            nezakládají.
          </p>
        )}
      </div>
      <RelatedRecords entity="invoice" parentAttribute="job" parentId={id} height={320} />

      <AmountDialog
        jobId={id}
        kind="proforma"
        title="Zálohová faktura"
        description="Částka se spočítá ze smluvní ceny. Po vytvoření konceptu ji můžete upravit."
        open={dlg === "proforma"}
        onOpenChange={close}
      />
      <AmountDialog
        jobId={id}
        kind="partial"
        title="Dílčí faktura (ručně)"
        description="Částka se spočítá ze smluvní ceny. Zádržné se strhne podle zakázky."
        open={dlg === "manual"}
        onOpenChange={close}
      />
      <PartialDialog
        s={s}
        jobId={id}
        open={dlg === "partial"}
        onOpenChange={close}
        onManual={() => setDlg("manual")}
      />
      <FinalDialog jobId={id} open={dlg === "final"} onOpenChange={close} />
      <ReleaseDialog s={s} jobId={id} open={dlg === "release"} onOpenChange={close} />
    </div>
  );
}

/** Proč je doklad zamčený (u vystavené faktury). */
export function LockNotice({
  reason,
  canReopen,
  onReopen,
}: {
  reason: string;
  canReopen: boolean;
  onReopen: () => void;
}) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg bg-subtle p-3 text-sm text-muted"
      data-testid="lock-reason"
    >
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{reason}</p>
      {canReopen && (
        <Button size="sm" variant="ghost" onClick={onReopen}>
          <ReceiptText /> Vrátit do konceptu
        </Button>
      )}
    </div>
  );
}

export const tabs: RecordTab[] = [
  {
    id: "faktury",
    label: "Faktury",
    permission: "fakturace.read",
    group: "fakturace",
    order: 20,
    render: ({ id }) => <JobInvoicesTab id={id} />,
  },
];
export const actions: RecordAction[] = [];
export const pages: ModulePage[] = [];
