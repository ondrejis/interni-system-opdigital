"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import { addDaysIso, eachDayIso, todayIso, weekStartIso } from "@rebar/core/time";
import {
  Button,
  Checkbox,
  Chip,
  Combobox,
  ConfirmDialog,
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
import { ChevronLeft, ChevronRight, Plus, Trash2, Truck } from "lucide-react";
import { FleetTerminalWidget } from "./terminal-ui";
import { useState, type ReactNode } from "react";
import {
  ASSET_STATUSES,
  SERVICE_KINDS,
  formatMeter,
  kindLabel,
  meterUnit,
  type Tone,
} from "./fleet";

/* ---------- společné ---------- */

/**
 * Potvrzení smazání dialogem místo nativního `confirm`: `ask(id, věta)` dialog otevře, potvrzení zavolá mutaci.
 * Chybu mutace ukáže `<Err>` v místě použití, dialog se po potvrzení vždy zavře.
 */
function useConfirmDelete(
  del: { mutateAsync: (input: { id: string }) => Promise<unknown> },
  cfg: { title: string; confirmLabel: string; cancelLabel?: string },
) {
  const [target, setTarget] = useState<{ id: string; text: string } | null>(null);
  return {
    ask: (id: string, text: string) => setTarget({ id, text }),
    dialog: (
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={cfg.title}
        confirmLabel={cfg.confirmLabel}
        {...(cfg.cancelLabel ? { cancelLabel: cfg.cancelLabel } : {})}
        danger
        onConfirm={() =>
          del.mutateAsync({ id: target!.id }).then(
            () => undefined,
            () => undefined,
          )
        }
      >
        {target?.text}
      </ConfirmDialog>
    ),
  };
}

type AssetOption = {
  id: string;
  name: string;
  kind: string;
  plate: string | null;
  meter: string;
  meterValue: string;
  fuel: string;
  status: string;
  tankLiters: number | null;
  responsibleId: string | null;
};
type Options = { assets: AssetOption[]; me: { id: string | null; canManage: boolean } };

const useOptions = () => useCommandQuery<Options>("stroje.options", {});

function Err({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error.message}
    </p>
  ) : null;
}

const th = "px-3 py-2 font-medium";
const tabular = "tabular text-right";

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

const TabBody = ({ children }: { children: ReactNode }) => (
  <div className="space-y-4">{children}</div>
);

const toneColor = (t: Tone | string) =>
  t === "overdue" ? "red" : t === "soon" ? "orange" : t === "ok" ? "green" : "gray";
const statusOf = (v: string) => ASSET_STATUSES.find((s) => s.value === v);

const decimal = (v: string) => v.replace(/[^\d.,]/g, "");
const toNumber = (v: string): number | null => {
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const monthOf = (d: string) => d.slice(0, 7);
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const monthLabel = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** Výběr stroje ve formuláři; s `fixed` se nezobrazí. */
function AssetField({
  assets,
  value,
  onChange,
  fixed,
}: {
  assets: AssetOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  fixed?: boolean;
}) {
  if (fixed) return null;
  return (
    <Field label="Stroj nebo vozidlo">
      <Combobox
        options={assets.map((a) => ({
          value: a.id,
          label: a.name,
          ...(a.plate ? { hint: a.plate } : {}),
        }))}
        value={value}
        onChange={(v) => onChange(v as string | null)}
        aria-label="Stroj"
        placeholder="Vyberte stroj"
      />
    </Field>
  );
}

function Actions({
  onClose,
  loading,
  label,
  error,
}: {
  onClose: () => void;
  loading: boolean;
  label: string;
  error: Error | null;
}) {
  return (
    <>
      <Err error={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Zrušit
        </Button>
        <Button type="submit" variant="primary" loading={loading}>
          {label}
        </Button>
      </div>
    </>
  );
}

/* ---------- zápis jízdy / provozu ---------- */

export function LogForm({
  assetId: fixed,
  onDone,
}: {
  assetId?: string | undefined;
  onDone: () => void;
}) {
  const api = useEntityApi();
  const hasJobs = useModuleUi().has("zakazky");
  const opts = useOptions();
  const [assetId, setAssetId] = useState<string | null>(fixed ?? null);
  const [date, setDate] = useState<string | null>(todayIso());
  const [mode, setMode] = useState<"meter" | "amount">("meter");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [route, setRoute] = useState("");
  const [purpose, setPurpose] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [priv, setPriv] = useState(false);
  const [driver, setDriver] = useState<string | null>(null);
  const last = useCommandQuery<{ meterValue: string; lastRoute: string | null }>(
    "stroje.lastMeter",
    { assetId },
    { enabled: !!assetId },
  );
  const save = useCommandMutation<Record<string, unknown>, { amount: string }>("stroje.log.save", {
    onSuccess: (r) => {
      successToast(`Zapsáno: ${r.amount.replace(".", ",")}`);
      onDone();
    },
  });
  if (opts.isLoading || !opts.data) return <Skeleton className="m-5 h-48" />;
  const a = opts.data.assets.find((x) => x.id === assetId);
  const unit = a ? meterUnit(a.meter) : "km";
  const startShown = start !== "" ? start : last.data ? String(Number(last.data.meterValue)) : "";
  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          assetId,
          date,
          ...(mode === "meter"
            ? { meterStart: toNumber(startShown), meterEnd: toNumber(end) }
            : { amount: toNumber(amount) }),
          route: route || null,
          purpose: purpose || null,
          jobId: priv ? null : jobId,
          private: priv,
          ...(driver ? { userId: driver } : {}),
        });
      }}
    >
      <AssetField assets={opts.data.assets} value={assetId} onChange={setAssetId} fixed={!!fixed} />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Datum">
          <DatePicker value={date} onChange={setDate} clearable={false} />
        </Field>
        {opts.data.me.canManage && (
          <Field label="Řidič / obsluha" hint="Ponechte prázdné pro sebe.">
            <Combobox
              load={(s) => api.lookups.users(s)}
              value={driver}
              onChange={(v) => setDriver(v as string | null)}
              aria-label="Řidič"
              placeholder="Já"
              clearable
            />
          </Field>
        )}
      </div>
      <div
        className="flex gap-1 rounded-md border border-line-strong p-0.5"
        role="group"
        aria-label="Zadání vzdálenosti"
      >
        {(["meter", "amount"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded px-3 py-1.5 font-medium",
              mode === m ? "bg-accent text-accent-fg" : "text-muted hover:bg-hover",
            )}
          >
            {m === "meter"
              ? "Stav tachometru od – do"
              : unit === "mth"
                ? "Počet motohodin"
                : "Počet km"}
          </button>
        ))}
      </div>
      {mode === "meter" ? (
        <div className="grid grid-cols-2 gap-x-3">
          <Field label={`Počáteční stav (${unit})`} htmlFor="log-start">
            <Input
              id="log-start"
              inputMode="decimal"
              value={startShown}
              onChange={(e) => setStart(decimal(e.target.value))}
            />
          </Field>
          <Field label={`Konečný stav (${unit})`} htmlFor="log-end">
            <Input
              id="log-end"
              inputMode="decimal"
              value={end}
              onChange={(e) => setEnd(decimal(e.target.value))}
            />
          </Field>
        </div>
      ) : (
        <Field label={unit === "mth" ? "Odpracováno (mth)" : "Ujeto (km)"} htmlFor="log-amount">
          <Input
            id="log-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(decimal(e.target.value))}
          />
        </Field>
      )}
      <Field
        label="Trasa"
        htmlFor="log-route"
        hint={last.data?.lastRoute ? `Naposledy: ${last.data.lastRoute}` : ""}
      >
        <Input id="log-route" value={route} onChange={(e) => setRoute(e.target.value)} />
      </Field>
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox checked={priv} onCheckedChange={(v) => setPriv(!!v)} /> Soukromá jízda
      </label>
      {!priv && (
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Účel" htmlFor="log-purpose">
            <Input id="log-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </Field>
          {hasJobs && (
            <Field label="Zakázka">
              <Combobox
                load={(s) => api.lookups.records("job", s)}
                value={jobId}
                onChange={(v) => setJobId(v as string | null)}
                aria-label="Zakázka"
                placeholder="Bez zakázky"
                clearable
              />
            </Field>
          )}
        </div>
      )}
      <Actions onClose={onDone} loading={save.isPending} label="Zapsat" error={save.error} />
    </form>
  );
}

