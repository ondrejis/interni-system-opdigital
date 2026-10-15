"use client";

import type { BillingModel, ServiceType, SplitRuleInput } from "@rebar/core/contracts";
import {
  Button,
  Checkbox,
  Combobox,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  Input,
  MoneyInput,
  SegmentedControl,
  Slot,
  Textarea,
  successToast,
  useCan,
  useCommandMutation,
  useEntityApi,
  useNav,
  useSlotComponents,
} from "@rebar/ui";
import { useEffect, useState } from "react";
import type { CreatedJob, JobFromDealRow, PrefillRow, TemplateListItem } from "../contract";
import { BILLING_MODEL_LABELS, JOB_TYPES, JOB_TYPE_LABELS, todayPrague } from "../shared";
import { RetainerFields } from "./retainer";
import { useTemplateList } from "./hooks";
import {
  blankRow,
  dateOrderError,
  defaultRetainerForm,
  defaultTitle,
  rowErrors,
  rowsFromPrefill,
  templateChoice,
  templateOptionLabel,
  toApiRows,
  toRetainerSetup,
  type DealRow,
  type RetainerForm,
} from "./logic";
import { CompanyCombobox, UserCombobox, UsersCombobox } from "./parts";

/** Volba šablony: výchozí šablona typu, žádná (prázdná zakázka) nebo konkrétní; archivované se nenabízejí. */
function TemplateSelect({
  type,
  value,
  onChange,
  allowNone,
  templates,
}: {
  type: ServiceType;
  value: string;
  onChange: (v: string) => void;
  allowNone: boolean;
  templates: TemplateListItem[] | undefined;
}) {
  const own = (templates ?? []).filter((t) => t.type === type && !t.archivedAt);
  const def = own.find((t) => t.isDefault);
  return (
    <Combobox
      aria-label="Šablona zakázky"
      options={[
        { value: "__default", label: def ? `Výchozí: ${def.name}` : "Výchozí šablona typu" },
        ...(allowNone ? [{ value: "__none", label: "Bez šablony (prázdná zakázka)" }] : []),
        ...own.map((t) => ({ value: t.id, label: templateOptionLabel(t) })),
      ]}
      value={value}
      onChange={(v) => onChange((v as string | null) ?? "__default")}
      searchPlaceholder="Najít šablonu…"
    />
  );
}

/** Rozdělení plateb: editor od modulu Finance (slot); bez něj platí výchozí z Nastavení → Finance. */
function SplitSlot({
  value,
  onChange,
  type,
  ownerId,
}: {
  value: SplitRuleInput[] | null;
  onChange: (v: SplitRuleInput[] | null) => void;
  type: ServiceType;
  ownerId: string | null;
}) {
  const parts = useSlotComponents("job.create.extras");
  if (!ownerId || parts.length === 0)
    return <p className="text-sm text-muted">Rozdělení plateb se vezme z Nastavení → Finance.</p>;
  return (
    <div className="rounded-lg border border-line p-3" data-testid="create-split">
      <p className="mb-2 text-sm font-medium">Rozdělení příjmů</p>
      <Slot
        name="job.create.extras"
        value={value}
        onChange={onChange}
        type={type}
        ownerId={ownerId}
      />
    </div>
  );
}

/** Předvolby dialogu Nová zakázka (z palety, ze šablony nebo z karty klienta). */
export type CreateJobPreset = {
  type?: ServiceType;
  templateId?: string;
  companyId?: string;
  companyName?: string;
};

/**
 * Dialog „Nová zakázka“ (klávesa C na seznamu): název, klient, typ, šablona, vlastník, členové, začátek a termín;
 * u marketingu volba modelu fakturace (úvodní fáze → retainer / rovnou retainer), cena a rozdělení plateb (slot Financí).
 */
