"use client";

import {
  Button,
  Card,
  CardHeader,
  Dialog,
  DialogContent,
  EmptyState,
  Icon,
  Input,
  Skeleton,
  Textarea,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useNav,
} from "@rebar/ui";
import { useState } from "react";
import type { CreateNoteResult, PrivateOverview } from "./types";

const csDateTime = (iso: string) => new Date(iso).toLocaleDateString("cs-CZ");

/** Dialog „Nová soukromá poznámka“ (samostatná poznámka bez vazby, vidí ji jen vlastník). */
function NewNoteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const nav = useNav();
  const create = useCommandMutation<{ title: string; text: string }, CreateNoteResult>(
    "muj-prostor.private.createNote",
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Nová soukromá poznámka"
        description="Poznámku uvidíte jen vy; nikam se nepromítá (ani do součtů a hledání ostatních)."
        data-testid="note-dialog"
      >
        <div className="space-y-3 px-5 py-4">
          <label className="block text-sm font-medium text-muted">
            Název (nepovinný)
            <Input
              data-testid="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-sm font-medium text-muted">
            Text
            <Textarea
              data-testid="note-text"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button onClick={() => onOpenChange(false)}>Zrušit</Button>
            <Button
              variant="primary"
              loading={create.isPending}
              data-testid="note-save"
              onClick={() =>
                create.mutate(
                  { title, text },
                  {
                    onSuccess: (r) => {
                      successToast("Poznámka založena.");
                      setTitle("");
                      setText("");
                      onOpenChange(false);
                      if (r.href) nav.push(r.href);
                    },
                    onError: (e) => errorToast(e.message),
                  },
                )
              }
            >
              Založit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Stránka Soukromé: všechny soukromé záznamy (zakázky, úkoly, poznámky…) seskupené podle typu. */
export function PrivatePage({ startNote }: { startNote: boolean }) {
  const overview = useCommandQuery<PrivateOverview>("muj-prostor.private.overview", {});
  const [noteOpen, setNoteOpen] = useState(startNote);
  const nav = useNav();
  const data = overview.data;
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4" data-testid="private-page">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Icon name="lock" /> Soukromé
          </h2>
          <p className="text-sm text-muted">
            Vše, co jste označili jako soukromé, na jednom místě. Patrik to nevidí nikde, ani v
            součtech.
          </p>
        </div>
        {data?.canCreateNote && (
          <Button
            variant="primary"
            data-testid="new-private-note"
            onClick={() => setNoteOpen(true)}
          >
            <Icon name="plus" /> Nová soukromá poznámka
          </Button>
        )}
      </div>
      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : data.groups.length === 0 ? (
        <EmptyState
          title="Zatím nic soukromého"
          description="Soukromým záznam uděláte zámkem v jeho hlavičce."
        />
      ) : (
        data.groups.map((g) => (
          <Card key={g.entityType} data-testid="private-group" data-entity={g.entityType}>
            <CardHeader title={g.label} count={g.total} />
            <ul>
              {g.rows.map((r) => (
                <li key={r.id} className="border-t border-line-soft first:border-t-0">
                  <button
                    type="button"
                    data-testid="private-row"
                    disabled={!r.href}
                    onClick={() => r.href && nav.push(r.href)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                    {r.detail && (
                      <span className="hidden truncate text-sm text-muted sm:block">
                        {r.detail}
                      </span>
                    )}
                    <span className="shrink-0 text-sm text-faint">{csDateTime(r.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {g.truncated && (
              <p className="border-t border-line-soft px-4 py-2 text-sm text-muted">
                Ukázáno {g.rows.length} z {g.total}.{" "}
                <a className="underline" href={g.listPath}>
                  Otevřít celý seznam
                </a>
              </p>
            )}
          </Card>
        ))
      )}
      <NewNoteDialog open={noteOpen} onOpenChange={setNoteOpen} />
    </div>
  );
}
