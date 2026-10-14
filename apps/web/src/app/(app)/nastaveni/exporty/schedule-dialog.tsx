"use client";

import type { ExportSpec, ScheduleInfo, ScheduleInput, TemplateInfo } from "@rebar/core/export";
import {
  Button,
  Checkbox,
  Chip,
  Combobox,
  Dialog,
  DialogContent,
  Field,
  Input,
  SegmentedControl,
  successToast,
} from "@rebar/ui";
import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { saveExportScheduleAction } from "@/server/export-actions";
import { lookupUsersAction } from "@/server/entity-actions";
import { MAX_RECIPIENTS, MONTH_DAYS, WEEKDAYS, isTime } from "./labels";

type Entity = { key: string; label: string; module: string };
type Source = "entity" | "template";
type Format = ExportSpec["format"];
type Frequency = "daily" | "weekly" | "monthly";

/** Co plán exportuje: uložený pohled (sloupce, filtry) se zachová, jen formát se přepíše. */
function baseSpec(
  source: Source,
  entity: string | null,
  template: TemplateInfo | undefined,
  initial: ScheduleInfo | null,
): ExportSpec | null {
  if (source === "template") return template?.spec ?? (initial?.templateId ? initial.spec : null);
  if (!entity) return null;
  if (initial && initial.spec.entity === entity) return initial.spec;
  return { entity, format: "xlsx", scope: "all" };
}

