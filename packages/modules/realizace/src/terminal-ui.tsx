"use client";

import {
  BigButton,
  ButtonLink,
  JobPicker,
  PhotoPicker,
  TOUCH_FIELD,
  TerminalCard,
  TouchChoice,
  TouchField,
  reportOutcome,
  useActiveJobs,
  useJobChoice,
  useSendPhotos,
  useTerminalQueue,
  type TerminalWidgetProps,
} from "@rebar/ui";
import { useState } from "react";

const ERR = "text-base text-danger";

/** Společná část formulářů: zakázka, fotky a odeslání s fotkami v zařízení dřív, než se zkusí odeslat. */
function useSiteForm() {
  const { jobs, loading } = useActiveJobs(true);
  const choice = useJobChoice(jobs);
  const sendPhotos = useSendPhotos();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labelOf = (id: string) => jobs.find((j) => j.value === id)?.label ?? "zakázka";
  return {
    jobs,
    loading,
    choice,
    sendPhotos,
    files,
    setFiles,
    busy,
    setBusy,
    error,
    setError,
    labelOf,
  };
}

/** Karta na úvodní obrazovce: krátký popis a velké tlačítko na celou obrazovku formuláře. */
function Intro({
  label,
  icon,
  testId,
  text,
  action,
  pageHref,
}: {
  label: string;
  icon: string;
  testId: string;
  text: string;
  action: string;
  pageHref: string | null;
}) {
  return (
    <TerminalCard title={label} icon={icon} testId={testId}>
      <p className="mb-3 text-base text-muted">{text}</p>
      {pageHref && (
        <ButtonLink href={pageHref} variant="primary" className="w-full">
          {action}
        </ButtonLink>
      )}
    </TerminalCard>
  );
}

/** Rychlý zápis do stavebního deníku dne: řádek textu a fotky z místa. Zápisy kolegů téhož dne se nepřepisují. */
export function DiaryTerminalWidget(props: TerminalWidgetProps) {
  if (props.variant === "card")
    return (
      <Intro
        label={props.label}
        icon="clipboard-list"
        testId="tile-realizace.diary"
        text="Zapište, co se dnes dělalo, a přidejte fotky z místa."
        action="Zapsat do deníku"
        pageHref={props.pageHref}
      />
    );
  return <DiaryForm {...props} />;
}

function DiaryForm({ label, settings, variant }: TerminalWidgetProps) {
  const f = useSiteForm();
  const { submit } = useTerminalQueue();
  const [text, setText] = useState("");
  const needPhoto = settings.diary.requirePhoto;

  async function send() {
    f.setError(null);
    if (!f.choice.value) return f.setError("Vyberte zakázku.");
    if (!text.trim() && f.files.length === 0)
      return f.setError("Napište, co se dělalo, nebo přidejte fotku.");
    if (needPhoto && f.files.length === 0)
      return f.setError("Do deníku z terminálu je potřeba přidat aspoň jednu fotku.");
    f.setBusy(true);
    try {
      const jobLabel = f.labelOf(f.choice.value);
      if (f.files.length) await f.sendPhotos(f.choice.value, f.files, jobLabel);
      const body = text.trim() || `Fotodokumentace (${f.files.length})`;
      const out = await submit({
        command: "realizace.terminal.note",
        input: { jobId: f.choice.value, text: body, section: "work" },
        label: `Deník: ${body.length > 40 ? `${body.slice(0, 37)}…` : body}`,
        group: `diary:${f.choice.value}`,
      });
      if (reportOutcome(out, "Zapsáno do deníku.")) {
        setText("");
        f.setFiles([]);
      }
    } finally {
      f.setBusy(false);
    }
  }

  return (
    <TerminalCard title={label} icon="clipboard-list" testId="tile-realizace.diary" bare>
      <div className="space-y-3">
        <JobPicker
          jobs={f.jobs}
          loading={f.loading}
          value={f.choice.value}
          onChange={f.choice.set}
        />
        <TouchField label="Co se dnes dělalo">
          {(id) => (
            <textarea
              id={id}
              value={text}
              rows={variant === "page" ? 5 : 3}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              className={`${TOUCH_FIELD} py-3`}
            />
          )}
        </TouchField>
        <PhotoPicker files={f.files} onChange={f.setFiles} />
        {needPhoto && f.files.length === 0 && (
          <p className="text-base text-muted">Zápis vyžaduje aspoň jednu fotku.</p>
        )}
        {f.error && (
          <p role="alert" className={ERR}>
            {f.error}
          </p>
        )}
        <BigButton variant="primary" loading={f.busy} onClick={() => void send()}>
          Zapsat do deníku
        </BigButton>
      </div>
    </TerminalCard>
  );
}

