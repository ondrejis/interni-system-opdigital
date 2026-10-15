"use client";

import {
  Button,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  Input,
  Skeleton,
  cn,
  errorToast,
  undoToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
} from "@rebar/ui";
import { useEffect, useState } from "react";
import type { ListNotesInput, ListNotesResult, NoteDto } from "../contract";
import { NoteEditor, type NoteLinkInput } from "./note-editor";
import { NoteView } from "./note-view";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  });

/** Jedna poznámka v seznamu: čtení, připnutí, úprava (editor s autosavem) a smazání s možností „Vrátit“. */
function NoteCard({ note, onChanged }: { note: NoteDto; onChanged: () => void }) {
  const api = useEntityApi();
  const [editing, setEditing] = useState(false);
  const [live, setLive] = useState(note);
  useEffect(() => setLive(note), [note]);
  const pin = useCommandMutation<{ id: string; pinned: boolean }, NoteDto>("ukoly.note.pin", {
    onSuccess: onChanged,
  });
  const del = useCommandMutation<{ id: string }, { id: string }>("ukoly.note.delete", {
    onSuccess: (_r, v) => {
      onChanged();
      undoToast(`Poznámka smazána.`, async () => {
        try {
          await api.restore("note", [v.id]);
          onChanged();
        } catch (e) {
          errorToast((e as Error).message);
        }
      });
    },
  });
  const title = live.title || "Poznámka";

  return (
    <article
      data-testid="note-card"
      data-pinned={live.pinned}
      aria-label={title}
      className={cn("rounded-md border border-line bg-bg", live.pinned && "border-accent/40")}
    >
      <header className="flex items-start gap-2 px-3 pt-2">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-base font-medium" data-testid="note-card-title">
            {live.isPrivate && (
              <Icon name="lock" className="mr-1 inline size-3.5 text-muted" aria-label="Soukromá" />
            )}
            {title}
          </h4>
          <p className="text-sm text-faint">
            {live.createdByName ?? "—"} · {fmt(live.updatedAt)}
            {live.link && live.link.title && (
              <>
                {" "}
                ·{" "}
                <a className="underline" href={api.hrefFor(live.link.type, live.link.id) ?? "#"}>
                  {live.link.title}
                </a>
              </>
            )}
          </p>
        </div>
        {live.tags.map((t) => (
          <Chip key={t}>{t}</Chip>
        ))}
        {live.canWrite && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton
              label={live.pinned ? "Odepnout poznámku" : "Připnout poznámku nahoru"}
              variant="ghost"
              size="sm"
              aria-pressed={live.pinned}
              onClick={() => pin.mutate({ id: live.id, pinned: !live.pinned })}
            >
              <Icon name="pin" className={cn(live.pinned && "text-accent")} />
            </IconButton>
            {!editing && (
              <IconButton
                label="Upravit poznámku"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Icon name="pencil" />
              </IconButton>
            )}
            <IconButton
              label="Smazat poznámku"
              variant="ghost"
              size="sm"
              onClick={() => del.mutate({ id: live.id })}
            >
              <Icon name="trash" />
            </IconButton>
          </div>
        )}
      </header>
      <div className="px-3 pb-2">
        {editing ? (
          <NoteEditor
            note={live}
            autoFocus
            className="mt-2"
            onSaved={setLive}
            onDone={() => {
              setEditing(false);
              onChanged();
            }}
          />
        ) : live.bodyJson ? (
          <NoteView doc={live.bodyJson} />
        ) : (
          <p className="py-2 text-faint">Prázdná poznámka.</p>
        )}
      </div>
    </article>
  );
}

/**
 * Seznam poznámek k záznamu (záložka „Poznámky“ u klienta, kontaktu, obchodu a zakázky) nebo samostatných poznámek:
 * připnuté nahoře, pak nejnovější; hledání v textu bez diakritiky; nová poznámka se píše rovnou do editoru.
 */
export function NotesPanel({
  link,
  standalone,
  startNew,
}: {
  /** Záznam, ke kterému poznámky patří. */
  link?: { type: "deal" | "company" | "person" | "job"; id: string };
  /** Jen samostatné poznámky (bez vazby). */
  standalone?: boolean;
  /** Hned otevřít prázdný editor nové poznámky. */
  startNew?: boolean;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [creating, setCreating] = useState(!!startNew);
  const [createdId, setCreatedId] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const input: ListNotesInput = {
    ...(link ? { [`${link.type}Id`]: link.id } : {}),
    ...(standalone ? { standalone: true } : {}),
    ...(debounced ? { q: debounced } : {}),
    limit: 100,
  };
  const list = useCommandQuery<ListNotesResult, ListNotesInput>("ukoly.note.list", input);
  const linkInput: NoteLinkInput = link ? { [`${link.type}Id`]: link.id } : {};
  const rows = (list.data?.rows ?? []).filter((n) => n.id !== createdId);

  return (
    <section aria-label="Poznámky" className="space-y-3" data-testid="notes-panel">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-80">
          <Icon
            name="search"
            className="pointer-events-none absolute left-2 top-2 size-4 text-faint"
          />
          <Input
            aria-label="Hledat v poznámkách"
            placeholder="Hledat v poznámkách…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        {!creating && (
          <Button variant="primary" data-testid="note-new" onClick={() => setCreating(true)}>
            <Icon name="plus" /> Nová poznámka
          </Button>
        )}
      </div>

      {creating && (
        <NoteEditor
          key="new"
          link={linkInput}
          autoFocus
          onCreated={(n) => setCreatedId(n.id)}
          onDone={() => {
            setCreating(false);
            setCreatedId(null);
            void list.refetch();
          }}
        />
      )}

      {list.isLoading ? (
        <Skeleton className="h-24" />
      ) : list.error ? (
        <p className="text-sm text-danger">Poznámky se nepodařilo načíst.</p>
      ) : rows.length === 0 && !creating ? (
        <EmptyState
          title={debounced ? "Nic nenalezeno" : "Zatím žádné poznámky"}
          description={debounced ? "Zkuste jiné slovo." : "Napište první poznámku tlačítkem výše."}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((n) => (
            <NoteCard key={n.id} note={n} onChanged={() => void list.refetch()} />
          ))}
        </div>
      )}
    </section>
  );
}