/* ---------- tankování ---------- */

export function FuelForm({
  assetId: fixed,
  onDone,
}: {
  assetId?: string | undefined;
  onDone: () => void;
}) {
  const api = useEntityApi();
  const hasJobs = useModuleUi().has("zakazky");
  const opts = useOptions();
  const [assetId, setAssetId] = useState<string | null>(fixed ?? null);
  const [date, setDate] = useState<string | null>(todayIso());
  const [liters, setLiters] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [meterValue, setMeterValue] = useState("");
  const [full, setFull] = useState(true);
  const [station, setStation] = useState("");
  const [payment, setPayment] = useState<"card" | "cash">("card");
  const [jobId, setJobId] = useState<string | null>(null);
  const last = useCommandQuery<{ meterValue: string }>(
    "stroje.lastMeter",
    { assetId },
    { enabled: !!assetId },
  );
  const save = useCommandMutation<Record<string, unknown>, { consumption: number | null }>(
    "stroje.fuel.save",
    {
      onSuccess: (r) => {
        successToast(
          r.consumption
            ? `Tankování zapsáno, spotřeba ${r.consumption.toFixed(1).replace(".", ",")}.`
            : "Tankování zapsáno.",
        );
        onDone();
      },
    },
  );
  if (opts.isLoading || !opts.data) return <Skeleton className="m-5 h-48" />;
  const a = opts.data.assets.find((x) => x.id === assetId);
  const meterShown =
    meterValue !== "" ? meterValue : last.data ? String(Number(last.data.meterValue)) : "";
  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          assetId,
          date,
          liters: toNumber(liters),
          totalMinor: total,
          meterValue: toNumber(meterShown),
          fullTank: full,
          station: station || null,
          payment,
          jobId,
        });
      }}
    >
      <AssetField assets={opts.data.assets} value={assetId} onChange={setAssetId} fixed={!!fixed} />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Datum">
          <DatePicker value={date} onChange={setDate} clearable={false} />
        </Field>
        <Field
          label={`Stav ${a?.meter === "mth" ? "motohodin" : "tachometru"}`}
          htmlFor="fuel-meter"
        >
          <Input
            id="fuel-meter"
            inputMode="decimal"
            value={meterShown}
            onChange={(e) => setMeterValue(decimal(e.target.value))}
          />
        </Field>
        <Field label="Litrů" htmlFor="fuel-liters">
          <Input
            id="fuel-liters"
            inputMode="decimal"
            value={liters}
            onChange={(e) => setLiters(decimal(e.target.value))}
          />
        </Field>
        <Field label="Částka z účtenky (s DPH)">
          <MoneyInput aria-label="Částka z účtenky" value={total} onChange={setTotal} />
        </Field>
        <Field label="Čerpací stanice" htmlFor="fuel-station">
          <Input id="fuel-station" value={station} onChange={(e) => setStation(e.target.value)} />
        </Field>
        <Field label="Platba">
          <Combobox
            options={[
              { value: "card", label: "Firemní karta" },
              { value: "cash", label: "Hotově" },
            ]}
            value={payment}
            onChange={(v) => v && setPayment(v as "card" | "cash")}
            aria-label="Platba"
          />
        </Field>
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox checked={full} onCheckedChange={(v) => setFull(!!v)} /> Plná nádrž
        <span className="text-muted">(spotřeba se počítá mezi plnými nádržemi)</span>
      </label>
      {hasJobs && (
        <Field label="Zakázka" hint="Vyplňte, když se palivo účtuje na zakázku.">
          <Combobox
            load={(s) => api.lookups.records("job", s)}
            value={jobId}
            onChange={(v) => setJobId(v as string | null)}
            aria-label="Zakázka"
            placeholder="Bez zakázky"
            clearable
          />
        </Field>
      )}
      <Actions
        onClose={onDone}
        loading={save.isPending}
        label="Zapsat tankování"
        error={save.error}
      />
    </form>
  );
}

/* ---------- závada ---------- */

