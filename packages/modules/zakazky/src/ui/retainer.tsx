"use client";

import type { ServiceType } from "@rebar/core/contracts";
import {
  Button,
  Dialog,
  DialogContent,
  Field,
  Input,
  MoneyInput,
  SegmentedControl,
  Slot,
  successToast,
  useEntityApi,
  useCommandMutation,
  useSlotComponents,
} from "@rebar/ui";
import { useState } from "react";
import { useModuleEnabled } from "./hooks";
import {
  defaultRetainerForm,
  monthLabel,
  retainerErrors,
  toRetainerContinueInput,
  type RetainerForm,
} from "./logic";
import { UserCombobox } from "./parts";

/** Pole nastavení retaineru: částka, od kdy, den vystavení, kdo fakturuje a rozdělení (R-36, ZAK-14). */
export function RetainerFields({
  form,
  onChange,
  type,
  ownerId,
  labels,
  showErrors,
}: {
  form: RetainerForm;
  onChange: (f: RetainerForm) => void;
  type: ServiceType;
  ownerId: string | null;
  labels?: Record<string, string>;
  showErrors?: boolean;
}) {
  const errors = showErrors ? retainerErrors(form) : {};
  const splitEditors = useSlotComponents("job.create.extras");
  const set = (patch: Partial<RetainerForm>) => onChange({ ...form, ...patch });
  const splitOwner = form.issuerId ?? ownerId;
  return (
    <div className="space-y-1" data-testid="retainer-fields">
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Měsíční částka" error={errors.amount}>
          <MoneyInput
            value={form.amountMinor}
            onChange={(v) => set({ amountMinor: v })}
            aria-label="Měsíční částka retaineru"
            placeholder="15 000"
          />
        </Field>
        <Field
          label="Od měsíce"
          error={errors.fromMonth}
          hint={/^\d{4}-\d{2}$/.test(form.fromMonth) ? monthLabel(form.fromMonth) : undefined}
        >
          <Input
            type="month"
            value={form.fromMonth}
            onChange={(e) => set({ fromMonth: e.target.value })}
            aria-label="Retainer od měsíce"
          />
        </Field>
        <Field label="Den vystavení faktury (1–28)" error={errors.issueDay}>
          <Input
            type="number"
            min={1}
            max={28}
            value={form.issueDay}
            onChange={(e) => set({ issueDay: Number(e.target.value) })}
            aria-label="Den vystavení faktury"
          />
        </Field>
        <Field label="Kdo fakturuje" error={errors.issuer}>
          <div className="space-y-2">
            <SegmentedControl
              label="Způsob fakturace retaineru"
              value={form.issuerMode}
              onChange={(v) => set({ issuerMode: v })}
              options={[
                { value: "fixed", label: "Stále stejný" },
                { value: "alternate", label: "Střídavě" },
              ]}
            />
            <UserCombobox
              value={form.issuerId}
              onChange={(v) => set({ issuerId: v })}
              {...(labels ? { labels } : {})}
              placeholder={
                form.issuerMode === "alternate" ? "Kdo fakturuje první…" : "Kdo fakturuje…"
              }
              aria-label={form.issuerMode === "alternate" ? "První fakturující" : "Fakturující"}
            />
          </div>
        </Field>
      </div>
      {splitOwner && splitEditors.length > 0 ? (
        <div className="rounded-lg border border-line p-3" data-testid="retainer-split">
          <p className="mb-2 text-sm font-medium">Rozdělení příjmů z retaineru</p>
          <Slot
            name="job.create.extras"
            value={form.split}
            onChange={(split) => set({ split })}
            type={type}
            ownerId={splitOwner}
          />
        </div>
      ) : (
        <p className="text-sm text-muted">Rozdělení se vezme z Nastavení → Finance.</p>
      )}
    </div>
  );
}

/**
 * Okno „Pokračovat na retainer“ po vyhodnocení úvodní fáze marketingu: nastaví částku, měsíc, den vystavení,
 * fakturujícího a rozdělení a zavolá službu financí; ta zakázku přesune do fáze Retainer (`setMarketingStage`).
 */
export function RetainerDialog({
  jobId,
  ownerId,
  labels,
  open,
  onOpenChange,
}: {
  jobId: string;
  ownerId: string | null;
  labels?: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState<RetainerForm>(() => defaultRetainerForm(ownerId));
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useEntityApi();
  const run = useCommandMutation<NonNullable<ReturnType<typeof toRetainerContinueInput>>>(
    "finance.retainer.continue",
  );
  const financeOn = useModuleEnabled("finance");

  async function submit() {
    setError(null);
    try {
      // střídání: druhý v pořadí je jiný uživatel než ten, kdo fakturuje první měsíc
      const users = form.issuerMode === "alternate" ? await api.lookups.users("") : [];
      const other = users.find((u) => u.value !== form.issuerId)?.value ?? null;
      const input = toRetainerContinueInput(jobId, form, other);
      if (!input) return setShowErrors(true);
      await run.mutateAsync(input);
      successToast("Zakázka pokračuje jako retainer.");
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !run.isPending && onOpenChange(o)}>
      {open && (
        <DialogContent
          title="Pokračovat na retainer"
          description="Nastavte měsíční platbu. Každý měsíc se založí plánovaná platba i s rozdělením."
          className="top-[8vh] w-[min(36rem,calc(100vw-2rem))]"
          data-testid="retainer-dialog"
        >
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            {!financeOn && (
              <p role="alert" className="mb-3 rounded-md bg-warning-soft p-3 text-sm text-warning">
                Retainer vyžaduje zapnutý modul Finance.
              </p>
            )}
            <RetainerFields
              form={form}
              onChange={setForm}
              type="marketing"
              ownerId={ownerId}
              {...(labels ? { labels } : {})}
              showErrors={showErrors}
            />
            {error && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-4">
            <Button variant="ghost" disabled={run.isPending} onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button
              variant="primary"
              loading={run.isPending}
              disabled={!financeOn}
              onClick={() => void submit()}
              data-testid="retainer-confirm"
            >
              Pokračovat na retainer
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