export function CreateJobDialog({
  open,
  onOpenChange,
  preset,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset?: CreateJobPreset;
  onCreated?: (job: { id: string; number: string }) => void;
}) {
  const api = useEntityApi();
  const nav = useNav();
  const can = useCan();
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(preset?.companyId ?? null);
  const [companyName, setCompanyName] = useState<string | null>(preset?.companyName ?? null);
  const [type, setType] = useState<ServiceType>(preset?.type ?? "web");
  const [template, setTemplate] = useState<string>(preset?.templateId ?? "__default");
  const [ownerId, setOwnerId] = useState<string | null>(api.me.id);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string | null>(todayPrague());
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingModel>("intro_then_retainer");
  const [retainer, setRetainer] = useState<RetainerForm>(() => defaultRetainerForm(api.me.id));
  const [price, setPrice] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [split, setSplit] = useState<SplitRuleInput[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const templates = useTemplateList(undefined, false, open);
  const create = useCommandMutation<
    Record<string, unknown>,
    CreatedJob | { id: string; number: string }
  >("zakazky.create");

  // předvyplněný název „{klient} – {typ}“, dokud ho uživatel sám nepřepíše
  useEffect(() => {
    if (!titleTouched && companyName) setTitle(defaultTitle(companyName, type));
  }, [companyName, type, titleTouched]);
  // změna typu zahodí šablonu jiného typu
  useEffect(() => {
    const t = (templates.data ?? []).find((x) => x.id === template);
    if (t && t.type !== type) setTemplate("__default");
  }, [type, template, templates.data]);

  const marketing = type === "marketing";
  const directRetainer = marketing && billing === "retainer";
  const dateError = dateOrderError(startDate, dueDate);
  const missing = !title.trim() || !companyId || !ownerId || !startDate || !!dateError;

  async function submit() {
    setError(null);
    setShowErrors(true);
    if (missing) return;
    const setup = directRetainer ? toRetainerSetup(retainer) : null;
    if (directRetainer && !setup) return;
    try {
      const job = await create.mutateAsync({
        title: title.trim(),
        type,
        companyId,
        ownerId,
        memberIds: memberIds.filter((m) => m !== ownerId),
        startDate,
        ...(dueDate ? { dueDate } : {}),
        ...templateChoice(template),
        ...(marketing ? { billingModel: billing } : {}),
        ...(split ? { split } : {}),
        ...(setup ? { retainer: { ...setup, split: split ?? setup.split } } : {}),
        ...(price !== null && can("finance.read") ? { priceMinor: price } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(isPrivate ? { isPrivate: true } : {}),
      });
      successToast(`Zakázka ${job.number} je založená.`);
      onOpenChange(false);
      if (onCreated) onCreated(job);
      else nav.push(api.hrefFor("job", job.id) ?? "/zakazky");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      {open && (
        <DialogContent
          title="Nová zakázka"
          description="Fáze, úkoly a plánované platby se zkopírují ze šablony."
          className="top-[5vh] w-[min(40rem,calc(100vw-2rem))]"
          data-testid="create-job-dialog"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="max-h-[70vh] space-y-1 overflow-y-auto px-5 py-4">
              <Field
                label="Klient"
                error={showErrors && !companyId ? "Vyberte klienta." : undefined}
              >
                <CompanyCombobox
                  value={companyId}
                  onChange={(id) => {
                    setCompanyId(id);
                    if (!id) return setCompanyName(null);
                    void api
                      .get("company", id)
                      .then((r) => setCompanyName(String(r.row.name ?? "")));
                  }}
                  labels={companyId && companyName ? { [companyId]: companyName } : {}}
                />
              </Field>
              <Field label="Typ zakázky">
                <SegmentedControl
                  label="Typ zakázky"
                  value={type}
                  onChange={setType}
                  options={JOB_TYPES.map((t) => ({ value: t, label: JOB_TYPE_LABELS[t] }))}
                />
              </Field>
              <Field
                label="Název"
                error={showErrors && !title.trim() ? "Vyplňte název." : undefined}
              >
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleTouched(true);
                  }}
                  maxLength={160}
                  autoFocus
                />
              </Field>
              <Field label="Šablona">
                <TemplateSelect
                  type={type}
                  value={template}
                  onChange={setTemplate}
                  allowNone
                  templates={templates.data}
                />
              </Field>
              {marketing && (
                <Field label="Model fakturace">
                  <SegmentedControl
                    label="Model fakturace marketingu"
                    value={billing === "retainer" ? "retainer" : "intro_then_retainer"}
                    onChange={setBilling}
                    options={[
                      {
                        value: "intro_then_retainer",
                        label: BILLING_MODEL_LABELS.intro_then_retainer,
                      },
                      { value: "retainer", label: BILLING_MODEL_LABELS.retainer },
                    ]}
                  />
                </Field>
              )}
              <div className="grid gap-x-3 sm:grid-cols-2">
                <Field
                  label="Vlastník"
                  error={showErrors && !ownerId ? "Vyberte vlastníka." : undefined}
                >
                  <UserCombobox
                    value={ownerId}
                    onChange={setOwnerId}
                    labels={{ [api.me.id]: api.me.name }}
                    aria-label="Vlastník zakázky"
                  />
                </Field>
                <Field label="Členové týmu">
                  <UsersCombobox
                    value={memberIds}
                    onChange={setMemberIds}
                    aria-label="Členové týmu"
                  />
                </Field>
                <Field label="Začátek">
                  <DatePicker value={startDate} onChange={setStartDate} clearable={false} />
                </Field>
                <Field label="Termín" error={dateError ?? undefined}>
                  <DatePicker value={dueDate} onChange={setDueDate} placeholder="Bez termínu" />
                </Field>
              </div>
              {can("finance.read") && !directRetainer && (
                <Field label="Dohodnutá cena">
                  <MoneyInput
                    value={price}
                    onChange={setPrice}
                    aria-label="Dohodnutá cena"
                    placeholder="Bez ceny"
                  />
                </Field>
              )}
              {directRetainer && (
                <div className="rounded-lg border border-line p-3">
                  <p className="mb-2 text-sm font-medium">Retainer</p>
                  <RetainerFields
                    form={retainer}
                    onChange={setRetainer}
                    type={type}
                    ownerId={ownerId}
                    showErrors={showErrors}
                  />
                </div>
              )}
              {!directRetainer && (
                <SplitSlot value={split} onChange={setSplit} type={type} ownerId={ownerId} />
              )}
              <Field label="Popis">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </Field>
              {can("private.read") && (
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={isPrivate}
                    onCheckedChange={(v) => setIsPrivate(v === true)}
                    aria-label="Soukromá zakázka"
                  />
                  Soukromá zakázka (vidíte ji jen vy)
                </label>
              )}
              {error && (
                <p role="alert" className="text-sm text-danger" data-testid="create-job-error">
                  {error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <Button
                variant="ghost"
                disabled={create.isPending}
                onClick={() => onOpenChange(false)}
              >
                Zrušit
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={create.isPending}
                data-testid="create-job-submit"
              >
                Založit zakázku
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

/** Výsledek dialogu „Založit zakázky z obchodu“. */
export type JobsFromDealResult = {
  skipped: boolean;
  created: { id: string; number: string; type: ServiceType }[];
};

/**
 * Dialog „Založit zakázky“ po výhře obchodu (D §2.4): řádek za každou službu obchodu (typ, šablona, název, start, vlastník,
 * členové, rozdělení), řádky jdou upravit, odebrat a přidat; marketing nabízí „Úvodní fáze → retainer“ nebo „Rovnou retainer“.
 * „Přeskočit“ zakázky nezaloží. Potvrzení zavolá `obchody.win` s řádky (nebo vlastní `onSubmit`, kterým volající výhru provede
 * sám); po dokončení `onDone`.
 */
export function JobsFromDealDialog({
  dealId,
  companyId,
  services,
  value,
  ownerId,
  open = true,
  onSubmit,
  onDone,
}: {
  dealId: string;
  companyId: string;
  services: readonly ServiceType[];
  /** Hodnota obchodu v haléřích (předvyplní cenu u jediné služby, R-39). */
  value?: number | null;
  ownerId?: string | null;
  open?: boolean;
  /** Vlastní provedení výhry s řádky (prázdné pole = Přeskočit); bez něj se zavolá `obchody.win`. */
  onSubmit?: (rows: JobFromDealRow[]) => Promise<{ jobs?: CreatedJob[] } | void>;
  onDone: (r: JobsFromDealResult) => void;
}) {
  const api = useEntityApi();
  const can = useCan();
  const [rows, setRows] = useState<DealRow[] | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const templates = useTemplateList(undefined, false, open);
  const win = useCommandMutation<
    { dealId: string; jobs: JobFromDealRow[] },
    { jobs?: CreatedJob[] }
  >("obchody.win");

  useEffect(() => {
    if (!open || rows) return;
    let cancelled = false;
    (async () => {
      const name = await api.get("company", companyId).then(
        (r) => String(r.row.name ?? ""),
        () => null,
      );
      const prefill = await api
        .command<unknown, PrefillRow[]>("zakazky.prefillFromDeal", {
          companyId,
          services: [...services],
          ...(ownerId ? { ownerId } : {}),
          ...(value != null ? { dealValueMinor: value } : {}),
        })
        .catch(() => undefined);
      if (cancelled) return;
      setClientName(name);
      setRows(
        rowsFromPrefill(prefill, { services, clientName: name, ownerId: ownerId ?? api.me.id }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, rows, api, companyId, services, ownerId, value]);

  const set = (key: string, patch: Partial<DealRow>) =>
    setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? rs);

  async function run(payload: JobFromDealRow[]) {
    setBusy(true);
    setError(null);
    try {
      const res = onSubmit
        ? await onSubmit(payload)
        : await win.mutateAsync({ dealId, jobs: payload });
      const created = (res && "jobs" in res && res.jobs) || [];
      if (payload.length) successToast(`Založeno zakázek: ${created.length || payload.length}.`);
      onDone({ skipped: payload.length === 0, created });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    setShowErrors(true);
    if (!rows || rows.some((r) => rowErrors(r).length)) return;
    void run(toApiRows(rows));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && void run([])}>
      {open && (
        <DialogContent
          title="Založit zakázky"
          description="Pro každou službu obchodu založíme zakázku ze šablony. Řádky můžete upravit, odebrat nebo přidat."
          className="top-[4vh] w-[min(52rem,calc(100vw-2rem))]"
          data-testid="jobs-from-deal-dialog"
        >
          <div className="max-h-[72vh] space-y-3 overflow-y-auto px-5 py-4">
            {!rows ? (
              <p className="text-muted">Načítám předvyplnění…</p>
            ) : (
              rows.map((r, i) => {
                const errs = showErrors ? rowErrors(r) : [];
                return (
                  <fieldset
                    key={r.key}
                    className="space-y-1 rounded-lg border border-line p-3"
                    data-testid="deal-row"
                    data-type={r.type}
                  >
                    <legend className="px-1 text-sm font-semibold">Zakázka {i + 1}</legend>
                    <div className="grid gap-x-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                      <Field label="Typ">
                        <Combobox
                          aria-label={`Typ zakázky ${i + 1}`}
                          options={JOB_TYPES.map((t) => ({ value: t, label: JOB_TYPE_LABELS[t] }))}
                          value={r.type}
                          onChange={(v) => {
                            const t = v as ServiceType;
                            set(r.key, {
                              type: t,
                              templateId: null,
                              billingModel: blankRow(t, {}).billingModel,
                              title:
                                r.title === defaultTitle(clientName, r.type)
                                  ? defaultTitle(clientName, t)
                                  : r.title,
                            });
                          }}
                        />
                      </Field>
                      <Field label="Název">
                        <Input
                          value={r.title}
                          onChange={(e) => set(r.key, { title: e.target.value })}
                          aria-label={`Název zakázky ${i + 1}`}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                      <Field label="Šablona">
                        <TemplateSelect
                          type={r.type}
                          value={r.templateId ?? "__default"}
                          onChange={(v) => set(r.key, { templateId: v === "__default" ? null : v })}
                          allowNone={false}
                          templates={templates.data}
                        />
                      </Field>
                      <Field label="Začátek">
                        <DatePicker
                          value={r.startDate}
                          onChange={(v) => v && set(r.key, { startDate: v })}
                          clearable={false}
                        />
                      </Field>
                      <Field label="Vlastník">
                        <UserCombobox
                          value={r.ownerId}
                          onChange={(v) => set(r.key, { ownerId: v })}
                          labels={{ [api.me.id]: api.me.name }}
                          aria-label={`Vlastník zakázky ${i + 1}`}
                        />
                      </Field>
                      <Field label="Členové týmu">
                        <UsersCombobox
                          value={r.memberIds}
                          onChange={(v) => set(r.key, { memberIds: v })}
                          aria-label={`Členové zakázky ${i + 1}`}
                        />
                      </Field>
                    </div>
                    {r.type === "marketing" && (
                      <Field label="Model fakturace">
                        <SegmentedControl
                          label={`Model fakturace zakázky ${i + 1}`}
                          value={r.billingModel === "retainer" ? "retainer" : "intro_then_retainer"}
                          onChange={(v) => set(r.key, { billingModel: v })}
                          options={[
                            {
                              value: "intro_then_retainer",
                              label: BILLING_MODEL_LABELS.intro_then_retainer,
                            },
                            { value: "retainer", label: BILLING_MODEL_LABELS.retainer },
                          ]}
                        />
                      </Field>
                    )}
                    {r.type === "marketing" && r.billingModel === "retainer" ? (
                      <div className="rounded-lg border border-line p-3">
                        <p className="mb-2 text-sm font-medium">Retainer</p>
                        <RetainerFields
                          form={r.retainer}
                          onChange={(retainer) => set(r.key, { retainer, split: retainer.split })}
                          type={r.type}
                          ownerId={r.ownerId}
                          showErrors={showErrors}
                        />
                      </div>
                    ) : (
                      <SplitSlot
                        value={r.split}
                        onChange={(split) => set(r.key, { split })}
                        type={r.type}
                        ownerId={r.ownerId}
                      />
                    )}
                    {errs.length > 0 && (
                      <p role="alert" className="text-sm text-danger">
                        {errs.join(" ")}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRows((rs) => rs?.filter((x) => x.key !== r.key) ?? rs)}
                        aria-label={`Odebrat zakázku ${i + 1}`}
                      >
                        Odebrat řádek
                      </Button>
                    </div>
                  </fieldset>
                );
              })
            )}
            {rows && rows.length < 10 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted">Přidat další zakázku:</span>
                {JOB_TYPES.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    onClick={() =>
                      setRows((rs) => [
                        ...(rs ?? []),
                        blankRow(t, { clientName, ownerId: ownerId ?? api.me.id }),
                      ])
                    }
                  >
                    + {JOB_TYPE_LABELS[t]}
                  </Button>
                ))}
              </div>
            )}
            {!can("zakazky.create") && (
              <p role="alert" className="text-sm text-danger">
                Nemáte oprávnění zakládat zakázky.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-between gap-2 px-5 py-4">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run([])}
              data-testid="deal-skip"
            >
              Přeskočit
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!rows || rows.length === 0 || !can("zakazky.create")}
              onClick={confirm}
              data-testid="deal-confirm"
            >
              Založit zakázky{rows ? ` (${rows.length})` : ""}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