/** Nový nebo upravený plánovaný export. Chyby ze serveru (např. příjemce bez práva na data) se ukážou u formuláře. */
export function ScheduleDialog({
  initial,
  entities,
  templates,
  me,
  onClose,
  onSaved,
}: {
  initial: ScheduleInfo | null;
  entities: Entity[];
  templates: TemplateInfo[];
  me: { id: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [source, setSource] = useState<Source>(initial?.templateId ? "template" : "entity");
  const [entity, setEntity] = useState<string | null>(initial?.spec.entity ?? null);
  const [templateId, setTemplateId] = useState<string | null>(initial?.templateId ?? null);
  const [format, setFormat] = useState<Format>(initial?.spec.format ?? "xlsx");
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "weekly");
  const [weekday, setWeekday] = useState<number>(initial?.weekday ?? 1);
  const [monthDay, setMonthDay] = useState<number>(initial?.monthDay ?? 1);
  const [time, setTime] = useState(initial?.timeLocal ?? "07:00");
  const [recipients, setRecipients] = useState<string[]>(
    initial ? initial.recipients.map((r) => r.id) : [me.id],
  );
  const [labels, setLabels] = useState<Record<string, string>>(() => ({
    [me.id]: me.name,
    ...Object.fromEntries((initial?.recipients ?? []).map((r) => [r.id, r.name])),
  }));
  const [byEmail, setByEmail] = useState(initial ? initial.deliver !== "myexports" : true);
  const [toMyExports, setToMyExports] = useState(initial ? initial.deliver !== "email" : true);
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = templates.find((t) => t.id === templateId);
  const spec = baseSpec(source, entity, template, initial);
  const customView = !!spec && (!!spec.columns?.length || !!spec.query);

  const lookup = useCallback(async (query: string) => {
    const r = await lookupUsersAction({ q: query });
    if (!r.ok) return [];
    setLabels((prev) => ({
      ...prev,
      ...Object.fromEntries(r.data.map((u) => [u.value, u.label])),
    }));
    return r.data;
  }, []);

  const problem = !name.trim()
    ? "Vyplňte název plánu."
    : !spec
      ? source === "template"
        ? "Vyberte šablonu."
        : "Vyberte typ dat."
      : !isTime(time)
        ? "Vyplňte čas ve tvaru HH:MM."
        : recipients.length === 0
          ? "Vyberte aspoň jednoho příjemce."
          : recipients.length > MAX_RECIPIENTS
            ? `Plán může mít nejvýš ${MAX_RECIPIENTS} příjemců.`
            : !byEmail && !toMyExports
              ? "Vyberte, kam se má export doručit."
              : null;

  async function submit() {
    if (problem || !spec) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const schedule: ScheduleInput = {
      ...(initial ? { id: initial.id } : {}),
      name: name.trim(),
      templateId: source === "template" ? templateId : null,
      spec: { ...spec, format },
      recipients,
      deliver: byEmail && toMyExports ? "both" : byEmail ? "email" : "myexports",
      active,
      frequency,
      weekday: frequency === "weekly" ? weekday : null,
      monthDay: frequency === "monthly" ? monthDay : null,
      timeLocal: time,
    };
    const r = await saveExportScheduleAction({ schedule });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    successToast(initial ? "Plán uložen." : "Plán vytvořen.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        title={initial ? "Upravit plán" : "Nový plán"}
        description="Export se vytvoří sám v zadaný čas a pošle se příjemcům."
        className="top-[6vh] max-h-[88vh]"
      >
        <form
          className="px-5 py-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Název plánu">
            <Input
              value={name}
              maxLength={60}
              autoFocus
              placeholder="Např. Týdenní přehled zakázek"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <div className="mb-3">
            <p className="mb-1.5 text-sm font-medium text-muted">Co se exportuje</p>
            <SegmentedControl<Source>
              label="Zdroj dat plánu"
              value={source}
              onChange={setSource}
              options={[
                { value: "entity", label: "Typ dat" },
                { value: "template", label: "Šablona", tone: "accent" },
              ]}
            />
            <div className="mt-2">
              {source === "entity" ? (
                <Combobox
                  aria-label="Typ dat"
                  placeholder="Vyberte typ dat…"
                  searchPlaceholder="Hledat typ dat…"
                  value={entity}
                  options={entities.map((e) => ({ value: e.key, label: e.label }))}
                  onChange={(v) => setEntity((v as string | null) ?? null)}
                />
              ) : (
                <Combobox
                  aria-label="Šablona"
                  placeholder={templates.length ? "Vyberte šablonu…" : "Nemáte žádné šablony"}
                  searchPlaceholder="Hledat šablonu…"
                  emptyText="Žádná šablona"
                  value={templateId}
                  options={templates.map((t) => ({
                    value: t.id,
                    label: t.name,
                    hint: t.entityLabel,
                  }))}
                  onChange={(v) => {
                    const id = (v as string | null) ?? null;
                    setTemplateId(id);
                    const t = templates.find((x) => x.id === id);
                    if (t) setFormat(t.spec.format);
                  }}
                />
              )}
            </div>
            {customView && (
              <p className="mt-1.5 text-sm text-faint">
                Export použije uložené sloupce a filtry
                {source === "template" ? " ze šablony" : " plánu"}.
              </p>
            )}
          </div>

          <div className="mb-3">
            <p className="mb-1.5 text-sm font-medium text-muted">Formát</p>
            <SegmentedControl<Format>
              label="Formát souboru"
              value={format}
              onChange={setFormat}
              options={[
                { value: "csv", label: "CSV" },
                { value: "xlsx", label: "XLSX" },
                { value: "pdf", label: "PDF" },
              ]}
            />
          </div>

          <div className="mb-3">
            <p className="mb-1.5 text-sm font-medium text-muted">Jak často</p>
            <SegmentedControl<Frequency>
              label="Četnost plánu"
              value={frequency}
              onChange={setFrequency}
              options={[
                { value: "daily", label: "Denně" },
                { value: "weekly", label: "Týdně" },
                { value: "monthly", label: "Měsíčně" },
              ]}
            />
            <div className="mt-2 grid gap-x-3 gap-y-2 @sm:grid-cols-2">
              {frequency === "weekly" && (
                <Combobox
                  aria-label="Den v týdnu"
                  value={String(weekday)}
                  options={WEEKDAYS.map((d) => ({ value: String(d.value), label: d.label }))}
                  onChange={(v) => v && setWeekday(Number(v))}
                />
              )}
              {frequency === "monthly" && (
                <Combobox
                  aria-label="Den v měsíci"
                  value={String(monthDay)}
                  options={MONTH_DAYS.map((d) => ({ value: String(d.value), label: d.label }))}
                  onChange={(v) => v && setMonthDay(Number(v))}
                />
              )}
              <Input
                type="time"
                aria-label="Čas spuštění"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <p className="mt-1.5 text-sm text-faint">Čas platí v české časové zóně.</p>
          </div>

          <div className="mb-3">
            <p className="mb-1.5 text-sm font-medium text-muted">
              Příjemci ({recipients.length}/{MAX_RECIPIENTS})
            </p>
            <Combobox
              aria-label="Přidat příjemce"
              multiple
              load={lookup}
              value={recipients}
              selectedLabels={labels}
              searchPlaceholder="Hledat podle jména…"
              emptyText="Nikdo nenalezen"
              onChange={(v) => {
                const next = Array.isArray(v) ? v : v ? [v] : [];
                setRecipients(next.slice(0, MAX_RECIPIENTS));
              }}
              trigger={
                <button
                  type="button"
                  aria-label="Přidat příjemce"
                  className="flex h-8 w-full items-center rounded-md border border-line-strong bg-bg px-2.5 text-left text-base text-faint hover:border-faint"
                >
                  Přidat příjemce…
                </button>
              }
            />
            {recipients.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Vybraní příjemci">
                {recipients.map((id) => (
                  <li key={id}>
                    <Chip className="gap-1">
                      {labels[id] ?? "Neznámý uživatel"}
                      <button
                        type="button"
                        aria-label={`Odebrat příjemce ${labels[id] ?? ""}`}
                        className="-mr-1 inline-flex size-4 cursor-pointer items-center justify-center rounded-full hover:bg-hover"
                        onClick={() => setRecipients((prev) => prev.filter((x) => x !== id))}
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-sm text-faint">
              Příjemce musí mít právo na exportovaná data, jinak server plán nepřijme.
            </p>
          </div>

          <fieldset className="mb-3">
            <legend className="mb-1.5 text-sm font-medium text-muted">Doručení</legend>
            <div className="space-y-1">
              <label className="flex min-h-8 cursor-pointer items-center gap-2 pointer-coarse:min-h-11">
                <Checkbox checked={byEmail} onCheckedChange={(v) => setByEmail(!!v)} />
                Poslat e-mailem
              </label>
              <label className="flex min-h-8 cursor-pointer items-center gap-2 pointer-coarse:min-h-11">
                <Checkbox checked={toMyExports} onCheckedChange={(v) => setToMyExports(!!v)} />
                Uložit do Moje exporty
              </label>
            </div>
          </fieldset>

          <label className="mb-3 flex min-h-8 cursor-pointer items-center gap-2 pointer-coarse:min-h-11">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(!!v)} />
            Plán je zapnutý
          </label>

          {error && (
            <p role="alert" className="mb-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {initial ? "Uložit plán" : "Vytvořit plán"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
