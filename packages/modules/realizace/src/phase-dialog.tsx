"use client";

import { addDaysIso, isWorkday, todayIso } from "@rebar/core/time";
import {
  Button,
  Combobox,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  Input,
  Textarea,
  cn,
  successToast,
  useCommandMutation,
  useEntityApi,
} from "@rebar/ui";
import { Flag, Link2, TriangleAlert, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { endAfter, lengthInWorkdays, toWorkday, wouldCycle } from "./schedule";
import { Segmented } from "./schedule-parts";
import { fmtRange, fmtShort, nextWorkday, workdaysLabel, type Phase } from "./schedule-shared";

export type PhaseDraft = {
  id?: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  responsibleId: string | null;
  dependsOnId: string | null;
  milestone: boolean;
  plannedHours: string;
  note: string;
  shift: boolean;
};

export const blankDraft = (over: Partial<PhaseDraft> = {}): PhaseDraft => {
  const start = toWorkday(todayIso());
  return {
    name: "",
    startDate: start,
    endDate: start,
    progress: 0,
    responsibleId: null,
    dependsOnId: null,
    milestone: false,
    plannedHours: "",
    note: "",
    shift: true,
    ...over,
  };
};

export const draftFromPhase = (p: Phase): PhaseDraft => ({
  id: p.id,
  name: p.name,
  startDate: p.startDate,
  endDate: p.endDate,
  progress: p.progress,
  responsibleId: p.responsibleId,
  dependsOnId: p.dependsOnId,
  milestone: p.milestone,
  plannedHours: p.plannedHours === null ? "" : String(p.plannedHours),
  note: p.note ?? "",
  shift: true,
});

type Errors = { name?: string; dates?: string; dependsOn?: string };

function validate(d: PhaseDraft, phases: Phase[]): Errors {
  const e: Errors = {};
  if (d.name.trim().length < 2) e.name = "Vyplňte název fáze, aspoň 2 znaky.";
  if (!d.startDate) e.dates = d.milestone ? "Vyplňte datum milníku." : "Vyplňte začátek fáze.";
  else if (!d.milestone && !d.endDate) e.dates = "Vyplňte konec fáze.";
  else if (!d.milestone && d.endDate! < d.startDate)
    e.dates = "Konec fáze nesmí být před začátkem.";
  if (d.dependsOnId && wouldCycle(phases, d.id ?? null, d.dependsOnId))
    e.dependsOn = "Tahle návaznost by udělala kruh: fáze by čekala sama na sebe.";
  return e;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pb-1 pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Chipbutton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-6 items-center rounded-full border border-line-strong px-2.5 text-xs font-medium text-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

/** Úprava fáze nebo milníku: skupiny polí, validace s hláškami, zkratky u dat, délka v pracovních dnech. */
export function PhaseDialog({
  jobId,
  draft,
  phases,
  users,
  readOnly,
  onClose,
}: {
  jobId: string;
  draft: PhaseDraft;
  phases: Phase[];
  users: Record<string, string>;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const api = useEntityApi();
  const [d, setD] = useState<PhaseDraft>(draft);
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lenDraft, setLenDraft] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const save = useCommandMutation<Record<string, unknown>, { shifted: number }>(
    "realizace.phases.save",
    {
      onSuccess: (r) => {
        successToast(
          r.shifted
            ? `${d.milestone ? "Milník" : "Fáze"} uložen${d.milestone ? "" : "a"}, posunuto navazujících: ${r.shifted}.`
            : d.milestone
              ? "Milník uložen."
              : "Fáze uložena.",
        );
        onClose();
      },
    },
  );
  const del = useCommandMutation<{ id: string }>("realizace.phases.delete", {
    onSuccess: () => {
      successToast(d.milestone ? "Milník smazán." : "Fáze smazána.");
      onClose();
    },
  });
  const set = <K extends keyof PhaseDraft>(k: K, v: PhaseDraft[K]) =>
    setD((s) => ({ ...s, [k]: v }));
  const others = phases.filter((p) => p.id !== d.id);
  const pred = d.dependsOnId ? phases.find((p) => p.id === d.dependsOnId) : undefined;
  const errors = validate(d, phases);
  const show = submitted ? errors : {};
  const length =
    d.startDate && d.endDate && d.endDate >= d.startDate
      ? lengthInWorkdays(d.startDate, d.endDate)
      : null;
  const busy = save.isPending || del.isPending;

  /** Změna začátku zachová délku v pracovních dnech, začátek se zarovná na pracovní den. */
  function setStart(v: string | null) {
    if (!v) return set("startDate", null);
    const start = toWorkday(v);
    setD((s) => {
      const len =
        s.startDate && s.endDate && s.endDate >= s.startDate
          ? lengthInWorkdays(s.startDate, s.endDate)
          : 1;
      return { ...s, startDate: start, endDate: s.milestone ? start : endAfter(start, len) };
    });
    if (start !== v)
      setNote("Začátek připadl na víkend nebo svátek, posunul jsem ho na nejbližší pracovní den.");
    else setNote(null);
  }
  function setEnd(v: string | null) {
    if (!v) return set("endDate", null);
    let end = v;
    // konec se zarovná zpět na pracovní den (ale ne před začátek)
    while (!isWorkday(end) && end > (d.startDate ?? v)) end = addDaysIso(end, -1);
    set("endDate", end);
  }
  function setLength(text: string) {
    setLenDraft(text);
    const n = Number(text);
    if (d.startDate && Number.isInteger(n) && n >= 1 && n <= 999)
      set("endDate", endAfter(d.startDate, n));
  }
  function pickPredecessor(id: string | null) {
    const p = id ? phases.find((x) => x.id === id) : undefined;
    setD((s) => {
      if (!p || !s.startDate || s.startDate > p.endDate) return { ...s, dependsOnId: id };
      const start = nextWorkday(p.endDate);
      const len =
        s.endDate && s.endDate >= s.startDate ? lengthInWorkdays(s.startDate, s.endDate) : 1;
      return {
        ...s,
        dependsOnId: id,
        startDate: start,
        endDate: s.milestone ? start : endAfter(start, len),
      };
    });
    if (p && d.startDate && d.startDate <= p.endDate)
      setNote(`Začátek jsem posunul za konec fáze „${p.name}“.`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) {
      // po vykreslení hlášek se zaměří první chybné pole
      setTimeout(() => document.querySelector<HTMLElement>("[data-invalid='true']")?.focus(), 0);
      return;
    }
    save.mutate({
      jobId,
      ...(d.id ? { id: d.id } : {}),
      name: d.name.trim(),
      startDate: d.startDate,
      endDate: d.milestone ? d.startDate : d.endDate,
      progress: d.progress,
      responsibleId: d.responsibleId,
      dependsOnId: d.dependsOnId,
      milestone: d.milestone,
      plannedHours: d.plannedHours === "" || d.milestone ? null : Number(d.plannedHours),
      note: d.note.trim() || null,
      shift: d.shift,
    });
  }

  const title = d.id
    ? d.milestone
      ? "Upravit milník"
      : "Upravit fázi"
    : d.milestone
      ? "Nový milník"
      : "Nová fáze";
  const serverError = (save.error as Error | null) ?? (del.error as Error | null);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        title={title}
        description={
          d.startDate && !errors.dates
            ? `${fmtRange(d.startDate, d.milestone ? d.startDate : (d.endDate ?? d.startDate))}${
                length && !d.milestone ? ` · ${workdaysLabel(length)}` : ""
              }`
            : undefined
        }
        className="top-[6vh] max-h-[88vh] sm:w-[min(40rem,calc(100vw-2rem))]"
      >
        <form noValidate className="space-y-4 px-5 py-4" onSubmit={submit}>
          <Section title="Základ">
            <Field label="Název fáze" htmlFor="ph-name" error={show.name}>
              <Input
                id="ph-name"
                autoFocus={!d.id}
                value={d.name}
                maxLength={120}
                aria-invalid={!!show.name}
                data-invalid={show.name ? "true" : undefined}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Segmented
              label="Druh záznamu"
              value={d.milestone ? "milestone" : "phase"}
              onChange={(v) =>
                setD((s) => ({
                  ...s,
                  milestone: v === "milestone",
                  endDate: v === "milestone" ? s.startDate : s.endDate,
                }))
              }
              options={[
                { value: "phase", label: "Fáze s délkou" },
                { value: "milestone", label: "Milník", icon: <Flag /> },
              ]}
            />
            {d.milestone && (
              <p className="mt-2 text-sm text-muted">
                Milník je jednodenní událost, třeba předání nebo kontrola.
              </p>
            )}
          </Section>

          <Section title="Termín">
            <div
              className={cn(
                "grid gap-x-3",
                d.milestone ? "sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-[1fr_1fr_7rem]",
              )}
            >
              <div className="col-span-2 sm:col-span-1">
                <Field
                  label={d.milestone ? "Datum" : "Začátek"}
                  {...(show.dates && !d.startDate ? { error: show.dates } : {})}
                >
                  <DatePicker value={d.startDate} onChange={setStart} clearable={false} />
                </Field>
              </div>
              {!d.milestone && (
                <>
                  <Field
                    label="Konec"
                    {...(show.dates && d.startDate ? { error: show.dates } : {})}
                  >
                    <DatePicker value={d.endDate} onChange={setEnd} clearable={false} />
                  </Field>
                  <Field label="Pracovních dnů" htmlFor="ph-len">
                    <Input
                      id="ph-len"
                      inputMode="numeric"
                      value={lenDraft ?? String(length ?? "")}
                      onChange={(e) => setLength(e.target.value.replace(/\D/g, "").slice(0, 3))}
                      onBlur={() => setLenDraft(null)}
                    />
                  </Field>
                </>
              )}
            </div>
            <div className="-mt-1 mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Začátek:</span>
              <Chipbutton onClick={() => setStart(todayIso())}>Dnes</Chipbutton>
              <Chipbutton onClick={() => setStart(nextWorkday(todayIso()))}>Zítra</Chipbutton>
              {pred && (
                <Chipbutton onClick={() => setStart(nextWorkday(pred.endDate))}>
                  Po fázi „{pred.name.length > 18 ? `${pred.name.slice(0, 17)}…` : pred.name}“
                </Chipbutton>
              )}
            </div>
            {pred && d.startDate && d.startDate <= pred.endDate && (
              <p className="mb-3 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Začátek je před koncem fáze „{pred.name}“ ({fmtShort(pred.endDate)}). Použijte
                zkratku „Po fázi“.
              </p>
            )}
            <p className="mb-3 text-sm text-muted">
              {note ?? "Víkendy a svátky se do délky nepočítají a plán je přeskakuje."}
            </p>
          </Section>

          <Section title={d.milestone ? "Stav" : "Postup"}>
            {d.milestone ? (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={d.progress >= 100}
                  onChange={(e) => set("progress", e.target.checked ? 100 : 0)}
                />
                Milník je splněn
              </label>
            ) : (
              <div className="mb-3">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor="ph-progress" className="text-sm font-medium text-muted">
                    Dokončeno
                  </label>
                  <span className="tabular text-lg font-semibold">{d.progress} %</span>
                </div>
                <input
                  id="ph-progress"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={d.progress}
                  onChange={(e) => set("progress", Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {[0, 25, 50, 75, 100].map((v) => (
                    <Chipbutton key={v} onClick={() => set("progress", v)}>
                      {v === 100 ? "Hotovo" : `${v} %`}
                    </Chipbutton>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section title="Souvislosti">
            <div
              className={cn(
                "grid gap-x-3",
                d.milestone ? "sm:grid-cols-2" : "sm:grid-cols-[1fr_1fr_7rem]",
              )}
            >
              <Field label="Odpovídá">
                <Combobox
                  load={api.lookups.users}
                  value={d.responsibleId}
                  selectedLabels={
                    d.responsibleId && users[d.responsibleId]
                      ? { [d.responsibleId]: users[d.responsibleId]! }
                      : {}
                  }
                  onChange={(v) => set("responsibleId", v as string | null)}
                  clearable
                  placeholder="Nikdo"
                />
              </Field>
              <Field label="Navazuje na" error={show.dependsOn}>
                <Combobox
                  options={others.map((p) => ({ value: p.id, label: p.name }))}
                  value={d.dependsOnId}
                  onChange={(v) => pickPredecessor(v as string | null)}
                  clearable
                  placeholder="Nenavazuje"
                />
              </Field>
              {!d.milestone && (
                <Field label="Plán. hodiny" htmlFor="ph-hours">
                  <Input
                    id="ph-hours"
                    inputMode="numeric"
                    value={d.plannedHours}
                    onChange={(e) => set("plannedHours", e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
              )}
            </div>
            {d.dependsOnId && (
              <p className="mb-3 flex items-start gap-2 text-sm text-muted">
                <Link2 className="mt-0.5 size-4 shrink-0" />
                Fáze čeká na dokončení předchozí a při jejím posunu se posune s ní.
              </p>
            )}
          </Section>

          <Section title="Další">
            <Field label="Poznámka pro tým" htmlFor="ph-note">
              <Textarea
                id="ph-note"
                value={d.note}
                maxLength={1000}
                onChange={(e) => set("note", e.target.value)}
                className="min-h-16"
              />
            </Field>
            <label className="flex cursor-pointer items-start gap-2 pb-1">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--accent)]"
                checked={d.shift}
                onChange={(e) => set("shift", e.target.checked)}
              />
              <span>Posunout navazující fáze, když se tato přeplánuje</span>
            </label>
          </Section>

          {serverError && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {serverError.message}
            </p>
          )}

          <div className="sticky bottom-0 z-10 -mx-5 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-bg px-5 py-3">
            {confirmDelete ? (
              <>
                <p className="min-w-0 flex-1 text-sm">
                  Smazat „{d.name || "bez názvu"}“? Navazující fáze zůstanou bez návaznosti.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Ne, ponechat
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    loading={del.isPending}
                    onClick={() => del.mutate({ id: d.id! })}
                  >
                    <Trash2 /> Smazat
                  </Button>
                </div>
              </>
            ) : (
              <>
                {d.id && !readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-danger hover:text-danger"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 /> Smazat
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                    Zrušit
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={save.isPending}
                    disabled={readOnly}
                  >
                    Uložit
                  </Button>
                </div>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
