"use client";

import { formatInstant } from "@rebar/core/time";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  ConfirmDialog,
  Icon,
  IconButton,
  Skeleton,
  Textarea,
  cn,
  errorToast,
  successToast,
  useCommandMutation,
  useEntityApi,
} from "@rebar/ui";
import { useRef, useState } from "react";
import { submitOnModEnter } from "./activity-form";
import { filterTimeline } from "./logic";
import { DueText, TypeIcon, mainTarget, useTimeline, type ActivityTarget } from "./ui-shared";
import {
  TIMELINE_FILTERS,
  TIMELINE_FILTER_LABELS,
  type NoteDto,
  type NoteComment,
  type TimelineEntry,
  type TimelineFilter,
  type TimelineResult,
} from "./types";

const ACTION_TEXT: Record<string, string> = {
  create: "vytvořil(a) záznam",
  update: "upravil(a)",
  delete: "smazal(a)",
  restore: "obnovil(a)",
};

/** Položka osy: bublina vlevo a svislá nit k další položce, mezi položkami rozestup `pb-5`. */
const ENTRY =
  "relative flex gap-3 pb-5 last:pb-0 before:absolute before:left-[11px] before:top-7 before:-bottom-0.5 before:w-0.5 before:bg-line last:before:hidden";

const thisYear = () => new Date().getFullYear();
const when = (at: string) => formatInstant(at, { year: new Date(at).getFullYear() !== thisYear() });

/** Hodnota změny v protokolu pro člověka. */
function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "ano" : "ne";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

const ICON_BY_KIND: Record<TimelineEntry["kind"], string> = {
  activity: "circle-check",
  note: "message-square",
  comment: "message-circle",
  file: "paperclip",
  audit: "history",
};

function Bullet({ kind, icon }: { kind: TimelineEntry["kind"]; icon?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
        kind === "activity" ? "bg-success-soft text-success" : "bg-hover text-muted",
      )}
    >
      <Icon name={icon ?? ICON_BY_KIND[kind]} className="size-3.5" />
    </span>
  );
}

/** Zdroj položky u souhrnné osy (zakázka, osoba, firma, ze které dění pochází). */
function SourceChip({
  entityType,
  entityId,
  labels,
}: {
  entityType: string;
  entityId: string;
  labels: TimelineResult["labels"];
}) {
  const label = (labels as Record<string, Record<string, string>>)[entityType]?.[entityId];
  if (!label) return null;
  const kind = entityType === "job" ? "Zakázka" : entityType === "person" ? "Osoba" : "Firma";
  return (
    <Chip color="gray" title={`${kind}: ${label}`} className="max-w-48 truncate">
      {label}
    </Chip>
  );
}

function Who({ name, at }: { name: string | null; at: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm text-faint">
      {name && <Avatar name={name} size={16} />}
      {name && <span className="text-muted">{name}</span>}
      <time dateTime={at} className="tabular">
        {when(at)}
      </time>
    </span>
  );
}