export function DefectForm({
  assetId: fixed,
  onDone,
}: {
  assetId?: string | undefined;
  onDone: () => void;
}) {
  const opts = useOptions();
  const [assetId, setAssetId] = useState<string | null>(fixed ?? null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [blocking, setBlocking] = useState(false);
  const report = useCommandMutation<Record<string, unknown>>("stroje.defect.report", {
    onSuccess: () => {
      successToast("Závada nahlášena, odpovědná osoba dostala úkol.");
      onDone();
    },
  });
  if (opts.isLoading || !opts.data) return <Skeleton className="m-5 h-40" />;
  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        report.mutate({
          assetId,
          title,
          description: description || null,
          severity: blocking ? "blocking" : "normal",
        });
      }}
    >
      <AssetField assets={opts.data.assets} value={assetId} onChange={setAssetId} fixed={!!fixed} />
      <Field label="Co je špatně" htmlFor="defect-title">
        <Input id="defect-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Popis" htmlFor="defect-desc">
        <Textarea
          id="defect-desc"
          className="min-h-16"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox checked={blocking} onCheckedChange={(v) => setBlocking(!!v)} /> Stroj nesmí jet
        (odstaví se, dokud závada není vyřešená)
      </label>
      <Actions
        onClose={onDone}
        loading={report.isPending}
        label="Nahlásit závadu"
        error={report.error}
      />
    </form>
  );
}

function DefectResolveForm({ id, close }: { id: string; close: () => void }) {
  const [resolution, setResolution] = useState("");
  const m = useCommandMutation<
    { id: string; resolution: string | null },
    { backInService: boolean }
  >("stroje.defect.resolve", {
    onSuccess: (r) => {
      successToast(r.backInService ? "Vyřešeno, stroj je zpět v provozu." : "Závada vyřešena.");
      close();
    },
  });
  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ id, resolution: resolution || null });
      }}
    >
      <Field label="Jak se vyřešilo" htmlFor="defect-resolution">
        <Textarea
          id="defect-resolution"
          className="min-h-20"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
        />
      </Field>
      <Actions onClose={close} loading={m.isPending} label="Vyřešit" error={m.error} />
    </form>
  );
}

/* ---------- rezervace ---------- */

export function ReservationForm({
  assetId: fixed,
  from,
  onDone,
}: {
  assetId?: string | undefined;
  from?: string | undefined;
  onDone: () => void;
}) {
  const api = useEntityApi();
  const hasJobs = useModuleUi().has("zakazky");
  const opts = useOptions();
  const [assetId, setAssetId] = useState<string | null>(fixed ?? null);
  const [dateFrom, setDateFrom] = useState<string | null>(from ?? todayIso());
  const [dateTo, setDateTo] = useState<string | null>(from ?? todayIso());
  const [jobId, setJobId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const save = useCommandMutation<Record<string, unknown>>("stroje.reservation.save", {
    onSuccess: () => {
      successToast("Rezervace uložena.");
      onDone();
    },
  });
  if (opts.isLoading || !opts.data) return <Skeleton className="m-5 h-40" />;
  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          assetId,
          dateFrom,
          dateTo: dateTo && dateFrom && dateTo < dateFrom ? dateFrom : dateTo,
          jobId,
          userId,
          note: note || null,
        });
      }}
    >
      <AssetField assets={opts.data.assets} value={assetId} onChange={setAssetId} fixed={!!fixed} />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Od">
          <DatePicker
            value={dateFrom}
            onChange={(v) => {
              setDateFrom(v);
              if (v && (!dateTo || dateTo < v)) setDateTo(v);
            }}
            clearable={false}
          />
        </Field>
        <Field label="Do">
          <DatePicker value={dateTo} onChange={setDateTo} clearable={false} />
        </Field>
      </div>
      {hasJobs && (
        <Field label="Zakázka">
          <Combobox
            load={(s) => api.lookups.records("job", s)}
            value={jobId}
            onChange={(v) => setJobId(v as string | null)}
            aria-label="Zakázka"
            placeholder="Bez zakázky"
            clearable
          />
        </Field>
      )}
      <Field label="Kdo stroj obsluhuje nebo má auto">
        <Combobox
          load={(s) => api.lookups.users(s)}
          value={userId}
          onChange={(v) => setUserId(v as string | null)}
          aria-label="Obsluha"
          placeholder="Nikdo konkrétní"
          clearable
        />
      </Field>
      <Field label="Poznámka" htmlFor="res-note">
        <Input id="res-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Actions onClose={onDone} loading={save.isPending} label="Rezervovat" error={save.error} />
    </form>
  );
}

/* ---------- servis ---------- */

type ServiceInfo = {
  meter: string;
  meterValue: string;
  services: {
    id: string;
    date: string;
    kind: string;
    title: string;
    vendor: string | null;
    costMinor: number;
    meterValue: string | null;
    intervalId: string | null;
    note: string | null;
  }[];
  intervals: {
    id: string;
    title: string;
    everyMeter: number | null;
    everyMonths: number | null;
    lastDate: string | null;
    lastMeter: string | null;
    tone: "overdue" | "soon" | "ok";
    text: string;
    dueDate: string | null;
  }[];
};

function ServiceForm({
  assetId,
  intervals,
  meter,
  onDone,
}: {
  assetId: string;
  intervals: ServiceInfo["intervals"];
  meter: string;
  onDone: () => void;
}) {
  const [date, setDate] = useState<string | null>(todayIso());
  const [kind, setKind] = useState("service");
  const [title, setTitle] = useState("");
  const [vendor, setVendor] = useState("");
  const [cost, setCost] = useState<number | null>(null);
  const [meterValue, setMeterValue] = useState("");
  const [intervalId, setIntervalId] = useState<string | null>(null);
  const [nextStk, setNextStk] = useState<string | null>(null);
  const save = useCommandMutation<Record<string, unknown>>("stroje.service.save", {
    onSuccess: () => {
      successToast("Servisní záznam uložen.");
      onDone();
    },
  });
  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          assetId,
          date,
          kind,
          title,
          vendor: vendor || null,
          costMinor: cost,
          meterValue: toNumber(meterValue),
          intervalId,
          nextStkDate: kind === "inspection" ? nextStk : null,
        });
      }}
    >
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Datum">
          <DatePicker value={date} onChange={setDate} clearable={false} />
        </Field>
        <Field label="Druh">
          <Combobox
            options={SERVICE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            value={kind}
            onChange={(v) => v && setKind(v as string)}
            aria-label="Druh servisu"
          />
        </Field>
      </div>
      <Field label="Co se dělalo" htmlFor="svc-title">
        <Input id="svc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field label="Dodavatel" htmlFor="svc-vendor">
          <Input id="svc-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </Field>
        <Field label="Cena bez DPH">
          <MoneyInput aria-label="Cena servisu" value={cost} onChange={setCost} />
        </Field>
        <Field label={`Stav (${meterUnit(meter)})`} htmlFor="svc-meter">
          <Input
            id="svc-meter"
            inputMode="decimal"
            value={meterValue}
            onChange={(e) => setMeterValue(decimal(e.target.value))}
          />
        </Field>
      </div>
      {intervals.length > 0 && (
        <Field label="Splňuje servisní interval" hint="Interval se od tohoto dne počítá znovu.">
          <Combobox
            options={intervals.map((v) => ({ value: v.id, label: v.title }))}
            value={intervalId}
            onChange={(v) => setIntervalId(v as string | null)}
            aria-label="Interval"
            placeholder="Žádný"
            clearable
          />
        </Field>
      )}
      {kind === "inspection" && (
        <Field label="Nová platnost STK do">
          <DatePicker value={nextStk} onChange={setNextStk} />
        </Field>
      )}
      <Actions onClose={onDone} loading={save.isPending} label="Uložit" error={save.error} />
    </form>
  );
}

