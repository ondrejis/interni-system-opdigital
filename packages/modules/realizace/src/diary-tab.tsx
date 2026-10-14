"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import {
  Button,
  Chip,
  ConfirmDialog,
  DatePicker,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  IconButton,
  Input,
  SignaturePad,
  Skeleton,
  cn,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Pencil,
  PenLine,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DiaryEditor, type DiaryEntryData } from "./diary-editor";
import { dayStrip, weatherSummary, weekdayShort } from "./diary-shared";

type DiaryList = {
  canWrite: boolean;
  canPrice: boolean;
  canUnsign: boolean;
  entries: DiaryEntryData[];
};

type Protocol = {
  id: string;
  status: string;
  signatureFileId: string | null;
  acceptedBy: string | null;
};

const STRIP_DAYS = 28;

/** Pás dní nad deníkem: ikona u dne se zápisem, skok na datum, posun o dva týdny. */
function DayStrip({
  today,
  selected,
  marked,
  onSelect,
}: {
  today: string;
  selected: string;
  marked: Map<string, { signed: boolean }>;
  onSelect: (d: string) => void;
}) {
  const [end, setEnd] = useState(today);
  const days = useMemo(() => dayStrip(end, STRIP_DAYS), [end]);
  const selRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const shift = (n: number) => {
    const base = dayStrip(end, 1)[0]!;
    const t = new Date(`${base}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    const next = t.toISOString().slice(0, 10);
    setEnd(next > today ? today : next);
  };
  // vybraný den mimo okno: okno se posune, ať je vidět
  useEffect(() => {
    if (!days.includes(selected)) {
      const t = new Date(`${selected}T12:00:00Z`);
      t.setUTCDate(t.getUTCDate() + 13);
      const next = t.toISOString().slice(0, 10);
      setEnd(next > today ? today : next);
    }
  }, [selected, days, today]);
  // vybraný den se vycentruje jen uvnitř pásu (scrollIntoView by posunul i celou stránku)
  useEffect(() => {
    const list = listRef.current;
    const btn = selRef.current;
    if (list && btn) list.scrollLeft = btn.offsetLeft - (list.clientWidth - btn.offsetWidth) / 2;
  }, [selected, days]);

  return (
    <div className="flex min-w-0 items-center gap-1.5" data-testid="diary-strip">
      <IconButton label="Starší dny" variant="ghost" onClick={() => shift(-14)}>
        <ChevronLeft />
      </IconButton>
      <ol
        ref={listRef}
        className="scrollbar-thin relative flex min-w-0 flex-1 gap-1 overflow-x-auto py-1"
      >
        {days.map((d) => {
          const mark = marked.get(d);
          const sel = d === selected;
          const day = Number(d.slice(8, 10));
          return (
            <li key={d} className="shrink-0">
              <button
                ref={sel ? selRef : undefined}
                type="button"
                onClick={() => onSelect(d)}
                aria-pressed={sel}
                aria-label={`${weekdayShort(d)} ${formatDate(d)}${mark ? ", je zápis" : ""}${d === today ? ", dnes" : ""}`}
                data-testid={`diary-day-${d}`}
                data-has-entry={mark ? "1" : "0"}
                className={cn(
                  "flex min-h-14 w-11 flex-col items-center justify-center gap-0.5 rounded-lg border text-sm transition-colors pointer-coarse:min-h-16 pointer-coarse:w-12",
                  sel
                    ? "border-accent bg-accent text-accent-fg"
                    : d === today
                      ? "border-accent text-fg hover:bg-hover"
                      : "border-line text-muted hover:bg-hover",
                  weekdayShort(d) === "so" || weekdayShort(d) === "ne" ? "opacity-80" : "",
                )}
              >
                <span className="text-xs uppercase">{weekdayShort(d)}</span>
                <span className="tabular font-semibold">{day}</span>
                <span className="flex h-3.5 items-center">
                  {mark ? (
                    <FileText className="size-3.5" aria-hidden />
                  ) : (
                    <span className="size-1 rounded-full bg-transparent" />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <IconButton
        label="Novější dny"
        variant="ghost"
        disabled={end >= today}
        onClick={() => shift(14)}
      >
        <ChevronRight />
      </IconButton>
      <div className="hidden w-36 sm:block">
        <DatePicker
          value={selected}
          onChange={(v) => v && onSelect(v > today ? today : v)}
          clearable={false}
          placeholder="Skok na datum"
        />
      </div>
    </div>
  );
}

/** Podpis zápisu: ručně prstem, nebo znovu použít podpis z podepsaného předávacího protokolu. */
function SignDialog({
  jobId,
  entry,
  open,
  onOpenChange,
}: {
  jobId: string;
  entry: DiaryEntryData;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const api = useEntityApi();
  const handovers = useCommandQuery<Protocol[]>(
    "realizace.handover.list",
    { jobId },
    { enabled: open },
  );
  const [png, setPng] = useState<Blob | null>(null);
  const [name, setName] = useState(api.me.name);
  const [busy, setBusy] = useState(false);
  const sign = useCommandMutation<{ id: string; signatureFileId: string; name: string }>(
    "realizace.diary.sign",
    {
      onSuccess: () => {
        successToast("Zápis je podepsaný.");
        onOpenChange(false);
      },
    },
  );
  const reusable = handovers.data?.find((p) => p.status === "signed" && p.signatureFileId);

  async function submit(fileId?: string) {
    setBusy(true);
    try {
      let signatureFileId = fileId;
      if (!signatureFileId) {
        if (!png) return;
        const file = new File([png], `podpis-denik-${entry.date}.png`, { type: "image/png" });
        signatureFileId = (await api.uploadFile("job", jobId, file, { kind: "signature" })).id;
      }
      await sign.mutateAsync({ id: entry.id, signatureFileId, name });
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Podpis zápisu ${formatDate(entry.date)}`}
        description="Podepsaný zápis už nejde měnit. Podpis může zrušit stavbyvedoucí."
      >
        <div className="space-y-3 px-5 py-4">
          <Field label="Podepisuje" htmlFor="ds-name">
            <Input id="ds-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <SignaturePad onChange={setPng} />
          <div className="flex flex-wrap justify-end gap-2">
            {reusable && (
              <Button
                variant="secondary"
                loading={busy}
                disabled={name.trim().length < 2}
                onClick={() => void submit(reusable.signatureFileId!)}
              >
                Použít podpis z předávacího protokolu
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!png || name.trim().length < 2}
              onClick={() => void submit()}
            >
              Podepsat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="font-medium text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Zápis dne ke čtení. */
function EntryView({
  entry,
  canPrice,
  actions,
}: {
  entry: DiaryEntryData;
  canPrice: boolean;
  actions: React.ReactNode;
}) {
  const hours = (h: number | null) => (h === null ? "" : ` (${String(h).replace(".", ",")} h)`);
  const { Link } = useNav();
  const hasText = (s: string | null) => !!s && s.trim().length > 0;
  return (
    <article className="space-y-3 rounded-lg border border-line p-4" data-testid="diary-entry">
      <header className="flex flex-wrap items-center gap-2">
        <b className="text-base font-semibold">{formatDate(entry.date)}</b>
        {entry.weatherData ? (
          <Chip color={entry.weatherData.source === "open-meteo" ? "blue" : "gray"}>
            {weatherSummary(entry.weatherData)}
            {entry.weatherData.precipMm
              ? ` · ${String(entry.weatherData.precipMm).replace(".", ",")} mm`
              : ""}
          </Chip>
        ) : entry.weather ? (
          <Chip>
            {entry.weather}
            {entry.temperature !== null ? `, ${entry.temperature} °C` : ""}
          </Chip>
        ) : null}
        {entry.forInvestor && <Chip color="purple">Pro investora</Chip>}
        {entry.signed && (
          <Chip color="green" dot>
            Podepsáno{entry.signed.name ? `: ${entry.signed.name}` : ""}
          </Chip>
        )}
        {entry.author && <span className="text-sm text-muted">· {entry.author}</span>}
        <span className="ml-auto flex gap-1.5">{actions}</span>
      </header>
      {hasText(entry.work) && <p className="whitespace-pre-wrap">{entry.work}</p>}
      <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[7rem_1fr]">
        {entry.workers.length > 0 ? (
          <Fact label="Pracovníci">
            {entry.workers.map((w) => `${w.name}${hours(w.hours)}`).join(", ")}
          </Fact>
        ) : hasText(entry.people) ? (
          <Fact label="Pracovníci">{entry.people}</Fact>
        ) : null}
        {entry.machineRows.length > 0 ? (
          <Fact label="Stroje">
            {entry.machineRows
              .map((m) => `${m.name}${hours(m.hours)}${m.note ? ` — ${m.note}` : ""}`)
              .join("; ")}
          </Fact>
        ) : hasText(entry.machines) ? (
          <Fact label="Stroje">{entry.machines}</Fact>
        ) : null}
        {entry.materialRows.length > 0 ? (
          <Fact label="Materiál">
            <ul className="space-y-0.5">
              {entry.materialRows.map((m) => (
                <li key={m.id}>
                  {m.name}{" "}
                  <span className="text-muted">
                    {m.qty.replace(".", ",")} {m.unit}
                    {m.supplier ? ` · ${m.supplier}` : ""}
                    {canPrice && m.unitPriceMinor
                      ? ` · ${formatMinor(m.unitPriceMinor)} / ${m.unit}`
                      : ""}
                  </span>
                  {m.costRef && canPrice && <Chip className="ml-1.5">náklad zakázky</Chip>}
                </li>
              ))}
            </ul>
          </Fact>
        ) : hasText(entry.materials) ? (
          <Fact label="Materiál">{entry.materials}</Fact>
        ) : null}
        {entry.incidents.length > 0 && (
          <Fact label="Nehody a vady">
            <ul className="space-y-0.5">
              {entry.incidents.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-1.5">
                  <Chip color={x.kind === "defect" ? "red" : "orange"}>
                    {x.kind === "defect" ? "Vada" : "Nehoda"}
                  </Chip>
                  <span>{x.text}</span>
                  {x.defectId && (
                    <Link
                      href={`/realizace/vady/${x.defectId}`}
                      className="text-accent hover:underline"
                    >
                      vada zakázky
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Fact>
        )}
        {hasText(entry.events) && (
          <Fact label="Události">
            <span className="whitespace-pre-wrap">{entry.events}</span>
          </Fact>
        )}
      </dl>
      {entry.photoIds.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6" data-testid="diary-entry-photos">
          {entry.photoIds.map((id, n) => (
            <li key={id}>
              <a href={`/api/files/${id}`} target="_blank" rel="noreferrer">
                <img
                  src={`/api/files/${id}?thumb=1`}
                  alt={`Fotka ${n + 1}`}
                  loading="lazy"
                  className="aspect-square w-full rounded-md border border-line object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
      {entry.signed?.signatureFileId && (
        <img
          src={`/api/files/${entry.signed.signatureFileId}`}
          alt={`Podpis ${entry.signed.name ?? ""}`}
          className="h-14 rounded border border-line bg-white p-1"
        />
      )}
    </article>
  );
}

/**
 * Stavební deník jako sběrné místo dne: pás dní nahoře, zápis vybraného dne (počasí, práce, lidé z docházky,
 * materiál s nákladem, stroje, fotky, nehody a vady, podpis) a tisk.
 */
export function DiaryTab({ id }: { id: string }) {
  const q = useCommandQuery<DiaryList>("realizace.diary.list", { jobId: id });
  const today = todayIso();
  const [selected, setSelected] = useState<string>(today);
  const [editing, setEditing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const del = useCommandMutation<{ id: string }>("realizace.diary.delete", {
    onSuccess: () => successToast("Zápis smazán."),
  });
  const unsign = useCommandMutation<{ id: string }>("realizace.diary.unsign", {
    onSuccess: () => successToast("Podpis zrušen."),
  });

  const entries = useMemo(() => q.data?.entries ?? [], [q.data]);
  const marked = useMemo(
    () => new Map(entries.map((e) => [e.date, { signed: !!e.signed }])),
    [entries],
  );
  const entry = entries.find((e) => e.date === selected) ?? null;
  const canWrite = !!q.data?.canWrite;
  const select = (d: string) => {
    setSelected(d);
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      <DayStrip today={today} selected={selected} marked={marked} onSelect={select} />
      <div className="flex flex-wrap items-center gap-2">
        {canWrite && !editing && !entry && (
          <Button variant="primary" onClick={() => setEditing(true)}>
            <Plus /> Zapsat {selected === today ? "dnešek" : formatDate(selected)}
          </Button>
        )}
        <a
          href={`/tisk/denik/${id}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted hover:bg-hover hover:text-fg pointer-coarse:h-11"
        >
          <Printer className="size-4" /> Tisk deníku
        </a>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-24" />
      ) : editing ? (
        <DiaryEditor
          key={`${selected}-${entry?.updatedAt ?? "new"}`}
          jobId={id}
          date={selected}
          entry={entry}
          canPrice={!!q.data?.canPrice}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : entry ? (
        <>
          <EntryView
            entry={entry}
            canPrice={!!q.data?.canPrice || false}
            actions={
              <>
                {canWrite && !entry.signed && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                      <Pencil /> Upravit
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => setSigning(true)}>
                      <PenLine /> Podepsat
                    </Button>
                  </>
                )}
                {entry.signed && q.data?.canUnsign && (
                  <Button size="sm" variant="ghost" onClick={() => unsign.mutate({ id: entry.id })}>
                    Zrušit podpis
                  </Button>
                )}
                {q.data?.canUnsign && !entry.signed && (
                  <IconButton
                    label="Smazat zápis"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleting(true)}
                  >
                    <Trash2 />
                  </IconButton>
                )}
              </>
            }
          />
          <SignDialog jobId={id} entry={entry} open={signing} onOpenChange={setSigning} />
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title="Smazat zápis v deníku?"
            description="Smažou se i náklady zakázky, které z materiálu v tomto zápisu vznikly."
            confirmLabel="Smazat zápis"
            danger
            onConfirm={async () => {
              try {
                await del.mutateAsync({ id: entry.id });
              } catch (e) {
                errorToast((e as Error).message);
                return false;
              }
            }}
          />
        </>
      ) : (
        <EmptyState
          title={entries.length ? "Na tento den není zápis" : "Deník je prázdný"}
          description="Do stavebního deníku se zapisuje, co se dělalo, kdo byl na stavbě, jaký byl materiál a počasí. Jeden zápis na den."
        />
      )}
      <Err error={(del.error ?? unsign.error) as Error | null} />
    </div>
  );
}

function Err({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error.message}
    </p>
  ) : null;
}
