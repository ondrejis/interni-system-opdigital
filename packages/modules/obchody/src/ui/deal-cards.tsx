"use client";

import { formatDate } from "@rebar/core/shared";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Combobox,
  EmptyState,
  Icon,
  IconButton,
  Input,
  SegmentedControl,
  Skeleton,
  Textarea,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useModuleUi,
  useNav,
  type RecordOverviewCard,
  type TimelineItem,
} from "@rebar/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { DealDetail } from "../contract";
import { sourceLabel } from "./deal-card";
import { useDealDetail } from "./deal-header";
import { pluralDays } from "./logic";

/* ---------- Úkoly a poznámky (modul Úkoly, volitelný): jen přes příkazy, bez importu ---------- */

type TaskLite = {
  id: string;
  title: string;
  typeKey: string;
  typeName: string;
  status: string;
  dueDate: string | null;
  dueTime: string | null;
  completedAt: string | null;
  outcome: string | null;
  assigneeName: string | null;
  state: string;
};
type NoteLite = { id: string; title: string | null; bodyText: string; createdAt: string; pinned: boolean };

/** Je zapnutý modul Úkoly? (Další aktivita, zápisy a časová osa pak používají jeho příkazy.) */
const useHasTasks = () => useModuleUi().has("ukoly");

const TASK_TYPES = [
  { value: "call", label: "Hovor" },
  { value: "meeting", label: "Schůzka" },
  { value: "task", label: "Úkol" },
  { value: "email", label: "E-mail" },
] as const;

const dueLabel = (t: { dueDate: string | null; dueTime: string | null }) =>
  t.dueDate ? `${formatDate(t.dueDate)}${t.dueTime ? ` ${t.dueTime}` : ""}` : "bez termínu";

function useDealTasks(dealId: string, enabled: boolean) {
  return useCommandQuery<{ open: TaskLite[]; done: TaskLite[] }, { dealId: string; include: "all"; limit: number }>(
    "ukoly.forRecord",
    { dealId, include: "all", limit: 100 },
    { enabled },
  );
}

/* ---------- Další aktivita (OBCH-11) ---------- */

/** Blok „Další aktivita“: nejbližší otevřená aktivita a rychlé přidání (typ + text, např. „zavolat zítra 10:00“). */
function NextActivityCard({ id, companyId, personId }: { id: string; companyId: string | null; personId: string | null }) {
  const detail = useDealDetail(id);
  const tasks = useDealTasks(id, true);
  const [type, setType] = useState<string>("call");
  const [text, setText] = useState("");
  const add = useCommandMutation<Record<string, unknown>, unknown>("ukoly.quickAdd", {
    onSuccess: () => {
      setText("");
      successToast("Aktivita je naplánovaná.");
    },
  });
  const open = (tasks.data?.open ?? [])
    .slice()
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const next = open[0];
  const closed = detail.data && detail.data.deal.result !== "open";
  return (
    <Card aria-label="Další aktivita" data-testid="next-activity-card">
      <CardHeader title="Další aktivita" />
      <CardBody>
        {next ? (
          <div className="flex items-center gap-2" data-testid="next-activity-current">
            <Icon
              name={next.state === "overdue" ? "alarm-clock" : "calendar"}
              className={next.state === "overdue" ? "text-danger" : "text-muted"}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{next.title}</span>
            <span className={next.state === "overdue" ? "text-danger" : "text-muted"}>{dueLabel(next)}</span>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-warning" data-testid="next-activity-none">
            <Icon name="alert-triangle" className="size-4" /> Bez naplánované další aktivity.
          </p>
        )}
        {open.length > 1 && <p className="mt-1 text-sm text-muted">+ {open.length - 1} dalších otevřených</p>}
        {!closed && (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              add.mutate(
                {
                  text: text.trim(),
                  override: { typeKey: type },
                  dealId: id,
                  ...(companyId ? { companyId } : {}),
                  ...(personId ? { personId } : {}),
                },
                { onError: (err) => errorToast(err.message) },
              );
            }}
          >
            <SegmentedControl
              label="Typ aktivity"
              value={type}
              onChange={setType}
              options={TASK_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            />
            <div className="flex gap-2">
              <Input
                aria-label="Nová aktivita"
                value={text}
                maxLength={1000}
                placeholder="např. zavolat zítra 10:00"
                onChange={(e) => setText(e.target.value)}
              />
              <Button type="submit" variant="primary" loading={add.isPending} data-testid="next-activity-add">
                <Icon name="plus" /> Přidat
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

/* ---------- Rychlé zápisy: poznámka a zapsaná aktivita ---------- */

const doc = (text: string) => ({
  type: "doc",
  content: text
    .split(/\n{2,}/)
    .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p.replace(/\n/g, " ") }] })),
});