function IntervalForm({
  assetId,
  meter,
  onDone,
}: {
  assetId: string;
  meter: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [everyMeter, setEveryMeter] = useState("");
  const [everyMonths, setEveryMonths] = useState("");
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [lastMeter, setLastMeter] = useState("");
  const save = useCommandMutation<Record<string, unknown>>("stroje.interval.save", {
    onSuccess: onDone,
  });
  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          assetId,
          title,
          everyMeter: toNumber(everyMeter),
          everyMonths: toNumber(everyMonths),
          lastDate,
          lastMeter: toNumber(lastMeter),
        });
      }}
    >
      <Field label="Název" htmlFor="iv-title">
        <Input
          id="iv-title"
          placeholder="Např. Výměna oleje"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label={`Každých (${meterUnit(meter)})`} htmlFor="iv-meter">
          <Input
            id="iv-meter"
            inputMode="numeric"
            value={everyMeter}
            onChange={(e) => setEveryMeter(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field label="Nebo každých (měsíců)" htmlFor="iv-months">
          <Input
            id="iv-months"
            inputMode="numeric"
            value={everyMonths}
            onChange={(e) => setEveryMonths(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field label="Naposledy provedeno">
          <DatePicker value={lastDate} onChange={setLastDate} />
        </Field>
        <Field label={`Stav při posledním (${meterUnit(meter)})`} htmlFor="iv-last">
          <Input
            id="iv-last"
            inputMode="decimal"
            value={lastMeter}
            onChange={(e) => setLastMeter(decimal(e.target.value))}
          />
        </Field>
      </div>
      <Actions
        onClose={onDone}
        loading={save.isPending}
        label="Uložit interval"
        error={save.error}
      />
    </form>
  );
}

/** Dialog s formulářem z kteréhokoli místa (přehled, detail stroje). */
function FormDialog({
  title,
  open,
  onClose,
  wide,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} className={wide ? "w-[min(40rem,calc(100vw-2rem))]" : ""}>
        {open && children}
      </DialogContent>
    </Dialog>
  );
}

type FormKind = "log" | "fuel" | "defect" | "reservation" | "service" | "interval";

function QuickActions({ assetId, onOpen }: { assetId?: string; onOpen?: (k: FormKind) => void }) {
  const can = useCan();
  const [open, setOpen] = useState<FormKind | null>(null);
  const close = () => setOpen(null);
  const go = (k: FormKind) => (onOpen ? onOpen(k) : setOpen(k));
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {can(["stroje.log", "stroje.write"]) && (
          <>
            <Button variant="primary" onClick={() => go("log")}>
              Zapsat jízdu / provoz
            </Button>
            <Button variant="secondary" onClick={() => go("fuel")}>
              Natankováno
            </Button>
            <Button variant="secondary" onClick={() => go("defect")}>
              Nahlásit závadu
            </Button>
          </>
        )}
        {can("stroje.write") && (
          <Button variant="secondary" onClick={() => go("reservation")}>
            Rezervovat
          </Button>
        )}
      </div>
      {!onOpen && <Forms open={open} assetId={assetId} onClose={close} />}
    </>
  );
}

function Forms({
  open,
  assetId,
  onClose,
}: {
  open: FormKind | null;
  assetId?: string | undefined;
  onClose: () => void;
}) {
  return (
    <>
      <FormDialog title="Zapsat jízdu nebo provoz" open={open === "log"} onClose={onClose} wide>
        <LogForm assetId={assetId} onDone={onClose} />
      </FormDialog>
      <FormDialog title="Natankováno" open={open === "fuel"} onClose={onClose} wide>
        <FuelForm assetId={assetId} onDone={onClose} />
      </FormDialog>
      <FormDialog title="Nahlásit závadu" open={open === "defect"} onClose={onClose}>
        <DefectForm assetId={assetId} onDone={onClose} />
      </FormDialog>
      <FormDialog title="Rezervace" open={open === "reservation"} onClose={onClose}>
        <ReservationForm assetId={assetId} onDone={onClose} />
      </FormDialog>
    </>
  );
}

/* ---------- stránka Stroje ---------- */

type FleetAsset = {
  id: string;
  name: string;
  kind: string;
  plate: string | null;
  status: string;
  meter: string;
  meterValue: string;
  responsibleName: string | null;
  openDefects: number;
  blockingDefects: number;
  monthAmount: string;
  today: { job: string | null; user: string | null; to: string } | null;
  alerts: { label: string; tone: Tone; text: string }[];
};

