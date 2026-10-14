"use client";

import {
  Button,
  Checkbox,
  Chip,
  Combobox,
  FormSection,
  Notice,
  SegmentedControl,
  Skeleton,
  Textarea,
  TextField,
  Input,
  Label,
  cn,
} from "@rebar/ui";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  ListChecks,
  RotateCcw,
  Stethoscope,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { runAction } from "@/lib/run-action";
import { getNotificationRules, saveNotificationRules } from "@/server/notification-actions";
import { REASON_LABEL, STATUS_LABEL, when } from "../upozorneni/labels";

type Channel = "push" | "bell" | "email";
type Severity = "normal" | "urgent";
type Rule = {
  enabled?: boolean;
  mandatory?: boolean;
  severity?: Severity;
  channels?: Partial<Record<Channel, boolean>>;
  recipients?: string[];
  title?: string;
  body?: string;
};
type Data = NonNullable<
  Awaited<ReturnType<typeof getNotificationRules>> extends infer R
    ? R extends { ok: true; data: infer D }
      ? D
      : never
    : never
>;
type EventView = Data["rules"]["events"][number];

const CHANNELS: { key: Channel; label: string }[] = [
  { key: "push", label: "Do telefonu" },
  { key: "bell", label: "Zvoneček" },
  { key: "email", label: "E-mail" },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Hodnoty rule nad základem události. */
function view(e: EventView, r: Rule) {
  return {
    enabled: r.enabled ?? e.base.enabled,
    mandatory: r.mandatory ?? e.base.mandatory,
    severity: r.severity ?? e.base.severity,
    channels: { ...e.base.channels, ...r.channels } as Record<Channel, boolean>,
    recipients: r.recipients ?? e.base.recipients,
    title: r.title ?? e.base.title,
    body: r.body ?? e.base.body,
  };
}

/** Úprava pravidla bez položek, které se rovnají základu. */
function normalize(e: EventView, r: Rule): Rule {
  const out: Rule = {};
  if (r.enabled !== undefined && r.enabled !== e.base.enabled) out.enabled = r.enabled;
  if (r.mandatory !== undefined && r.mandatory !== e.base.mandatory) out.mandatory = r.mandatory;
  if (r.severity !== undefined && r.severity !== e.base.severity) out.severity = r.severity;
  const ch: Partial<Record<Channel, boolean>> = {};
  for (const c of CHANNELS)
    if (r.channels?.[c.key] !== undefined && r.channels[c.key] !== e.base.channels[c.key])
      ch[c.key] = r.channels[c.key]!;
  if (Object.keys(ch).length) out.channels = ch;
  if (r.recipients && !same(r.recipients, e.base.recipients)) out.recipients = r.recipients;
  if (r.title !== undefined && r.title !== e.base.title) out.title = r.title;
  if (r.body !== undefined && r.body !== e.base.body) out.body = r.body;
  return out;
}

/** Náhled textu s ukázkovými hodnotami (řádek s chybějícím parametrem se vynechá, jako na serveru). */
function preview(tpl: string, e: EventView): string {
  const ex: Record<string, string> = Object.fromEntries(e.params.map((p) => [p.name, p.example]));
  ex.entityId = "…";
  return tpl
    .split("\n")
    .map((line) => {
      let missing = false;
      const text = line.replace(/\{([a-zA-Z0-9]+)\}/g, (_, n: string) => {
        if (ex[n] === undefined) missing = true;
        return ex[n] ?? "";
      });
      return missing ? "" : text.trim();
    })
    .filter(Boolean)
    .join("\n");
}

export function NotificationRules() {
  const q = useQuery({
    queryKey: ["notification-rules"],
    queryFn: async () => {
      const r = await getNotificationRules({});
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    staleTime: 0,
  });
  if (q.isLoading)
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  if (q.error || !q.data)
    return (
      <Notice tone="error">
        {(q.error as Error)?.message ?? "Nepodařilo se načíst pravidla."}
      </Notice>
    );
  return <Editor data={q.data} onSaved={() => void q.refetch()} />;
}

function Editor({ data, onSaved }: { data: Data; onSaved: () => void }) {
  const { rules } = data;
  const [rulesState, setRules] = useState<Record<string, Rule>>(() =>
    Object.fromEntries(rules.events.map((e) => [e.key, e.adminRule as Rule])),
  );
  const [quiet, setQuiet] = useState(rules.quietHours);
  const [digest, setDigest] = useState<[string, string]>([
    rules.digestTimes[0] ?? "07:00",
    rules.digestTimes[1] ?? "",
  ]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, EventView[]>();
    for (const e of rules.events) m.set(e.group, [...(m.get(e.group) ?? []), e]);
    return [...m];
  }, [rules.events]);

  const edit = (e: EventView, p: Rule) => {
    setRules((cur) => ({ ...cur, [e.key]: normalize(e, { ...cur[e.key], ...p }) }));
    setDirty(true);
  };

  async function save() {
    setSaving(true);
    const events = Object.fromEntries(
      Object.entries(rulesState).filter(([, r]) => Object.keys(r).length),
    );
    const times = [digest[0], digest[1]].filter(Boolean);
    const r = await runAction(
      saveNotificationRules({
        events,
        ...(!same(quiet, rules.configQuietHours) ? { quietHours: quiet } : {}),
        ...(times.length && !same(times, rules.configDigestTimes) ? { digestTimes: times } : {}),
      }),
      "Pravidla upozornění jsou uložená.",
    );
    setSaving(false);
    if (r) {
      setDirty(false);
      onSaved();
    }
  }

  const saveBar = (
    <>
      {dirty && <span className="mr-auto text-sm text-muted">Neuložené změny</span>}
      <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
        Uložit pravidla
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      {!data.pushConfigured && (
        <Notice tone="warning" title="Upozornění do telefonu nejsou na serveru zapnutá">
          Chybí klíče VAPID (proměnné VAPID_PUBLIC_KEY a VAPID_PRIVATE_KEY). Zvoneček a e-mail
          fungují, push se přeskakuje. Postup je v dokumentu NOTIFICATIONS.md, oddíl „Push nechodí“.
        </Notice>
      )}

      <FormSection
        title="Tiché hodiny a shrnutí firmy"
        icon={<Clock />}
        description={`Výchozí pro všechny uživatele (každý si je může změnit). Časy jsou v pásmu ${rules.timezone}.`}
        footer={saveBar}
      >
        <div className="grid gap-5 @2xl:grid-cols-2">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-base font-medium">
              <Checkbox
                checked={quiet.enabled}
                onCheckedChange={(v) => {
                  setQuiet({ ...quiet, enabled: v === true });
                  setDirty(true);
                }}
                aria-label="Tiché hodiny zapnuty"
              />
              Tiché hodiny (push se zdrží, naléhavé projdou)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Od"
                type="time"
                density="compact"
                value={quiet.start}
                disabled={!quiet.enabled}
                onChange={(e) => {
                  setQuiet({ ...quiet, start: e.target.value });
                  setDirty(true);
                }}
              />
              <TextField
                label="Do"
                type="time"
                density="compact"
                value={quiet.end}
                disabled={!quiet.enabled}
                onChange={(e) => {
                  setQuiet({ ...quiet, end: e.target.value });
                  setDirty(true);
                }}
              />
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="font-medium">Časy shrnutí</h4>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="První"
                type="time"
                density="compact"
                value={digest[0]}
                onChange={(e) => {
                  setDigest([e.target.value, digest[1]]);
                  setDirty(true);
                }}
              />
              <TextField
                label="Druhé (nepovinné)"
                type="time"
                density="compact"
                value={digest[1]}
                onChange={(e) => {
                  setDigest([digest[0], e.target.value]);
                  setDirty(true);
                }}
              />
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Události"
        icon={<ListChecks />}
        description="Vypněte události, které firma nepotřebuje, nastavte příjemce a kanály nebo přepište text. Změna platí pro nová upozornění."
        flush
        footer={saveBar}
      >
        <div data-testid="rules-list">
          {groups.map(([group, list]) => (
            <div key={group} className="border-t border-line first:border-t-0">
              <h4 className="bg-subtle px-5 py-2 text-sm font-semibold uppercase tracking-wide text-muted">
                {group}
              </h4>
              <ul className="divide-y divide-line">
                {list.map((e) => {
                  const v = view(e, rulesState[e.key] ?? {});
                  const changed = Object.keys(rulesState[e.key] ?? {}).length > 0;
                  const isOpen = open === e.key;
                  return (
                    <li key={e.key} data-testid={`rule-${e.key}`}>
                      <div className="flex items-start gap-3 px-5 py-3">
                        <Checkbox
                          className="mt-1"
                          checked={v.enabled}
                          onCheckedChange={(c) => edit(e, { enabled: c === true })}
                          aria-label={`Událost zapnuta: ${e.label}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "flex flex-wrap items-center gap-2 font-medium",
                              !v.enabled && "text-faint line-through",
                            )}
                          >
                            {e.label}
                            {v.severity === "urgent" && <Chip color="red">Naléhavé</Chip>}
                            {v.mandatory && <Chip color="blue">Povinné</Chip>}
                            {e.scheduled && <Chip>Plánované</Chip>}
                            {(changed || e.configured) && <Chip color="purple">Upraveno</Chip>}
                          </p>
                          <p className="text-sm text-muted">{e.description}</p>
                          {v.enabled && (
                            <p className="mt-1 text-sm text-muted">
                              Komu:{" "}
                              {v.recipients.map((t) => labelOf(t, e, data)).join(", ") || "nikomu"}{" "}
                              · Kudy:{" "}
                              {CHANNELS.filter((c) => v.channels[c.key])
                                .map((c) => c.label.toLowerCase())
                                .join(", ") || "nikudy"}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-expanded={isOpen}
                          onClick={() => setOpen(isOpen ? null : e.key)}
                        >
                          {isOpen ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                          Upravit
                        </Button>
                      </div>
                      {isOpen && (
                        <EventEditor
                          e={e}
                          v={v}
                          data={data}
                          edit={(p) => edit(e, p)}
                          reset={() => {
                            setRules((cur) => ({ ...cur, [e.key]: {} }));
                            setDirty(true);
                          }}
                          changed={changed}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </FormSection>

      <Diagnostics stats={data.stats} />
    </div>
  );
}

function labelOf(token: string, e: EventView, data: Data): string {
  if (token.startsWith("perm:")) {
    const k = token.slice(5);
    return `oprávnění „${data.permissions.find((p) => p.key === k)?.label ?? k}“`;
  }
  if (token.startsWith("role:")) {
    const k = token.slice(5);
    return `role „${data.roles.find((r) => r.key === k)?.name ?? k}“`;
  }
  return (e.audiences[token] ?? token).toLowerCase();
}

function EventEditor({
  e,
  v,
  data,
  edit,
  reset,
  changed,
}: {
  e: EventView;
  v: ReturnType<typeof view>;
  data: Data;
  edit: (p: Rule) => void;
  reset: () => void;
  changed: boolean;
}) {
  const options = [
    ...Object.entries(e.audiences).map(([k, label]) => ({
      value: k,
      label,
      hint: "skupina události",
    })),
    ...data.roles.map((r) => ({
      value: `role:${r.key}`,
      label: `Role: ${r.name}`,
      hint: "všichni v roli",
    })),
    ...data.permissions.map((p) => ({
      value: `perm:${p.key}`,
      label: `Oprávnění: ${p.label}`,
      hint: p.key,
    })),
  ].filter((o) => !v.recipients.includes(o.value));
  const idTitle = `title-${e.key}`;
  const idBody = `body-${e.key}`;
  /** Do kterého pole se vkládá údaj: do toho, ve kterém je kurzor (výchozí titulek). */
  const [target, setTarget] = useState<"title" | "body">("title");
  const insert = (name: string) => edit({ [target]: `${v[target]}{${name}}` } as Rule);
  return (
    <div
      className="space-y-4 border-t border-dashed border-line bg-subtle px-5 py-4"
      data-testid={`rule-editor-${e.key}`}
    >
      <div className="grid gap-4 @2xl:grid-cols-2">
        <div className="space-y-2">
          <Label>Kanály (výchozí zapnuté)</Label>
          <div className="flex flex-wrap gap-4">
            {CHANNELS.map((c) => (
              <label key={c.key} className="flex min-h-9 items-center gap-2 text-sm">
                <Checkbox
                  checked={v.channels[c.key]}
                  onCheckedChange={(on) => edit({ channels: { [c.key]: on === true } })}
                  aria-label={`${c.label}: ${e.label}`}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Závažnost a povinnost</Label>
          <div className="flex flex-wrap items-center gap-4">
            <SegmentedControl<Severity>
              label={`Závažnost: ${e.label}`}
              options={[
                { value: "normal", label: "Běžné" },
                { value: "urgent", label: "Naléhavé" },
              ]}
              value={v.severity}
              onChange={(s) => edit({ severity: s })}
            />
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <Checkbox
                checked={v.mandatory}
                onCheckedChange={(on) => edit({ mandatory: on === true })}
                aria-label={`Povinná událost: ${e.label}`}
              />
              Povinné (uživatel nemůže vypnout)
            </label>
          </div>
          <p className="text-sm text-muted">Naléhavé upozornění prorazí tiché hodiny i shrnutí.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Příjemci</Label>
        <div className="flex flex-wrap items-center gap-2">
          {v.recipients.map((t) => (
            <Chip key={t} color="blue" className="gap-1">
              {labelOf(t, e, data)}
              <button
                type="button"
                aria-label={`Odebrat příjemce ${labelOf(t, e, data)}`}
                className="-mr-1 inline-flex size-5 items-center justify-center rounded hover:bg-hover"
                onClick={() => edit({ recipients: v.recipients.filter((x) => x !== t) })}
              >
                <X className="size-3" />
              </button>
            </Chip>
          ))}
          <Combobox
            options={options}
            value={null}
            placeholder="Přidat příjemce…"
            searchPlaceholder="Skupina, role nebo oprávnění…"
            aria-label={`Přidat příjemce: ${e.label}`}
            onChange={(val) => {
              if (typeof val === "string") edit({ recipients: [...v.recipients, val] });
            }}
          />
        </div>
        <p className="text-sm text-muted">
          Upozornění dostane jen ten, kdo smí záznam, kterého se týká, vidět.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor={idTitle}>Titulek</Label>
          <Input
            id={idTitle}
            value={v.title}
            maxLength={160}
            className="h-10"
            onFocus={() => setTarget("title")}
            onChange={(ev) => edit({ title: ev.target.value })}
          />
        </div>
        <div>
          <Label htmlFor={idBody}>
            Podtitulek (každý řádek se zobrazí jen tehdy, má-li všechny údaje)
          </Label>
          <Textarea
            id={idBody}
            value={v.body}
            rows={3}
            maxLength={400}
            onFocus={() => setTarget("body")}
            onChange={(ev) => edit({ body: ev.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted">
            Vložit údaj do {target === "title" ? "titulku" : "podtitulku"}:
          </span>
          {e.params.map((p) => (
            <button
              key={p.name}
              type="button"
              title={`${p.label}, např. ${p.example}${p.sensitive ? " (jen pro ty, kdo smí vidět peníze)" : ""}`}
              className="rounded-md border border-line bg-bg px-2 py-0.5 text-sm hover:bg-hover"
              onClick={() => insert(p.name)}
            >
              {`{${p.name}}`}
              {p.sensitive ? " 🔒" : ""}
            </button>
          ))}
        </div>
        <div
          className="rounded-lg border border-line bg-bg p-3 text-sm"
          data-testid={`rule-preview-${e.key}`}
        >
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Náhled</p>
          <p className="font-medium">{preview(v.title, e) || e.label}</p>
          {preview(v.body, e) && (
            <p className="whitespace-pre-line text-muted">{preview(v.body, e)}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => edit({ title: e.catalog.title, body: e.catalog.body })}
          >
            <RotateCcw className="size-3.5" /> Vrátit výchozí text
          </Button>
          {changed && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="size-3.5" /> Zrušit všechny úpravy této události
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Diagnostics({ stats }: { stats: Data["stats"] }) {
  const total = (status: string) =>
    stats.counts.filter((c) => c.status === status).reduce((a, c) => a + c.n, 0);
  return (
    <FormSection
      title="Doručování za posledních 24 hodin"
      icon={<Stethoscope />}
      description="Stav fronty upozornění. Selhání nemají obsah zpráv, jen událost, kanál a důvod."
    >
      <div className="space-y-4" data-testid="delivery-stats">
        <dl className="grid grid-cols-2 gap-3 @2xl:grid-cols-5">
          {(["sent", "skipped", "failed", "retry"] as const).map((s) => (
            <div key={s} className="rounded-lg border border-line p-3">
              <dt className="text-sm text-muted">{STATUS_LABEL[s]!.label}</dt>
              <dd className="text-xl font-semibold tabular">{total(s)}</dd>
            </div>
          ))}
          <div className="rounded-lg border border-line p-3">
            <dt className="text-sm text-muted">Čeká ve frontě</dt>
            <dd className="text-xl font-semibold tabular">{stats.pending}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted">Zařízení s odběrem celkem: {stats.devices}.</p>
        {stats.counts.some((c) => c.status === "skipped" && c.reason) && (
          <ul className="space-y-0.5 text-sm text-muted">
            {stats.counts
              .filter((c) => c.status === "skipped")
              .map((c) => (
                <li key={`${c.channel}-${c.reason}`}>
                  {c.n}× přeskočeno ({c.channel === "push" ? "telefon" : "e-mail"}):{" "}
                  {REASON_LABEL[c.reason ?? ""] ?? c.reason}
                </li>
              ))}
          </ul>
        )}
        {stats.failures.length > 0 && (
          <div>
            <h4 className="mb-1 font-medium">Poslední selhání</h4>
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {stats.failures.map((f, i) => (
                <li key={i} className="flex flex-wrap gap-x-3 px-3 py-2">
                  <span className="text-faint tabular">{when(f.at)}</span>
                  <span>{f.kind}</span>
                  <span className="text-muted">{f.channel === "push" ? "telefon" : "e-mail"}</span>
                  <span className="text-muted">
                    {REASON_LABEL[f.reason ?? ""] ?? f.error ?? f.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </FormSection>
  );
}
