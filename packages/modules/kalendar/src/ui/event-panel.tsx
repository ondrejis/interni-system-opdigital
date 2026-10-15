"use client";

import {
  Button,
  Chip,
  Combobox,
  ConfirmDialog,
  IconButton,
  Sheet,
  Skeleton,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { ExternalLink, Trash2, Video, X } from "lucide-react";
import { useState } from "react";
import type { LinkInput, LinkSuggestion, SuggestLinksResult } from "../contract";
import { whenLabel, type Item } from "./lib";

/*
  Náhled události v postranním panelu (KAL-07, KAL-08): čas, místo, odkaz na Google Meet, účastníci, vazby na klienta,
  obchod a kontakt jedním klikem, automatický návrh vazby podle e-mailu účastníka (kontakt v CRM), smazání.
*/

const RESPONSE: Record<string, string> = {
  accepted: "přijal(a)",
  declined: "odmítl(a)",
  tentative: "možná",
  needsAction: "bez odpovědi",
};

type LinkKey = "companyId" | "dealId" | "personId";
const KINDS: { key: LinkKey; ref: "company" | "deal" | "person"; entity: string; label: string }[] =
  [
    { key: "companyId", ref: "company", entity: "company", label: "Klient" },
    { key: "dealId", ref: "deal", entity: "deal", label: "Obchod" },
    { key: "personId", ref: "person", entity: "person", label: "Kontakt" },
  ];

function Suggestions({
  item,
  onLink,
  pending,
}: {
  item: Item;
  onLink: (v: Partial<Record<LinkKey, string>>) => void;
  pending: boolean;
}) {
  const q = useCommandQuery<SuggestLinksResult>(
    "kalendar.suggestLinks",
    { eventId: item.eventId },
    { enabled: !!item.eventId },
  );
  const list = (q.data?.suggestions ?? []).filter(
    (s) =>
      s.personId !== item.person?.id ||
      (s.companyId && s.companyId !== item.company?.id) ||
      s.deals.some((d) => d.id !== item.deal?.id),
  );
  if (!list.length) return null;
  return (
    <section
      aria-label="Návrh vazby"
      className="rounded-lg border border-accent-line bg-accent-soft p-3"
      data-testid="link-suggestions"
    >
      <h3 className="mb-2 text-sm font-semibold">Návrh podle e-mailu účastníka</h3>
      <ul className="space-y-2">
        {list.map((s: LinkSuggestion) => (
          <li key={s.personId} className="space-y-1.5 text-sm">
            <p>
              <span className="font-medium">{s.personName}</span>
              {s.companyName ? <span className="text-muted"> · {s.companyName}</span> : null}
              <span className="block truncate text-xs text-muted">{s.email}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="primary"
                loading={pending}
                onClick={() =>
                  onLink({
                    personId: s.personId,
                    ...(s.companyId ? { companyId: s.companyId } : {}),
                    ...(s.deals.length === 1 ? { dealId: s.deals[0]!.id } : {}),
                  })
                }
              >
                Navázat{s.companyName ? ` na ${s.companyName}` : ""}
              </Button>
              {s.deals.length > 1 &&
                s.deals.map((d) => (
                  <Button
                    key={d.id}
                    size="sm"
                    onClick={() =>
                      onLink({
                        personId: s.personId,
                        dealId: d.id,
                        ...(s.companyId ? { companyId: s.companyId } : {}),
                      })
                    }
                  >
                    Obchod: {d.title}
                  </Button>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PanelBody({ item, onClose }: { item: Item; onClose: () => void }) {
  const api = useEntityApi();
  const { Link } = useNav();
  const [confirm, setConfirm] = useState(false);
  const link = useCommandMutation<LinkInput>("kalendar.link", {
    onSuccess: () => successToast("Vazba uložena."),
  });
  const del = useCommandMutation<{ eventId: string }>("kalendar.delete", {
    onSuccess: () => {
      successToast("Událost smazána.");
      onClose();
    },
  });
  const setLink = (v: Partial<Record<LinkKey, string | null>>) =>
    link.mutate({ eventId: item.eventId!, ...v }, { onError: (e) => errorToast(e.message) });
  const canEdit = item.canEdit && !!item.eventId;
  const refs = { companyId: item.company, dealId: item.deal, personId: item.person };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="event-panel">
      <header className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-snug">{item.title}</h2>
          <p className="tabular text-sm text-muted">{whenLabel(item)}</p>
        </div>
        <IconButton label="Zavřít náhled" onClick={onClose}>
          <X />
        </IconButton>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        {item.meetUrl && (
          <a
            href={item.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 font-medium text-accent-fg hover:bg-[var(--accent-hover)]"
            data-testid="meet-link"
          >
            <Video className="size-4" /> Otevřít Google Meet
          </a>
        )}

        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5">
          {item.location && (
            <>
              <dt className="text-muted">Místo</dt>
              <dd className="break-words">{item.location}</dd>
            </>
          )}
          {item.calendarName && (
            <>
              <dt className="text-muted">Kalendář</dt>
              <dd>
                {item.calendarName}
                {item.owner && !item.own ? ` · ${item.owner}` : ""}
              </dd>
            </>
          )}
          <dt className="text-muted">Původ</dt>
          <dd>
            <Chip color={item.source === "opsys" ? "indigo" : "blue"}>
              {item.source === "opsys" ? "Schůzka z OPSYS" : "Google Kalendář"}
            </Chip>
            {item.recurring && <span className="ml-1.5 text-muted">opakovaná</span>}
          </dd>
        </dl>

        {item.description && (
          <p className="whitespace-pre-wrap break-words text-muted">{item.description}</p>
        )}

        {item.attendees.length > 0 && (
          <section aria-label="Účastníci">
            <h3 className="mb-1 font-semibold">Účastníci</h3>
            <ul className="space-y-0.5">
              {item.attendees.map((a) => (
                <li key={a.email} className="flex flex-wrap items-baseline gap-x-2">
                  <span>{a.name ?? a.email}</span>
                  {a.name && <span className="text-xs text-muted">{a.email}</span>}
                  {a.organizer && <span className="text-xs text-muted">organizátor</span>}
                  {a.responseStatus && !a.organizer && (
                    <span className="text-xs text-muted">{RESPONSE[a.responseStatus]}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Vazby">
          <h3 className="mb-1.5 font-semibold">Vazby</h3>
          <ul className="space-y-2">
            {KINDS.map((k) => {
              const ref = refs[k.key];
              return (
                <li key={k.key} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-muted">{k.label}</span>
                  {ref ? (
                    <>
                      <Link
                        href={api.hrefFor(k.entity, ref.id) ?? "#"}
                        className="min-w-0 flex-1 truncate font-medium text-accent hover:underline"
                        data-testid={`link-${k.ref}`}
                      >
                        {ref.title ?? "Záznam"}
                      </Link>
                      {canEdit && (
                        <IconButton
                          label={`Odebrat vazbu: ${k.label}`}
                          size="sm"
                          onClick={() => setLink({ [k.key]: null })}
                        >
                          <X />
                        </IconButton>
                      )}
                    </>
                  ) : canEdit ? (
                    <Combobox
                      className="min-w-0 flex-1"
                      load={(s) => api.lookups.records(k.entity, s)}
                      value={null}
                      onChange={(v) => v && setLink({ [k.key]: v as string })}
                      aria-label={`Navázat: ${k.label}`}
                      placeholder="Navázat…"
                    />
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </li>
              );
            })}
          </ul>
          {link.error && (
            <p role="alert" className="mt-1 text-danger">
              {link.error.message}
            </p>
          )}
        </section>

        {canEdit && <Suggestions item={item} pending={link.isPending} onLink={(v) => setLink(v)} />}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        {item.htmlLink && (
          <a
            href={item.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 font-medium hover:bg-hover"
          >
            <ExternalLink className="size-4" /> V Googlu
          </a>
        )}
        {item.taskId && (
          <Link
            href={api.hrefFor("task", item.taskId) ?? "#"}
            className="inline-flex h-8 items-center rounded-md border border-line-strong px-3 font-medium hover:bg-hover"
          >
            Otevřít úkol
          </Link>
        )}
        {canEdit && (
          <Button variant="ghost" className="ml-auto text-danger" onClick={() => setConfirm(true)}>
            <Trash2 /> Smazat
          </Button>
        )}
      </footer>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Smazat událost"
        description={item.title}
        confirmLabel="Smazat"
        cancelLabel="Ponechat"
        danger
        onConfirm={() =>
          del.mutateAsync({ eventId: item.eventId! }).then(
            () => undefined,
            (e: Error) => {
              errorToast(e.message);
            },
          )
        }
      >
        {item.taskId
          ? "Událost se smaže v Google Kalendáři a schůzka přejde do koše úkolů."
          : "Událost se smaže i v Google Kalendáři."}
      </ConfirmDialog>
    </div>
  );
}

/** Postranní panel s náhledem události; `item === null` ho zavře. */
export function EventPanel({ item, onClose }: { item: Item | null; onClose: () => void }) {
  return (
    <Sheet
      open={!!item}
      onOpenChange={(o) => !o && onClose()}
      title={item?.title ?? "Událost"}
      width={420}
    >
      {item ? (
        <PanelBody key={item.id} item={item} onClose={onClose} />
      ) : (
        <Skeleton className="m-4 h-40" />
      )}
    </Sheet>
  );
}