function FleetOverview() {
  const { Link } = useNav();
  const q = useCommandQuery<{ assets: FleetAsset[] }>("stroje.fleet", {});
  if (q.isLoading) return <Skeleton className="h-64" />;
  const assets = q.data?.assets ?? [];
  if (!assets.length)
    return (
      <EmptyState
        icon={<Truck />}
        title="Žádné stroje ani vozidla"
        description="Založte první kartu v evidenci."
        action={
          <Link href="/stroje/evidence" className="text-accent hover:underline">
            Evidence strojů
          </Link>
        }
      />
    );
  const urgent = assets.flatMap((a) => a.alerts.map((x) => ({ a, ...x })));
  return (
    <div className="space-y-4">
      {urgent.length > 0 && (
        <section aria-label="Termíny a servis" className="rounded-lg border border-line p-4">
          <h2 className="mb-2 font-semibold">Termíny a servis</h2>
          <ul className="grid gap-1 sm:grid-cols-2" data-testid="fleet-alerts">
            {urgent
              .sort((x, y) => (x.tone === "overdue" ? 0 : 1) - (y.tone === "overdue" ? 0 : 1))
              .map((x, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Chip color={toneColor(x.tone)}>
                    {x.tone === "overdue" ? "Po termínu" : "Brzy"}
                  </Chip>
                  <Link href={`/stroje/evidence/${x.a.id}`} className="hover:underline">
                    {x.a.name}: {x.label}
                  </Link>
                  <span className="text-muted">{x.text}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="fleet-cards">
        {assets.map((a) => {
          const st = statusOf(a.status);
          return (
            <Link
              key={a.id}
              href={`/stroje/evidence/${a.id}`}
              className="block rounded-lg border border-line p-4 hover:bg-hover"
              data-testid="fleet-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className="text-sm text-muted">
                    {kindLabel(a.kind)}
                    {a.plate ? ` · ${a.plate}` : ""}
                  </div>
                </div>
                {st && <Chip color={st.color}>{st.label}</Chip>}
              </div>
              <div className="mt-2 text-sm text-muted">
                Stav {formatMeter(a.meterValue, a.meter)} · tento měsíc{" "}
                {formatMeter(a.monthAmount, a.meter)}
                {a.responsibleName ? ` · ${a.responsibleName}` : ""}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {a.today && (
                  <Chip color="blue">Dnes {a.today.job ?? a.today.user ?? "rezervováno"}</Chip>
                )}
                {a.openDefects > 0 && (
                  <Chip color={a.blockingDefects ? "red" : "orange"}>
                    {a.blockingDefects ? "Mimo provoz" : `Závady: ${a.openDefects}`}
                  </Chip>
                )}
                {a.alerts.map((x, i) => (
                  <Chip key={i} color={toneColor(x.tone)}>
                    {x.label}: {x.text}
                  </Chip>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

type LogRows = {
  total: string;
  rows: {
    id: string;
    assetId: string;
    assetName: string;
    plate: string | null;
    meter: string;
    date: string;
    userName: string | null;
    amount: string;
    meterStart: string | null;
    meterEnd: string | null;
    route: string | null;
    purpose: string | null;
    job: string | null;
    private: boolean;
    canDelete: boolean;
  }[];
};

function LogTable({
  assetId,
  month,
  showAsset,
}: {
  assetId?: string | undefined;
  month?: string | undefined;
  showAsset: boolean;
}) {
  const q = useCommandQuery<LogRows>("stroje.logs", {
    ...(assetId ? { assetId } : {}),
    ...(month ? { month } : {}),
  });
  const del = useCommandMutation<{ id: string }>("stroje.log.delete");
  const confirm = useConfirmDelete(del, { title: "Smazat zápis", confirmLabel: "Smazat" });
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  if (!q.data.rows.length) return <p className="text-muted">Žádné zápisy.</p>;
  return (
    <div className="space-y-2">
      <Table
        head={
          <>
            <th className={th}>Datum</th>
            {showAsset && <th className={th}>Stroj</th>}
            <th className={th}>Kdo</th>
            <th className={th}>Trasa a účel</th>
            <th className={cn(th, "text-right")}>Ujeto / provoz</th>
            <th className="w-10" />
          </>
        }
      >
        {q.data.rows.map((r) => (
          <tr key={r.id} data-testid="log-row">
            <td className="px-3 py-2">{formatDate(r.date)}</td>
            {showAsset && <td className="px-3 py-2">{r.assetName}</td>}
            <td className="px-3 py-2">{r.userName ?? "—"}</td>
            <td className="px-3 py-2">
              {r.private && !r.route && !r.purpose ? (
                <Chip>Soukromá</Chip>
              ) : (
                <>
                  {r.private && <Chip>Soukromá</Chip>} {r.route}
                  {r.purpose && <span className="text-muted"> · {r.purpose}</span>}
                  {r.job && <span className="text-muted"> · {r.job}</span>}
                </>
              )}
            </td>
            <td className={cn("px-3 py-2", tabular)}>{formatMeter(r.amount, r.meter)}</td>
            <td className="px-1">
              {r.canDelete && (
                <IconButton
                  label="Smazat zápis"
                  onClick={() => confirm.ask(r.id, "Smazat tento zápis z knihy jízd?")}
                >
                  <Trash2 />
                </IconButton>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <p className="text-right font-semibold">Celkem {q.data.total.replace(".", ",")}</p>
      <Err error={del.error} />
      {confirm.dialog}
    </div>
  );
}

type FuelRows = {
  avg: number | null;
  unit: string;
  rows: {
    id: string;
    assetName: string;
    date: string;
    userName: string | null;
    liters: string;
    totalMinor: number;
    meterValue: string | null;
    meter: string;
    fullTank: boolean;
    station: string | null;
    consumption: number | null;
    job: string | null;
    canDelete: boolean;
  }[];
};

function FuelTable({
  assetId,
  month,
  showAsset,
}: {
  assetId?: string | undefined;
  month?: string | undefined;
  showAsset: boolean;
}) {
  const q = useCommandQuery<FuelRows>("stroje.fuel", {
    ...(assetId ? { assetId } : {}),
    ...(month ? { month } : {}),
  });
  const del = useCommandMutation<{ id: string }>("stroje.fuel.delete");
  const confirm = useConfirmDelete(del, { title: "Smazat tankování", confirmLabel: "Smazat" });
  const seeCosts = useCan()(["stroje.write", "zakazky.economics"]); // částky server ostatním nevrací
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  if (!q.data.rows.length) return <p className="text-muted">Žádná tankování.</p>;
  return (
    <div className="space-y-2">
      {q.data.avg !== null && (
        <p className="text-muted">
          Průměrná spotřeba {q.data.avg.toFixed(1).replace(".", ",")} {q.data.unit}
        </p>
      )}
      <Table
        head={
          <>
            <th className={th}>Datum</th>
            {showAsset && <th className={th}>Stroj</th>}
            <th className={cn(th, "text-right")}>Litrů</th>
            {seeCosts && <th className={cn(th, "text-right")}>Částka</th>}
            <th className={cn(th, "text-right")}>Stav</th>
            <th className={cn(th, "text-right")}>Spotřeba</th>
            <th className="w-10" />
          </>
        }
      >
        {q.data.rows.map((r) => (
          <tr key={r.id} data-testid="fuel-row">
            <td className="px-3 py-2">
              {formatDate(r.date)}
              {!r.fullTank && <span className="text-muted"> (doplnění)</span>}
            </td>
            {showAsset && <td className="px-3 py-2">{r.assetName}</td>}
            <td className={cn("px-3 py-2", tabular)}>{Number(r.liters).toLocaleString("cs-CZ")}</td>
            {seeCosts && <td className={cn("px-3 py-2", tabular)}>{formatMinor(r.totalMinor)}</td>}
            <td className={cn("px-3 py-2", tabular)}>{formatMeter(r.meterValue, r.meter)}</td>
            <td className={cn("px-3 py-2", tabular)}>
              {r.consumption === null ? "—" : r.consumption.toFixed(1).replace(".", ",")}
            </td>
            <td className="px-1">
              {r.canDelete && (
                <IconButton
                  label="Smazat tankování"
                  onClick={() => confirm.ask(r.id, "Smazat toto tankování?")}
                >
                  <Trash2 />
                </IconButton>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Err error={del.error} />
      {confirm.dialog}
    </div>
  );
}

function MonthSwitch({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Předchozí měsíc" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft />
      </IconButton>
      <span className="min-w-36 text-center font-medium capitalize">{monthLabel(month)}</span>
      <IconButton label="Další měsíc" onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight />
      </IconButton>
    </div>
  );
}

function BookPage({ kind }: { kind: "log" | "fuel" }) {
  const opts = useOptions();
  const [month, setMonth] = useState(monthOf(todayIso()));
  const [assetId, setAssetId] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <MonthSwitch month={month} onChange={setMonth} />
        <div className="w-60">
          <Combobox
            options={(opts.data?.assets ?? []).map((a) => ({ value: a.id, label: a.name }))}
            value={assetId}
            onChange={(v) => setAssetId(v as string | null)}
            aria-label="Filtr stroje"
            placeholder="Všechny stroje"
            clearable
          />
        </div>
      </div>
      {kind === "log" ? (
        <LogTable assetId={assetId ?? undefined} month={month} showAsset />
      ) : (
        <FuelTable assetId={assetId ?? undefined} month={month} showAsset />
      )}
    </div>
  );
}

type ResRow = {
  id: string;
  assetId: string;
  assetName: string;
  dateFrom: string;
  dateTo: string;
  job: string | null;
  userName: string | null;
  note: string | null;
};

function ReservationsPage() {
  const can = useCan();
  const opts = useOptions();
  const [start, setStart] = useState(weekStartIso(todayIso()));
  const [form, setForm] = useState<{ assetId: string; date: string } | null>(null);
  const days = eachDayIso(start, addDaysIso(start, 13));
  const q = useCommandQuery<ResRow[]>("stroje.reservations", { from: days[0], to: days[13] });
  const del = useCommandMutation<{ id: string }>("stroje.reservation.delete");
  const confirm = useConfirmDelete(del, {
    title: "Zrušit rezervaci",
    confirmLabel: "Zrušit rezervaci",
    cancelLabel: "Ponechat",
  });
  const assets = opts.data?.assets ?? [];
  const at = (assetId: string, day: string) =>
    (q.data ?? []).find((r) => r.assetId === assetId && r.dateFrom <= day && r.dateTo >= day);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <IconButton label="Předchozí dva týdny" onClick={() => setStart(addDaysIso(start, -14))}>
          <ChevronLeft />
        </IconButton>
        <span className="min-w-48 text-center font-medium">
          {formatDate(days[0])} – {formatDate(days[13])}
        </span>
        <IconButton label="Další dva týdny" onClick={() => setStart(addDaysIso(start, 14))}>
          <ChevronRight />
        </IconButton>
        <Button variant="ghost" onClick={() => setStart(weekStartIso(todayIso()))}>
          Dnes
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line" data-testid="reservation-grid">
        <table className="w-full min-w-[56rem] text-center text-sm">
          <thead className="bg-subtle text-muted">
            <tr>
              <th className="sticky left-0 bg-subtle px-3 py-2 text-left font-medium">Stroj</th>
              {days.map((d) => (
                <th
                  key={d}
                  className={cn("px-1 py-2 font-medium", d === todayIso() && "text-accent")}
                >
                  {
                    ["po", "út", "st", "čt", "pá", "so", "ne"][
                      (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7
                    ]
                  }
                  <div>{Number(d.slice(8))}.</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {assets.map((a) => (
              <tr key={a.id}>
                <td className="sticky left-0 bg-bg px-3 py-2 text-left font-medium">{a.name}</td>
                {days.map((d) => {
                  const r = at(a.id, d);
                  return (
                    <td key={d} className="p-0.5">
                      {r ? (
                        <button
                          type="button"
                          title={[r.job, r.userName, r.note].filter(Boolean).join(" · ")}
                          className="h-8 w-full rounded bg-accent-soft text-xs text-accent hover:bg-accent hover:text-accent-fg"
                          onClick={() => {
                            if (can("stroje.write")) confirm.ask(r.id, "Zrušit tuto rezervaci?");
                          }}
                        >
                          {r.userName?.split(" ")[0] ?? "●"}
                        </button>
                      ) : can("stroje.write") ? (
                        <button
                          type="button"
                          aria-label={`Rezervovat ${a.name} ${formatDate(d)}`}
                          className="h-8 w-full rounded text-faint hover:bg-hover"
                          onClick={() => setForm({ assetId: a.id, date: d })}
                        >
                          <Plus className="mx-auto size-3.5" />
                        </button>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Err error={del.error} />
      {confirm.dialog}
      <FormDialog title="Rezervace" open={!!form} onClose={() => setForm(null)}>
        {form && (
          <ReservationForm assetId={form.assetId} from={form.date} onDone={() => setForm(null)} />
        )}
      </FormDialog>
    </div>
  );
}

const SUB: { path: string; label: string }[] = [
  { path: "", label: "Přehled" },
  { path: "kniha", label: "Kniha jízd" },
  { path: "tankovani", label: "Tankování" },
  { path: "rezervace", label: "Rezervace" },
];

function FleetPage({ rest }: { rest: string[] }) {
  const { Link } = useNav();
  const sub = rest[0] ?? "";
  return (
    <div
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
      data-testid="fleet-page"
    >
      <div className="space-y-4">
        <QuickActions />
        <nav
          aria-label="Části modulu"
          className="scrollbar-none flex gap-1 overflow-x-auto border-b border-line"
        >
          {SUB.map((s) => (
            <Link
              key={s.path}
              href={s.path ? `/stroje/${s.path}` : "/stroje"}
              aria-current={sub === s.path ? "page" : undefined}
              className={cn(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 font-medium",
                sub === s.path
                  ? "border-accent text-fg"
                  : "border-transparent text-muted hover:text-fg",
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        {sub === "kniha" ? (
          <BookPage kind="log" />
        ) : sub === "tankovani" ? (
          <BookPage kind="fuel" />
        ) : sub === "rezervace" ? (
          <ReservationsPage />
        ) : (
          <FleetOverview />
        )}
      </div>
    </div>
  );
}

/* ---------- záložky na detailu ---------- */

function AssetLogTab({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const can = useCan();
  return (
    <TabBody>
      {can(["stroje.log", "stroje.write"]) && (
        <Button variant="primary" onClick={() => setOpen(true)}>
          Zapsat jízdu / provoz
        </Button>
      )}
      <LogTable assetId={id} showAsset={false} />
      <FormDialog title="Zapsat jízdu nebo provoz" open={open} onClose={() => setOpen(false)} wide>
        <LogForm assetId={id} onDone={() => setOpen(false)} />
      </FormDialog>
    </TabBody>
  );
}

function AssetFuelTab({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const can = useCan();
  return (
    <TabBody>
      {can(["stroje.log", "stroje.write"]) && (
        <Button variant="primary" onClick={() => setOpen(true)}>
          Natankováno
        </Button>
      )}
      <FuelTable assetId={id} showAsset={false} />
      <FormDialog title="Natankováno" open={open} onClose={() => setOpen(false)} wide>
        <FuelForm assetId={id} onDone={() => setOpen(false)} />
      </FormDialog>
    </TabBody>
  );
}

function AssetServiceTab({ id }: { id: string }) {
  const can = useCan();
  const q = useCommandQuery<ServiceInfo>("stroje.service", { assetId: id });
  const [form, setForm] = useState<"service" | "interval" | null>(null);
  const del = useCommandMutation<{ id: string }>("stroje.interval.delete");
  const confirm = useConfirmDelete(del, { title: "Odebrat interval", confirmLabel: "Odebrat" });
  const seeCosts = can(["stroje.write", "zakazky.economics"]); // částky server ostatním nevrací
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  const d = q.data;
  return (
    <TabBody>
      {can("stroje.write") && (
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => setForm("service")}>
            Zapsat servis
          </Button>
          <Button variant="secondary" onClick={() => setForm("interval")}>
            Nový interval
          </Button>
        </div>
      )}
      <section>
        <h3 className="mb-2 font-semibold">Servisní intervaly</h3>
        {d.intervals.length === 0 ? (
          <p className="text-muted">Zatím žádný interval (např. výměna oleje každých 15 000 km).</p>
        ) : (
          <ul
            className="divide-y divide-line rounded-lg border border-line"
            data-testid="intervals"
          >
            {d.intervals.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-40 flex-1 font-medium">{v.title}</span>
                <Chip color={toneColor(v.tone)}>{v.text || "bez posledního servisu"}</Chip>
                <span className="text-sm text-muted">
                  {v.everyMeter ? `každých ${v.everyMeter} ${meterUnit(d.meter)}` : ""}
                  {v.everyMeter && v.everyMonths ? " / " : ""}
                  {v.everyMonths ? `každých ${v.everyMonths} měs.` : ""}
                </span>
                {can("stroje.write") && (
                  <IconButton
                    label={`Odebrat interval ${v.title}`}
                    onClick={() => confirm.ask(v.id, `Odebrat interval „${v.title}“?`)}
                  >
                    <Trash2 />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Historie servisu</h3>
        {d.services.length === 0 ? (
          <p className="text-muted">Žádné záznamy.</p>
        ) : (
          <Table
            head={
              <>
                <th className={th}>Datum</th>
                <th className={th}>Co se dělalo</th>
                <th className={th}>Dodavatel</th>
                <th className={cn(th, "text-right")}>Stav</th>
                {seeCosts && <th className={cn(th, "text-right")}>Cena bez DPH</th>}
              </>
            }
          >
            {d.services.map((s) => (
              <tr key={s.id} data-testid="service-row">
                <td className="px-3 py-2">{formatDate(s.date)}</td>
                <td className="px-3 py-2">
                  {s.title}{" "}
                  <span className="text-muted">
                    {SERVICE_KINDS.find((k) => k.value === s.kind)?.label}
                  </span>
                </td>
                <td className="px-3 py-2">{s.vendor ?? "—"}</td>
                <td className={cn("px-3 py-2", tabular)}>{formatMeter(s.meterValue, d.meter)}</td>
                {seeCosts && (
                  <td className={cn("px-3 py-2", tabular)}>{formatMinor(s.costMinor)}</td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </section>
      <Err error={del.error} />
      {confirm.dialog}
      <FormDialog title="Servis" open={form === "service"} onClose={() => setForm(null)} wide>
        <ServiceForm
          assetId={id}
          intervals={d.intervals}
          meter={d.meter}
          onDone={() => setForm(null)}
        />
      </FormDialog>
      <FormDialog
        title="Servisní interval"
        open={form === "interval"}
        onClose={() => setForm(null)}
      >
        <IntervalForm assetId={id} meter={d.meter} onDone={() => setForm(null)} />
      </FormDialog>
    </TabBody>
  );
}

function AssetReservationsTab({ id }: { id: string }) {
  const can = useCan();
  const from = addDaysIso(todayIso(), -30);
  const to = addDaysIso(todayIso(), 180);
  const q = useCommandQuery<ResRow[]>("stroje.reservations", { assetId: id, from, to });
  const [open, setOpen] = useState(false);
  const del = useCommandMutation<{ id: string }>("stroje.reservation.delete");
  const confirm = useConfirmDelete(del, {
    title: "Zrušit rezervaci",
    confirmLabel: "Zrušit rezervaci",
    cancelLabel: "Ponechat",
  });
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  return (
    <TabBody>
      {can("stroje.write") && (
        <Button variant="primary" onClick={() => setOpen(true)}>
          Rezervovat
        </Button>
      )}
      {q.data.length === 0 ? (
        <p className="text-muted">Žádné rezervace.</p>
      ) : (
        <ul
          className="divide-y divide-line rounded-lg border border-line"
          data-testid="reservations"
        >
          {q.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="font-medium">
                {formatDate(r.dateFrom)}
                {r.dateTo !== r.dateFrom ? ` – ${formatDate(r.dateTo)}` : ""}
              </span>
              <span className="min-w-0 flex-1 text-muted">
                {[r.job, r.userName, r.note].filter(Boolean).join(" · ")}
              </span>
              {can("stroje.write") && (
                <IconButton
                  label="Zrušit rezervaci"
                  onClick={() => confirm.ask(r.id, "Zrušit tuto rezervaci?")}
                >
                  <Trash2 />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <Err error={del.error} />
      {confirm.dialog}
      <FormDialog title="Rezervace" open={open} onClose={() => setOpen(false)}>
        <ReservationForm assetId={id} onDone={() => setOpen(false)} />
      </FormDialog>
    </TabBody>
  );
}

function AssetCostsTab({ id }: { id: string }) {
  const q = useCommandQuery<{
    since: string;
    meter: string;
    amount: number;
    liters: string;
    fuelNetMinor: number;
    serviceMinor: number;
    totalMinor: number;
    perUnitMinor: number | null;
  }>("stroje.assetCosts", { assetId: id });
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  const d = q.data;
  const cell = (label: string, value: string) => (
    <div className="rounded-lg border border-line p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="tabular text-xl font-semibold">{value}</div>
    </div>
  );
  return (
    <TabBody>
      <p className="text-muted">Posledních 12 měsíců (od {formatDate(d.since)}), částky bez DPH.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cell("Palivo", formatMinor(d.fuelNetMinor))}
        {cell("Servis", formatMinor(d.serviceMinor))}
        {cell("Celkem", formatMinor(d.totalMinor))}
        {cell(
          `Na ${meterUnit(d.meter)}`,
          d.perUnitMinor === null ? "—" : formatMinor(d.perUnitMinor),
        )}
      </div>
      <p className="text-muted">
        Najeto / odpracováno {formatMeter(d.amount, d.meter)}, natankováno{" "}
        {Number(d.liters).toLocaleString("cs-CZ")} l.
      </p>
    </TabBody>
  );
}

function JobFleetTab({ id }: { id: string }) {
  const q = useCommandQuery<{
    rows: {
      assetId: string;
      name: string;
      meter: string;
      rateMinor: number | null;
      amount: string;
      days: number;
      costMinor: number;
      fuelLiters: string;
      fuelNetMinor: number;
    }[];
    reservations: {
      id: string;
      assetName: string;
      dateFrom: string;
      dateTo: string;
      userName: string | null;
    }[];
    usageMinor: number;
    fuelMinor: number;
  }>("stroje.jobFleet", { jobId: id });
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  const d = q.data;
  return (
    <TabBody>
      {d.rows.length === 0 && d.reservations.length === 0 ? (
        <p className="text-muted">Na zakázce zatím není zapsaný provoz ani rezervace strojů.</p>
      ) : (
        <>
          {d.rows.length > 0 && (
            <Table
              head={
                <>
                  <th className={th}>Stroj</th>
                  <th className={cn(th, "text-right")}>Provoz</th>
                  <th className={cn(th, "text-right")}>Dní</th>
                  <th className={cn(th, "text-right")}>Interní sazba</th>
                  <th className={cn(th, "text-right")}>Palivo bez DPH</th>
                </>
              }
            >
              {d.rows.map((r) => (
                <tr key={r.assetId}>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className={cn("px-3 py-2", tabular)}>{formatMeter(r.amount, r.meter)}</td>
                  <td className={cn("px-3 py-2", tabular)}>{r.days}</td>
                  <td className={cn("px-3 py-2", tabular)}>{formatMinor(r.costMinor)}</td>
                  <td className={cn("px-3 py-2", tabular)}>{formatMinor(r.fuelNetMinor)}</td>
                </tr>
              ))}
            </Table>
          )}
          <p className="text-right font-semibold">
            Stroje celkem {formatMinor(d.usageMinor + d.fuelMinor)}
          </p>
          {d.reservations.length > 0 && (
            <section>
              <h3 className="mb-2 font-semibold">Rezervace</h3>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {d.reservations.map((r) => (
                  <li key={r.id} className="flex gap-3 px-3 py-2">
                    <span className="font-medium">{r.assetName}</span>
                    <span className="text-muted">
                      {formatDate(r.dateFrom)}
                      {r.dateTo !== r.dateFrom ? ` – ${formatDate(r.dateTo)}` : ""}
                      {r.userName ? ` · ${r.userName}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </TabBody>
  );
}

const tab = (
  id: string,
  label: string,
  Component: (p: { id: string }) => ReactNode,
  permission: string | readonly string[] = "stroje.read",
): RecordTab => ({
  id,
  label,
  permission,
  render: ({ id: recordId }) => <Component id={recordId} />,
});

const rowStatus = (row: Record<string, unknown>) => String(row.status ?? "");

const assetActions: RecordAction[] = [
  {
    id: "log",
    label: "Zapsat jízdu",
    primary: true,
    permission: ["stroje.log", "stroje.write"],
    visible: (row) => rowStatus(row) !== "retired",
    dialog: {
      title: "Zapsat jízdu nebo provoz",
      render: ({ id, close }) => <LogForm assetId={id} onDone={close} />,
    },
  },
  {
    id: "defect",
    label: "Nahlásit závadu",
    permission: ["stroje.log", "stroje.write"],
    dialog: {
      title: "Nahlásit závadu",
      render: ({ id, close }) => <DefectForm assetId={id} onDone={close} />,
    },
  },
];

const defectActions: RecordAction[] = [
  {
    id: "resolve",
    label: "Vyřešit závadu",
    primary: true,
    permission: "stroje.write",
    visible: (row) => rowStatus(row) === "open",
    dialog: {
      title: "Vyřešit závadu",
      render: ({ id, close }) => <DefectResolveForm id={id} close={close} />,
    },
  },
];

export const ui = defineModuleUi({
  terminalWidgets: { "stroje.fleet": { Widget: FleetTerminalWidget } },
  recordTabs: {
    asset: [
      tab("kniha", "Kniha jízd", AssetLogTab),
      tab("tankovani", "Tankování", AssetFuelTab),
      tab("servis", "Servis", AssetServiceTab),
      tab("rezervace", "Rezervace", AssetReservationsTab),
      tab("naklady", "Náklady", AssetCostsTab, "stroje.write"),
    ],
    job: [{ ...tab("stroje", "Stroje", JobFleetTab), group: "naklady", order: 30 }],
  },
  recordActions: { asset: assetActions, asset_defect: defectActions },
  pages: [{ path: "/stroje", render: ({ rest }) => <FleetPage rest={rest} /> }],
});