function NoteCard({
  entry,
  labels,
  aggregate,
  refresh,
}: {
  entry: Extract<TimelineEntry, { kind: "note" }>;
  labels: TimelineResult["labels"];
  aggregate: boolean;
  refresh: () => void;
}) {
  const api = useEntityApi();
  const { note, comments } = entry;
  const mine = note.authorId === api.me.id;
  const update = useCommandMutation<{ id: string; body: string }, NoteDto>("crm.note.update");
  const pin = useCommandMutation<{ id: string; pinned: boolean }, NoteDto>("crm.note.pin");
  const remove = useCommandMutation<{ id: string }, { id: string }>("crm.note.delete");
  const [editing, setEditing] = useState<string | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function saveEdit() {
    if (editing === null || !editing.trim()) return;
    try {
      await update.mutateAsync({ id: note.id, body: editing.trim() });
      setEditing(null);
    } catch (e) {
      errorToast((e as Error).message);
    }
  }
  async function sendComment() {
    if (!comment.trim() || busy) return;
    setBusy(true);
    try {
      await api.addComment("crm_note", note.id, comment.trim());
      setComment("");
      setCommenting(false);
      refresh();
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={ENTRY}>
      <Bullet kind="note" icon={note.pinned ? "pin" : undefined} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="rounded-lg border border-line-soft bg-subtle p-3">
          {editing !== null ? (
            <div onKeyDown={submitOnModEnter(() => void saveEdit())}>
              <Textarea
                aria-label="Upravit poznámku"
                rows={4}
                autoFocus
                maxLength={10_000}
                value={editing}
                onChange={(e) => setEditing(e.target.value)}
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Zrušit
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={update.isPending}
                  disabled={!editing.trim()}
                  onClick={() => void saveEdit()}
                >
                  Uložit
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-base">{note.body}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Who name={note.authorName} at={note.createdAt} />
            {aggregate && (
              <SourceChip entityType={note.entityType} entityId={note.entityId} labels={labels} />
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <IconButton
              label={note.pinned ? "Odepnout poznámku" : "Připnout poznámku"}
              size="sm"
              aria-pressed={note.pinned}
              className={cn(note.pinned && "text-warning")}
              onClick={() =>
                pin.mutate(
                  { id: note.id, pinned: !note.pinned },
                  { onError: (e) => errorToast((e as Error).message) },
                )
              }
            >
              <Icon name="pin" />
            </IconButton>
            <IconButton label="Komentovat" size="sm" onClick={() => setCommenting((c) => !c)}>
              <Icon name="message-circle" />
            </IconButton>
            {mine && (
              <IconButton label="Upravit poznámku" size="sm" onClick={() => setEditing(note.body)}>
                <Icon name="pencil" />
              </IconButton>
            )}
            {mine && (
              <IconButton label="Smazat poznámku" size="sm" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" />
              </IconButton>
            )}
          </div>
        </div>
        {comments.length > 0 && (
          <ul className="space-y-1.5 border-l-2 border-line pl-3">
            {comments.map((c) => (
              <CommentLine key={c.id} c={c} />
            ))}
          </ul>
        )}
        {commenting && (
          <div
            onKeyDown={submitOnModEnter(() => void sendComment())}
            className="flex items-start gap-2"
          >
            <Textarea
              aria-label="Komentář k poznámce"
              rows={2}
              autoFocus
              maxLength={5000}
              placeholder="Napište komentář…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <Button
              size="md"
              variant="primary"
              loading={busy}
              disabled={!comment.trim()}
              onClick={() => void sendComment()}
            >
              Odeslat
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Smazat poznámku?"
        description="Poznámka i její komentáře zmizí z historie."
        confirmLabel="Smazat"
        danger
        onConfirm={async () => {
          try {
            await remove.mutateAsync({ id: note.id });
            successToast("Poznámka je smazaná.");
          } catch (e) {
            errorToast((e as Error).message);
            return false;
          }
        }}
      />
    </li>
  );
}

function CommentLine({ c }: { c: NoteComment }) {
  return (
    <li className="space-y-0.5">
      <p className="whitespace-pre-wrap break-words text-base">{c.body}</p>
      <Who name={c.authorName} at={c.createdAt} />
    </li>
  );
}

function ActivityEntry({
  entry,
  aggregate,
}: {
  entry: Extract<TimelineEntry, { kind: "activity" }>;
  aggregate: boolean;
}) {
  const a = entry.activity;
  return (
    <li className={ENTRY}>
      <Bullet kind="activity" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <TypeIcon icon={a.typeIcon} />
          <span className="font-medium">{a.subject}</span>
          <Chip color="green">Hotovo</Chip>
          {aggregate && a.jobTitle && (
            <Chip color="gray" className="max-w-48 truncate" title={`Zakázka: ${a.jobTitle}`}>
              {a.jobTitle}
            </Chip>
          )}
        </div>
        {a.outcome && (
          <p className="whitespace-pre-wrap break-words text-base text-muted">{a.outcome}</p>
        )}
        {a.dueAt && (
          <div className="text-sm text-faint">
            Termín: <DueText activity={{ ...a, state: "future" }} className="text-faint" />
          </div>
        )}
        <Who name={a.doneByName} at={a.doneAt ?? a.createdAt} />
      </div>
    </li>
  );
}

function CommentEntry({
  entry,
  labels,
  aggregate,
}: {
  entry: Extract<TimelineEntry, { kind: "comment" }>;
  labels: TimelineResult["labels"];
  aggregate: boolean;
}) {
  return (
    <li className={ENTRY}>
      <Bullet kind="comment" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="whitespace-pre-wrap break-words text-base">{entry.body}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Who name={entry.actor} at={entry.at} />
          {entry.edited && <span className="text-sm text-faint">upraveno</span>}
          {aggregate && (
            <SourceChip entityType={entry.entityType} entityId={entry.entityId} labels={labels} />
          )}
        </div>
      </div>
    </li>
  );
}

function FileEntry({
  entry,
  labels,
  aggregate,
}: {
  entry: Extract<TimelineEntry, { kind: "file" }>;
  labels: TimelineResult["labels"];
  aggregate: boolean;
}) {
  const kb =
    entry.size >= 1_048_576
      ? `${(entry.size / 1_048_576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(entry.size / 1024))} kB`;
  return (
    <li className={ENTRY}>
      <Bullet kind="file" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <a
          href={`/api/files/${entry.fileId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-medium text-accent hover:underline"
        >
          {entry.name}
        </a>
        <div className="flex flex-wrap items-center gap-2 text-sm text-faint">
          <span>{kb}</span>
          <time dateTime={entry.at} className="tabular">
            {when(entry.at)}
          </time>
          {aggregate && (
            <SourceChip entityType={entry.entityType} entityId={entry.entityId} labels={labels} />
          )}
        </div>
      </div>
    </li>
  );
}

function AuditEntry({
  entry,
  labels,
  aggregate,
}: {
  entry: Extract<TimelineEntry, { kind: "audit" }>;
  labels: TimelineResult["labels"];
  aggregate: boolean;
}) {
  const shown = entry.changes.slice(0, 4);
  return (
    <li className={ENTRY}>
      <Bullet kind="audit" />
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted">
          <span className="font-medium text-fg">{entry.actor}</span>
          <span>{ACTION_TEXT[entry.action] ?? entry.action}</span>
          {entry.summary && <span className="min-w-0 truncate text-faint">{entry.summary}</span>}
          {aggregate && (
            <SourceChip entityType={entry.entityType} entityId={entry.entityId} labels={labels} />
          )}
        </div>
        {shown.length > 0 && (
          <ul className="space-y-0.5 text-faint">
            {shown.map((c) => (
              <li key={c.field} className="break-words">
                <span className="text-muted">{c.field}:</span> {fmtValue(c.old)}
                <Icon name="arrow-right" className="mx-1 inline size-3" />
                {fmtValue(c.new)}
              </li>
            ))}
            {entry.changes.length > shown.length && (
              <li>…a {entry.changes.length - shown.length} dalších změn</li>
            )}
          </ul>
        )}
        <time dateTime={entry.at} className="tabular text-faint">
          {when(entry.at)}
        </time>
      </div>
    </li>
  );
}

/**
 * Časová osa: hotové aktivity, poznámky (s komentářem, úpravou a připnutím), komentáře, soubory a protokol změn v jednom
 * proudu od nejnovějšího, s filtry Vše / Aktivity / Poznámky / Soubory / Protokol změn. U firmy a osoby (`aggregate`)
 * sbírá dění ze všech jejích zakázek a osob a u položek ukáže, odkud pocházejí.
 */
export function Timeline({ aggregate, ...target }: ActivityTarget & { aggregate?: boolean }) {
  const api = useEntityApi();
  const q = useTimeline({ ...target, ...(aggregate ? { aggregate } : {}) });
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const main = mainTarget(target);
  const items = q.data ? filterTimeline(q.data.items, filter) : [];

  async function upload(file: File) {
    if (!main) return;
    setUploading(true);
    try {
      await api.uploadFile(main.type, main.id, file);
      successToast("Soubor je nahraný.");
      void q.refetch();
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card aria-label="Historie" data-testid="timeline">
      <CardHeader
        title="Historie"
        icon={<Icon name="history" />}
        action={
          main && (
            <>
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void upload(f);
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                loading={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <Icon name="paperclip" /> Přidat soubor
              </Button>
            </>
          )
        }
      />
      <div
        className="flex flex-wrap gap-1.5 border-b border-line-soft px-4 py-2.5"
        role="group"
        aria-label="Filtr historie"
      >
        {TIMELINE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "h-7 rounded-full border px-3 text-sm font-medium transition-colors pointer-coarse:h-11",
              filter === f
                ? "border-accent bg-accent-soft text-accent"
                : "border-line-strong text-muted hover:bg-hover hover:text-fg",
            )}
          >
            {TIMELINE_FILTER_LABELS[f]}
          </button>
        ))}
      </div>
      <CardBody>
        {q.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : q.isError ? (
          <p className="text-sm text-danger">Historii se nepodařilo načíst.</p>
        ) : !items.length ? (
          <p className="py-6 text-center text-muted">
            {filter === "all" ? "Zatím se tu nic nestalo." : "V této části historie nic není."}
          </p>
        ) : (
          <ul>
            {items.map((e) => {
              const labels = q.data!.labels;
              const agg = aggregate === true;
              switch (e.kind) {
                case "activity":
                  return <ActivityEntry key={`a-${e.id}`} entry={e} aggregate={agg} />;
                case "note":
                  return (
                    <NoteCard
                      key={`n-${e.id}`}
                      entry={e}
                      labels={labels}
                      aggregate={agg}
                      refresh={() => void q.refetch()}
                    />
                  );
                case "comment":
                  return (
                    <CommentEntry key={`c-${e.id}`} entry={e} labels={labels} aggregate={agg} />
                  );
                case "file":
                  return <FileEntry key={`f-${e.id}`} entry={e} labels={labels} aggregate={agg} />;
                case "audit":
                  return <AuditEntry key={`l-${e.id}`} entry={e} labels={labels} aggregate={agg} />;
              }
            })}
          </ul>
        )}
        {q.data?.truncated && (
          <p className="mt-3 text-center text-sm text-faint">
            Zobrazeno nejnovějších {q.data.items.length} položek.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