/** Hlášení závady (založí vadu zakázky) nebo poznámka k dnešnímu dni (zapíše se do událostí deníku). */
export function ReportTerminalWidget(props: TerminalWidgetProps) {
  if (props.variant === "card")
    return (
      <Intro
        label={props.label}
        icon="alert-triangle"
        testId="tile-realizace.report"
        text="Nahlaste závadu na stavbě nebo zapište poznámku k dnešnímu dni, s fotkou."
        action="Nahlásit nebo zapsat"
        pageHref={props.pageHref}
      />
    );
  return <ReportForm {...props} />;
}

function ReportForm({ label }: TerminalWidgetProps) {
  const f = useSiteForm();
  const { submit } = useTerminalQueue();
  const [kind, setKind] = useState<"defect" | "note">("defect");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<"minor" | "normal" | "major">("normal");

  async function send() {
    f.setError(null);
    if (!f.choice.value) return f.setError("Vyberte zakázku.");
    if (kind === "defect" && title.trim().length < 3) return f.setError("Popište závadu.");
    if (kind === "note" && !text.trim()) return f.setError("Napište poznámku.");
    f.setBusy(true);
    try {
      const jobLabel = f.labelOf(f.choice.value);
      if (f.files.length) await f.sendPhotos(f.choice.value, f.files, jobLabel);
      const out =
        kind === "defect"
          ? await submit({
              command: "realizace.terminal.defect",
              input: {
                jobId: f.choice.value,
                title: title.trim(),
                description: text.trim() || null,
                severity,
              },
              label: `Závada: ${title.trim()}`,
              group: `report:${f.choice.value}`,
            })
          : await submit({
              command: "realizace.terminal.note",
              input: { jobId: f.choice.value, text: text.trim(), section: "events" },
              label: `Poznámka: ${text.trim().slice(0, 40)}`,
              group: `diary:${f.choice.value}`,
            });
      if (reportOutcome(out, kind === "defect" ? "Závada nahlášena." : "Poznámka zapsána.")) {
        setTitle("");
        setText("");
        f.setFiles([]);
      }
    } finally {
      f.setBusy(false);
    }
  }

  return (
    <TerminalCard title={label} icon="alert-triangle" testId="tile-realizace.report" bare>
      <div className="space-y-3">
        <TouchChoice
          label="Druh hlášení"
          value={kind}
          onChange={setKind}
          options={[
            { value: "defect", label: "Závada" },
            { value: "note", label: "Poznámka" },
          ]}
        />
        <JobPicker
          jobs={f.jobs}
          loading={f.loading}
          value={f.choice.value}
          onChange={f.choice.set}
        />
        {kind === "defect" && (
          <>
            <TouchField label="Co je špatně">
              {(id) => (
                <input
                  id={id}
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`${TOUCH_FIELD} h-14`}
                />
              )}
            </TouchField>
            <TouchChoice
              label="Závažnost"
              value={severity}
              onChange={setSeverity}
              options={[
                { value: "minor", label: "Drobná" },
                { value: "normal", label: "Běžná" },
                { value: "major", label: "Závažná" },
              ]}
            />
          </>
        )}
        <TouchField label={kind === "defect" ? "Podrobnosti (nepovinné)" : "Poznámka"}>
          {(id) => (
            <textarea
              id={id}
              value={text}
              rows={3}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              className={`${TOUCH_FIELD} py-3`}
            />
          )}
        </TouchField>
        <PhotoPicker files={f.files} onChange={f.setFiles} />
        {f.error && (
          <p role="alert" className={ERR}>
            {f.error}
          </p>
        )}
        <BigButton variant="primary" loading={f.busy} onClick={() => void send()}>
          {kind === "defect" ? "Nahlásit závadu" : "Zapsat poznámku"}
        </BigButton>
      </div>
    </TerminalCard>
  );
}