/** Rychlé zápisy: poznámka a hotová aktivita (hovor, schůzka, e-mail); e-mail ze šablony je v akcích hlavičky. */
function QuickEntriesCard({ id, companyId, personId }: { id: string; companyId: string | null; personId: string | null }) {
  const [kind, setKind] = useState<"note" | "activity">("note");
  const [text, setText] = useState("");
  const [type, setType] = useState<string>("call");
  const note = useCommandMutation<Record<string, unknown>, unknown>("ukoly.note.create", {
    onSuccess: () => {
      setText("");
      successToast("Poznámka je uložená.");
    },
  });
  const activity = useCommandMutation<Record<string, unknown>, unknown>("ukoly.create", {
    onSuccess: () => {
      setText("");
      successToast("Aktivita je zapsaná.");
    },
  });
  const busy = note.isPending || activity.isPending;
  function submit() {
    const t = text.trim();
    if (!t) return;
    if (kind === "note")
      note.mutate({ dealId: id, bodyJson: doc(t) }, { onError: (e) => errorToast(e.message) });
    else
      activity.mutate(
        {
          title: t,
          typeKey: type,
          done: true,
          dealId: id,
          ...(companyId ? { companyId } : {}),
          ...(personId ? { personId } : {}),
        },
        { onError: (e) => errorToast(e.message) },
      );
  }
  return (
    <Card aria-label="Rychlé zápisy" data-testid="quick-entries-card">
      <CardHeader title="Rychlé zápisy" />
      <CardBody className="space-y-2">
        <SegmentedControl
          label="Druh zápisu"
          value={kind}
          onChange={setKind}
          options={[
            { value: "note", label: "Poznámka" },
            { value: "activity", label: "Proběhlá aktivita" },
          ]}
        />
        {kind === "activity" && (
          <SegmentedControl
            label="Typ aktivity"
            value={type}
            onChange={setType}
            options={TASK_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          />
        )}
        <Textarea
          aria-label={kind === "note" ? "Text poznámky" : "Co proběhlo"}
          value={text}
          rows={3}
          maxLength={5000}
          placeholder={kind === "note" ? "Poznámka k obchodu…" : "Např. volali jsme o termínu spuštění"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
        />
        <div className="flex justify-end">
          <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={submit} data-testid="quick-entry-save">
            Uložit
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* ---------- Časová osa ---------- */

type Entry = { key: string; at: string; icon: string; text: string; detail?: string | null; actor?: string | null };

/** Pole, která se v časové ose neukazují (odvozená systémem; změna fáze má vlastní řádek z historie fází). */
const HIDDEN_FIELDS = new Set([
  "stageId",
  "status",
  "stageEnteredAt",
  "weightedMinor",
  "weighted",
  "nextActivityAt",
  "lastActivityAt",
  "nextTaskId",
  "firstOpenedAt",
  "openedBy",
  "result",
  "wonAt",
  "lostAt",
  "updatedAt",
]);

const fmt = (v: unknown): string =>
  v === null || v === undefined || v === ""
    ? "—"
    : Array.isArray(v)
      ? v.join(", ")
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);

/** Složí položky časové osy: změny fází, změny polí, dokončené aktivity, poznámky a komentáře (od nejnovější). */
export function buildTimeline(input: {
  detail: DealDetail | undefined;
  audit: TimelineItem[];
  tasks: TaskLite[];
  notes: NoteLite[];
  fieldLabel: (field: string) => string;
}): Entry[] {
  const out: Entry[] = [];
  const { detail } = input;
  for (const h of detail?.history ?? []) {
    out.push({
      key: `stage-${h.id}`,
      at: h.enteredAt,
      icon: "arrow-right",
      text: h.fromStageId ? `Fáze: ${h.stageName}` : `Obchod založen ve fázi ${h.stageName}`,
      actor: h.byUserName,
    });
  }
  if (detail?.deal.wonAt)
    out.push({ key: "won", at: detail.deal.wonAt, icon: "trophy", text: "Obchod vyhrán" });
  if (detail?.deal.lostAt)
    out.push({
      key: "lost",
      at: detail.deal.lostAt,
      icon: "thumbs-down",
      text: `Obchod prohrán${detail.deal.lostReasonLabel ? `: ${detail.deal.lostReasonLabel}` : ""}`,
      detail: detail.deal.lostNote,
    });
  for (const a of input.audit) {
    if (a.kind === "comment")
      out.push({ key: `c-${a.id}`, at: a.at, icon: "message-square", text: a.body, actor: a.actor });
    else {
      const changes = a.changes.filter((c) => !HIDDEN_FIELDS.has(c.field));
      if (a.action === "update" && changes.length === 0) continue;
      if (a.action !== "update" && a.action !== "create") continue; // výhry, prohry a fáze mají vlastní řádky
      out.push({
        key: `a-${a.id}`,
        at: a.at,
        icon: a.action === "create" ? "plus" : "pencil",
        text: a.action === "create" ? "Obchod vytvořen" : "Změna údajů",
        detail: changes.map((c) => `${input.fieldLabel(c.field)}: ${fmt(c.old)} → ${fmt(c.new)}`).join("; ") || null,
        actor: a.actor,
      });
    }
  }
  for (const t of input.tasks)
    out.push({
      key: `t-${t.id}`,
      at: t.completedAt ?? t.dueDate ?? "",
      icon: "circle-check",
      text: `${t.typeName}: ${t.title}`,
      detail: t.outcome,
      actor: t.assigneeName,
    });
  for (const n of input.notes)
    out.push({
      key: `n-${n.id}`,
      at: n.createdAt,
      icon: "file-text",
      text: n.title || "Poznámka",
      detail: n.bodyText,
    });
  return out.filter((e) => e.at).sort((a, b) => b.at.localeCompare(a.at));
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: iso.length > 10 ? "short" : undefined, timeZone: "Europe/Prague" }).format(new Date(iso));

/** Časová osa obchodu: změny fází a polí, hotové aktivity, poznámky a komentáře. */
function TimelineCard({ id, fieldLabel }: { id: string; fieldLabel: (f: string) => string }) {
  const api = useEntityApi();
  const hasTasks = useHasTasks();
  const detail = useDealDetail(id);
  const activity = useQuery({ queryKey: ["entity", "deal", "activity", id], queryFn: () => api.activity("deal", id) });
  const tasks = useDealTasks(id, hasTasks);
  const notes = useCommandQuery<{ rows: NoteLite[] }, { dealId: string }>("ukoly.note.list", { dealId: id }, { enabled: hasTasks });
  const entries = useMemo(
    () =>
      buildTimeline({
        detail: detail.data,
        audit: activity.data?.timeline ?? [],
        tasks: (tasks.data?.done ?? []).filter((t) => t.status === "done"),
        notes: notes.data?.rows ?? [],
        fieldLabel,
      }),
    [detail.data, activity.data, tasks.data, notes.data, fieldLabel],
  );
  return (
    <Card aria-label="Časová osa" data-testid="deal-timeline">
      <CardHeader title="Časová osa" />
      <CardBody>
        {detail.isLoading || activity.isLoading ? (
          <Skeleton className="h-24" />
        ) : entries.length === 0 ? (
          <EmptyState title="Zatím nic" description="Změny fází, aktivity a poznámky se objeví tady." />
        ) : (
          <ol className="space-y-3">
            {entries.map((e) => (
              <li key={e.key} className="flex gap-3" data-testid="timeline-entry">
                <Icon name={e.icon} className="mt-0.5 size-4 shrink-0 text-faint" />
                <div className="min-w-0">
                  <div className="[overflow-wrap:anywhere]">{e.text}</div>
                  {e.detail && <div className="text-sm text-muted [overflow-wrap:anywhere]">{e.detail}</div>}
                  <div className="text-xs text-faint">
                    {when(e.at)}
                    {e.actor ? ` · ${e.actor}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

/* ---------- Boční karty: kontakty, fáze a čas, původ ---------- */

/** Hlavní kontakt a další kontakty obchodu (přidání a odebrání). */
function ContactsCard({ id, canWrite }: { id: string; canWrite: boolean }) {
  const api = useEntityApi();
  const nav = useNav();
  const detail = useDealDetail(id);
  const add = useCommandMutation<{ dealId: string; personId: string }, unknown>("obchody.participants.add");
  const remove = useCommandMutation<{ dealId: string; personId: string }, unknown>("obchody.participants.remove");
  const d = detail.data;
  return (
    <Card aria-label="Kontakty" data-testid="deal-contacts">
      <CardHeader title="Kontakty" />
      <CardBody className="space-y-2">
        {d?.deal.personId && (
          <div className="flex items-center gap-2">
            <Avatar name={d.deal.personName ?? "?"} size={22} />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-accent hover:underline"
              onClick={() => nav.push(`/kontakty/osoby/${d.deal.personId}`)}
            >
              {d.deal.personName ?? "Kontakt"}
            </button>
            <Chip>hlavní</Chip>
          </div>
        )}
        {(d?.participants ?? []).map((p) => (
          <div key={p.id} className="flex items-center gap-2" data-testid="deal-participant">
            <Avatar name={p.personName ?? "?"} size={22} />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-accent hover:underline"
              onClick={() => nav.push(`/kontakty/osoby/${p.personId}`)}
            >
              {p.personName ?? "Kontakt"}
            </button>
            {canWrite && (
              <IconButton
                label="Odebrat kontakt"
                onClick={() => remove.mutate({ dealId: id, personId: p.personId }, { onError: (e) => errorToast(e.message) })}
              >
                <Icon name="x" />
              </IconButton>
            )}
          </div>
        ))}
        {!d?.deal.personId && !(d?.participants.length ?? 0) && <p className="text-muted">Zatím bez kontaktu.</p>}
        {canWrite && (
          <Combobox
            aria-label="Přidat další kontakt"
            load={(q) => api.lookups.records("person", q)}
            value={null}
            placeholder="Přidat další kontakt…"
            searchPlaceholder="Hledat kontakt…"
            onChange={(v) => {
              if (typeof v === "string")
                add.mutate({ dealId: id, personId: v }, { onError: (e) => errorToast(e.message) });
            }}
          />
        )}
      </CardBody>
    </Card>
  );
}

/** Dny v jednotlivých fázích (OBCH-09). */
function StageTimeCard({ id }: { id: string }) {
  const detail = useDealDetail(id);
  const rows = detail.data?.history ?? [];
  if (!rows.length) return null;
  return (
    <Card aria-label="Fáze a čas" data-testid="deal-stage-time">
      <CardHeader title="Fáze a čas" />
      <CardBody className="space-y-1">
        {rows.map((h) => (
          <div key={h.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{h.stageName}</span>
            <span className="tabular text-muted">
              {h.days} {pluralDays(h.days)}
              {!h.leftAt && " (nyní)"}
            </span>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

/** Původ obchodu: zdroj a u Meta leadu kampaň, sada a reklama. */
function SourceCard({ id }: { id: string }) {
  const d = useDealDetail(id).data?.deal;
  if (!d || d.source === "manual") return null;
  const lines: [string, string | null][] = [
    ["Zdroj", sourceLabel(d.source)],
    ["Detail", d.sourceDetail],
    ["Kampaň", d.metaCampaignId],
    ["Sada reklam", d.metaAdsetId],
    ["Reklama", d.metaAdId],
  ];
  return (
    <Card aria-label="Původ" data-testid="deal-source">
      <CardHeader title="Původ" />
      <CardBody className="space-y-1 text-sm">
        {lines
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-muted">{k}</span>
              <span className="min-w-0 truncate" title={v ?? ""}>
                {v}
              </span>
            </div>
          ))}
      </CardBody>
    </Card>
  );
}

/** Karty Přehledu obchodu (hlavní sloupec: aktivita, zápisy, časová osa; vedle údajů: kontakty, fáze, původ). */
export const dealOverview: readonly RecordOverviewCard[] = [
  {
    id: "next-activity",
    order: 10,
    render: ({ id, row }) => <NextActivityGate id={id} companyId={(row.company as string) ?? null} personId={(row.person as string) ?? null} />,
  },
  {
    id: "quick-entries",
    order: 20,
    render: ({ id, row, entity }) =>
      entity.can.write ? (
        <QuickEntriesGate id={id} companyId={(row.company as string) ?? null} personId={(row.person as string) ?? null} />
      ) : null,
  },
  {
    id: "timeline",
    order: 90,
    render: ({ id, entity }) => (
      <TimelineCard
        id={id}
        fieldLabel={(f) => entity.attributes.find((a) => a.key === f || a.field === f)?.label ?? f}
      />
    ),
  },
  {
    id: "contacts",
    column: "side",
    order: 10,
    render: ({ id, entity }) => <ContactsCard id={id} canWrite={entity.can.write} />,
  },
  { id: "stage-time", column: "side", order: 20, render: ({ id }) => <StageTimeCard id={id} /> },
  { id: "source", column: "side", order: 30, render: ({ id }) => <SourceCard id={id} /> },
];

function NextActivityGate(p: { id: string; companyId: string | null; personId: string | null }) {
  return useHasTasks() ? <NextActivityCard {...p} /> : null;
}
function QuickEntriesGate(p: { id: string; companyId: string | null; personId: string | null }) {
  return useHasTasks() ? <QuickEntriesCard {...p} /> : null;
}
