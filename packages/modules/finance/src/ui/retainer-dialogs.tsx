"use client";

import type { SplitRuleInput } from "@rebar/core/contracts";
import {
  Button,
  Dialog,
  DialogContent,
  Field,
  Input,
  MoneyInput,
  Notice,
  SegmentedControl,
  successToast,
  useCan,
  useCommandQuery,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { useMemo, useState } from "react";
import type {
  RetainerEndPreview,
  RetainerEndResult,
  RetainerView,
  SplitRuleView,
} from "../contract";
import { monthName, money, thisMonth, useToastMutation, useUsers } from "./common";
import { UserSelect } from "./controls";
import { SplitEditor } from "./split-editor";
import { blocking, ruleIssues } from "./split-logic";

/*
  Dialogy retaineru (ZAK-14, ZAK-17, FIN-20): Pokračovat na retainer (částka, od měsíce, den vystavení, kdo fakturuje:
  pořád stejný, nebo střídavě; rozdělení), Změnit retainer od měsíce a Ukončit k měsíci (s dopadem na plánované platby).
*/

const nextMonth = (): string => {
  const [y, m] = thisMonth().split("-").map(Number) as [number, number];
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Pravidla zakázky přepsaná na druh „retainer“ (pro předvyplnění). */
export function retainerRulesFrom(
  rules: readonly (SplitRuleView | SplitRuleInput)[],
): SplitRuleInput[] {
  return rules
    .filter((r) => r.appliesTo === "all" || r.appliesTo === "retainer")
    .map((r) => ({
      userId: r.userId,
      mode: r.mode,
      ...(r.percent !== undefined ? { percent: r.percent } : {}),
      ...(r.fixedMinor !== undefined ? { fixedMinor: r.fixedMinor } : {}),
      appliesTo: "retainer" as const,
      validFrom: null,
      validTo: null,
    }))
    .filter((r) => r.mode === "percent");
}

type SetupState = {
  amount: number | null;
  fromMonth: string;
  issueDay: number;
  mode: "fixed" | "alternate";
  issuerId: string;
  split: SplitRuleInput[] | null;
};

function SetupFields({
  s,
  set,
  showErrors,
  monthLabel,
  withSplit,
}: {
  s: SetupState;
  set: (p: Partial<SetupState>) => void;
  showErrors: boolean;
  monthLabel: string;
  withSplit: boolean;
}) {
  const issues = useMemo(() => (s.split ? ruleIssues(s.split) : []), [s.split]);
  return (
    <div className="space-y-1" data-testid="retainer-form">
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field
          label="Měsíční částka"
          error={showErrors && (!s.amount || s.amount <= 0) ? "Zadejte částku." : undefined}
        >
          <MoneyInput
            value={s.amount}
            onChange={(v) => set({ amount: v })}
            aria-label="Měsíční částka retaineru"
            placeholder="15 000"
          />
        </Field>
        <Field
          label={monthLabel}
          hint={/^\d{4}-\d{2}$/.test(s.fromMonth) ? monthName(s.fromMonth) : undefined}
        >
          <Input
            type="month"
            value={s.fromMonth}
            onChange={(e) => set({ fromMonth: e.target.value })}
            aria-label={monthLabel}
          />
        </Field>
        <Field
          label="Den vystavení faktury (1–28)"
          error={showErrors && (s.issueDay < 1 || s.issueDay > 28) ? "Den 1–28." : undefined}
        >
          <Input
            type="number"
            min={1}
            max={28}
            value={s.issueDay}
            onChange={(e) => set({ issueDay: Number(e.target.value) })}
            aria-label="Den vystavení faktury"
          />
        </Field>
        <Field label="Kdo fakturuje">
          <div className="space-y-2">
            <SegmentedControl
              label="Způsob fakturace retaineru"
              value={s.mode}
              onChange={(v) => set({ mode: v })}
              options={[
                { value: "fixed", label: "Pořád stejný" },
                { value: "alternate", label: "Střídavě" },
              ]}
            />
            <UserSelect
              aria-label={s.mode === "alternate" ? "Kdo fakturuje první" : "Kdo fakturuje"}
              value={s.issuerId}
              onChange={(id) => set({ issuerId: id })}
            />
          </div>
        </Field>
      </div>
      {withSplit && (
        <div className="rounded-lg border border-line p-3">
          <p className="mb-2 text-sm font-medium">Rozdělení příjmů z retaineru</p>
          <SplitEditor
            value={s.split}
            onChange={(split) => set({ split })}
            issuerId={s.issuerId}
            previewKind="retainer"
            allowDefault
          />
          {blocking(issues) && showErrors && (
            <p className="mt-1 text-sm text-danger">Opravte pravidla rozdělení.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Okno „Pokračovat na retainer“ (po vyhodnocení úvodní fáze nebo rovnou). */
export function RetainerContinueDialog({
  jobId,
  rules,
  onClose,
}: {
  jobId: string;
  rules?: readonly SplitRuleView[] | undefined;
  onClose: () => void;
}) {
  const api = useEntityApi();
  const can = useCan();
  const users = useUsers();
  const initialSplit = rules && rules.length > 0 ? retainerRulesFrom(rules) : null;
  const [s, setS] = useState<SetupState>({
    amount: null,
    fromMonth: nextMonth(),
    issueDay: 1,
    mode: "alternate",
    issuerId: api.me.id,
    split: initialSplit && initialSplit.length > 0 ? initialSplit : null,
  });
  const [showErrors, setShowErrors] = useState(false);
  const m = useToastMutation("finance.retainer.continue", {
    success: "Zakázka pokračuje jako retainer.",
    onOk: onClose,
  });
  const set = (p: Partial<SetupState>) => setS((x) => ({ ...x, ...p }));

  function submit() {
    setShowErrors(true);
    if (
      !s.amount ||
      s.amount <= 0 ||
      s.issueDay < 1 ||
      s.issueDay > 28 ||
      !/^\d{4}-\d{2}$/.test(s.fromMonth)
    )
      return;
    if (s.split && blocking(ruleIssues(s.split))) return;
    const other = users.find((u) => u.value !== s.issuerId)?.value ?? s.issuerId;
    m.run({
      jobId,
      amountMinor: s.amount,
      fromMonth: s.fromMonth,
      issueDay: s.issueDay,
      issuerMode: s.mode,
      // střídavě: `firstIssuerId` začíná, `issuerId` je druhý v pořadí
      issuerId: s.mode === "alternate" ? other : s.issuerId,
      ...(s.mode === "alternate" ? { firstIssuerId: s.issuerId } : {}),
      ...(s.split && can("finance.splits_edit") ? { split: s.split } : {}),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !m.pending && onClose()}>
      <DialogContent
        title="Pokračovat na retainer"
        description="Každý měsíc se založí plánovaná platba i s rozdělením."
        className="w-[min(40rem,calc(100vw-2rem))]"
        data-testid="retainer-continue-dialog"
      >
        <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
          <SetupFields
            s={s}
            set={set}
            showErrors={showErrors}
            monthLabel="Od měsíce"
            withSplit={can("finance.splits_edit")}
          />
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <Button variant="ghost" onClick={onClose} disabled={m.pending}>
            Zrušit
          </Button>
          <Button
            variant="primary"
            loading={m.pending}
            onClick={submit}
            data-testid="retainer-confirm"
          >
            Pokračovat na retainer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Okno „Změnit retainer“ od zvoleného měsíce (minulost se nepřepočítává). */
export function RetainerChangeDialog({
  retainer,
  rules,
  onClose,
}: {
  retainer: RetainerView;
  rules: readonly SplitRuleView[];
  onClose: () => void;
}) {
  const can = useCan();
  const users = useUsers();
  const [s, setS] = useState<SetupState>({
    amount: retainer.amountMinor,
    fromMonth: thisMonth() > retainer.fromMonth ? thisMonth() : retainer.fromMonth,
    issueDay: retainer.issueDay,
    mode: retainer.issuerMode,
    issuerId:
      retainer.issuerMode === "alternate"
        ? (retainer.firstIssuerId ?? retainer.issuerId)
        : retainer.issuerId,
    split: null,
  });
  const [changeSplit, setChangeSplit] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const m = useToastMutation<Record<string, unknown>, { updatedPayments: number }>(
    "finance.retainer.change",
    {
      success: (r) => `Retainer změněn, upraveno plateb: ${r.updatedPayments}.`,
      onOk: onClose,
    },
  );
  const set = (p: Partial<SetupState>) => setS((x) => ({ ...x, ...p }));

  function submit() {
    setShowErrors(true);
    if (!s.amount || s.amount <= 0 || !/^\d{4}-\d{2}$/.test(s.fromMonth)) return;
    if (changeSplit && s.split && blocking(ruleIssues(s.split))) return;
    const other = users.find((u) => u.value !== s.issuerId)?.value ?? s.issuerId;
    m.run({
      jobId: retainer.jobId,
      effectiveFrom: s.fromMonth,
      amountMinor: s.amount,
      issueDay: s.issueDay,
      issuerMode: s.mode,
      issuerId: s.mode === "alternate" ? other : s.issuerId,
      firstIssuerId: s.mode === "alternate" ? s.issuerId : null,
      ...(changeSplit && s.split ? { split: s.split } : {}),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !m.pending && onClose()}>
      <DialogContent
        title="Změnit retainer"
        description="Změna platí od zvoleného měsíce; dřívější platby se nepřepočítají."
        className="w-[min(40rem,calc(100vw-2rem))]"
        data-testid="retainer-change-dialog"
      >
        <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
          <SetupFields
            s={s}
            set={set}
            showErrors={showErrors}
            monthLabel="Platí od měsíce"
            withSplit={false}
          />
          {can("finance.splits_edit") && (
            <div className="mt-2 rounded-lg border border-line p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={changeSplit}
                  onChange={(e) => {
                    setChangeSplit(e.target.checked);
                    if (e.target.checked && !s.split)
                      set({
                        split: retainerRulesFrom(rules).map((r) => ({
                          ...r,
                          validFrom: s.fromMonth,
                        })),
                      });
                  }}
                />
                Změnit i rozdělení od tohoto měsíce
              </label>
              {changeSplit && (
                <div className="mt-2">
                  <SplitEditor
                    value={s.split ?? []}
                    onChange={(split) => set({ split })}
                    issuerId={s.issuerId}
                    previewKind="retainer"
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <Button variant="ghost" onClick={onClose} disabled={m.pending}>
            Zrušit
          </Button>
          <Button
            variant="primary"
            loading={m.pending}
            onClick={submit}
            data-testid="retainer-change-confirm"
          >
            Uložit změnu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Okno „Ukončit“ retainer k měsíci; bez retaineru jen ukončí zakázku po vyhodnocení úvodní fáze. */
export function RetainerEndDialog({
  jobId,
  retainer,
  companyId,
  onClose,
}: {
  jobId: string;
  retainer: RetainerView | null;
  companyId?: string | null | undefined;
  onClose: () => void;
}) {
  const nav = useNav();
  const [endMonth, setEndMonth] = useState(thisMonth());
  const valid = /^\d{4}-\d{2}$/.test(endMonth);
  const preview = useCommandQuery<RetainerEndPreview, { jobId: string; endMonth: string }>(
    "finance.retainer.endPreview",
    { jobId, endMonth },
    { enabled: !!retainer && valid },
  );
  const [result, setResult] = useState<RetainerEndResult | null>(null);
  const m = useToastMutation<Record<string, unknown>, RetainerEndResult>("finance.retainer.end", {
    onOk: (r) => {
      successToast(retainer ? "Retainer ukončen." : "Zakázka ukončena.");
      if (r.completed && !r.completed.clientHasOtherActiveJob && companyId) setResult(r);
      else onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !m.pending && onClose()}>
      <DialogContent
        title={retainer ? "Ukončit retainer" : "Ukončit zakázku"}
        description={
          retainer
            ? "Budoucí plánované platby po zvoleném měsíci se zruší."
            : "Marketingová spolupráce po úvodní fázi nepokračuje a zakázka se dokončí."
        }
        data-testid="retainer-end-dialog"
      >
        {result ? (
          <div className="space-y-3 px-5 py-4">
            <Notice tone="info" title="Klient nemá jinou aktivní zakázku">
              Zvažte nastavení stavu klienta na Bývalý (zeptáme se na důvod a datum ukončení).
            </Notice>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Později
              </Button>
              <Button variant="primary" onClick={() => nav.push(`/kontakty/firmy/${companyId}`)}>
                Otevřít kartu klienta
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2 px-5 py-4">
              {retainer && (
                <>
                  <Field
                    label="Poslední měsíc retaineru"
                    hint={valid ? monthName(endMonth) : undefined}
                  >
                    <Input
                      type="month"
                      value={endMonth}
                      min={retainer.fromMonth}
                      onChange={(e) => setEndMonth(e.target.value)}
                      aria-label="Ukončit k měsíci"
                    />
                  </Field>
                  {preview.data && (
                    <div
                      className="space-y-2 text-sm"
                      data-testid="retainer-end-preview"
                      aria-live="polite"
                    >
                      <p className={preview.data.cancel.length ? "font-medium" : "text-muted"}>
                        {preview.data.cancel.length
                          ? `Zruší se ${preview.data.cancel.length} plánovaných plateb (${money(preview.data.cancel.reduce((a, p) => a + p.amountMinor, 0))}):`
                          : "Žádná plánovaná platba se nezruší."}
                      </p>
                      {preview.data.cancel.length > 0 && (
                        <ul className="list-disc pl-5 text-muted">
                          {preview.data.cancel.map((p) => (
                            <li key={p.id}>
                              {p.description} · {money(p.amountMinor)}
                            </li>
                          ))}
                        </ul>
                      )}
                      {preview.data.kept.length > 0 && (
                        <p className="text-warning">
                          {preview.data.kept.length} plateb po tomto měsíci už je vystavených nebo
                          zaplacených a zůstanou: vyřešte je ručně.
                        </p>
                      )}
                      {preview.data.closesJobNow && (
                        <p className="text-muted">Zakázka se hned dokončí.</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <Button variant="ghost" onClick={onClose} disabled={m.pending}>
                Zpět
              </Button>
              <Button
                variant="danger"
                loading={m.pending}
                disabled={!!retainer && !valid}
                onClick={() =>
                  m.run({
                    jobId,
                    ...(retainer ? { endMonth } : {}),
                    cancelPlanned: true,
                    closeJob: true,
                  })
                }
                data-testid="retainer-end-confirm"
              >
                {retainer ? "Ukončit retainer" : "Ukončit zakázku"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
