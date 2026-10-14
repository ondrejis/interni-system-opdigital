"use client";

import { formatDate } from "@rebar/core/shared";
import {
  Avatar,
  Button,
  Chip,
  Combobox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  IconButton,
  Input,
  errorToast,
  successToast,
  undoToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useNav,
  useUpdateAttribute,
  type RecordDialogParts,
} from "@rebar/ui";
import { useRef, useState } from "react";
import { FollowersButton } from "./followers-ui";
import { stripMode } from "./logic";
import { StageStrip } from "./stage-strip";
import { LoseDealDialog, WinDealDialog } from "./win-lose";

/** Název zakázky upravitelný na místě: klik, psaní, Enter nebo opuštění pole uloží, Esc zruší. */
function InlineTitle({ parts }: { parts: RecordDialogParts }) {
  const { entity, id, row } = parts;
  const update = useUpdateAttribute(entity.key);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);
  const title = String(row[entity.titleKey] ?? "");
  const canEdit = entity.can.write;

  async function commit() {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const next = text.trim();
    if (!next || next === title) return;
    setError(null);
    try {
      await update.mutateAsync({
        id,
        attr: entity.titleKey,
        value: next,
        updatedAt: row.updatedAt,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (editing)
    return (
      <div className="min-w-0">
        <Input
          autoFocus
          aria-label="Název zakázky"
          value={text}
          maxLength={200}
          className="h-9 text-lg font-semibold"
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              done.current = true;
              setEditing(false);
            }
          }}
        />
      </div>
    );
  return (
    <div className="min-w-0">
      <h2
        className={`-mx-1 truncate rounded-md px-1 text-lg font-semibold ${canEdit ? "cursor-text hover:bg-hover" : ""}`}
        title={canEdit ? "Kliknutím upravíte název" : title}
        data-testid="deal-title"
        onClick={() => {
          if (!canEdit) return;
          done.current = false;
          setText(title);
          setEditing(true);
        }}
      >
        {title || "Bez názvu"}
      </h2>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Vlastník zakázky (odpovědná osoba): avatar a jméno, klik otevře výběr uživatele. */
function OwnerPicker({ parts }: { parts: RecordDialogParts }) {
  const { entity, id, row, labels } = parts;
  const api = useEntityApi();
  const update = useUpdateAttribute(entity.key);
  const attr = entity.attributes.find((a) => a.key === "manager");
  const ownerId = typeof row.manager === "string" ? row.manager : null;
  const name = ownerId ? (labels.manager?.[ownerId]?.label ?? "…") : null;
  const canEdit = entity.can.write && !!attr && !attr.readonly;
  if (!attr) return null;
  const trigger = (
    <Button
      variant="ghost"
      className="max-w-48 gap-2 px-2"
      disabled={!canEdit}
      aria-label={`Vlastník: ${name ?? "nikdo"}`}
      data-testid="deal-owner"
    >
      {name ? <Avatar name={name} size={20} /> : <Icon name="user" />}
      <span className="min-w-0 truncate max-lg:hidden">{name ?? "Bez vlastníka"}</span>
    </Button>
  );
  if (!canEdit) return trigger;
  return (
    <Combobox
      aria-label="Vlastník zakázky"
      load={api.lookups.users}
      value={ownerId}
      {...(ownerId && name ? { selectedLabels: { [ownerId]: name } } : {})}
      searchPlaceholder="Najít uživatele…"
      onChange={(v) => {
        if (typeof v !== "string" || v === ownerId) return;
        update
          .mutateAsync({ id, attr: "manager", value: v, updatedAt: row.updatedAt })
          .catch((e: Error) => errorToast(e.message));
      }}
      trigger={trigger}
    />
  );
}

/**
 * Hlavička detailu zakázky v pop-upu (Pipedrive): drobečky, název upravitelný na místě, vlastník, sledující,
 * velká tlačítka Vyhráno a Prohráno nezávisle na stavu, menu dalších akcí a pás stavů jako šipky.
 */
export function DealHeader(parts: RecordDialogParts) {
  const { entity, id, row, onClose, remove } = parts;
  const api = useEntityApi();
  const nav = useNav();
  const mode = stripMode(row.phase);
  const title = String(row[entity.titleKey] ?? "");
  const canWrite = entity.can.write;
  const stages = entity.attributes.find((a) => a.key === "stage")?.stages ?? [];
  const stageName = stages.find((s) => s.id === row.stage)?.name ?? null;
  const archived = !!row.crmArchivedAt;
  const href = api.hrefFor("job", id);
  const [dialog, setDialog] = useState<"win" | "lose" | null>(null);

  const reopen = useCommandMutation<{ jobId: string }>("crm.deal.reopen", {
    onSuccess: () => successToast("Zakázka je znovu otevřená."),
  });
  const archive = useCommandMutation<{ jobId: string }>("crm.deal.archive");
  const unarchive = useCommandMutation<{ jobId: string }>("crm.deal.unarchive", {
    onSuccess: () => successToast("Zakázka je vrácená z archivu."),
  });
  const reasons = useCommandQuery<{ value: string; label: string }[]>("crm.deal.lostReasons", {});
  const lostReason = reasons.data?.find((r) => r.value === row.lostReason)?.label ?? null;
  const reopenable = row.phase === "lost" || row.phase === "preparation";

  return (
    <div className="shrink-0 border-b border-line bg-bg" data-testid="deal-header" data-mode={mode}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-5">
        <div className="min-w-0 basis-full max-sm:pr-10 sm:flex-1 sm:basis-0">
          <nav
            aria-label="Drobečková navigace"
            className="flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted"
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded px-1 hover:bg-hover hover:text-fg"
              data-testid="crumb-board"
            >
              Nástěnka
            </button>
            {stageName && mode === "open" && (
              <>
                <Icon name="chevron-right" className="size-3 shrink-0 text-faint max-sm:hidden" />
                <span className="truncate max-sm:hidden">{stageName}</span>
              </>
            )}
          </nav>
          <InlineTitle parts={parts} />
        </div>
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <OwnerPicker parts={parts} />
          <FollowersButton jobId={id} />
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-line sm:block" />
          {mode === "open" && canWrite && (
            <>
              <Button
                className="bg-success font-semibold text-bg hover:opacity-90 max-sm:flex-1"
                onClick={() => setDialog("win")}
                data-testid="deal-win"
              >
                <Icon name="trophy" /> Vyhráno
              </Button>
              <Button
                variant="danger"
                className="font-semibold max-sm:flex-1"
                onClick={() => setDialog("lose")}
                data-testid="deal-lose"
              >
                <Icon name="thumbs-down" /> Prohráno
              </Button>
            </>
          )}
          {mode === "won" && (
            <Chip color="green" dot data-testid="deal-won-chip">
              Vyhráno{row.wonAt ? ` ${formatDate(String(row.wonAt))}` : ""}
            </Chip>
          )}
          {mode === "lost" && (
            <Chip color="red" dot data-testid="deal-lost-chip">
              Prohráno{lostReason ? `: ${lostReason}` : ""}
            </Chip>
          )}
          {reopenable && canWrite && (
            <Button
              variant="secondary"
              loading={reopen.isPending}
              onClick={() =>
                reopen.mutate({ jobId: id }, { onError: (e) => errorToast(e.message) })
              }
              data-testid="deal-reopen"
            >
              <Icon name="rotate-ccw" /> Znovu otevřít
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Další akce" data-testid="deal-menu">
                <Icon name="more" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {href && (
                <DropdownMenuItem onSelect={() => nav.push(href)}>
                  <Icon name="external-link" /> Otevřít na celé stránce
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard?.writeText(`${location.origin}/crm?record=${id}`);
                  successToast("Odkaz zkopírován.");
                }}
              >
                <Icon name="link" /> Kopírovat odkaz
              </DropdownMenuItem>
              {canWrite && (
                <>
                  <DropdownMenuSeparator />
                  {reopenable && (
                    <DropdownMenuItem
                      onSelect={() =>
                        reopen.mutate({ jobId: id }, { onError: (e) => errorToast(e.message) })
                      }
                    >
                      <Icon name="rotate-ccw" /> Znovu otevřít
                    </DropdownMenuItem>
                  )}
                  {archived ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        unarchive.mutate({ jobId: id }, { onError: (e) => errorToast(e.message) })
                      }
                    >
                      <Icon name="archive" /> Vrátit z archivu
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onSelect={() =>
                        archive.mutate(
                          { jobId: id },
                          {
                            onSuccess: () => {
                              undoToast(`Zakázka „${title}“ je archivovaná.`, async () => {
                                await unarchive.mutateAsync({ jobId: id });
                              });
                              onClose();
                            },
                            onError: (e) => errorToast(e.message),
                          },
                        )
                      }
                    >
                      <Icon name="archive" /> Archivovat
                    </DropdownMenuItem>
                  )}
                </>
              )}
              {remove && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem danger onSelect={remove}>
                    <Icon name="trash" /> Smazat
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {href && (
            <IconButton
              label="Otevřít na celé stránce"
              className="max-sm:hidden"
              onClick={() => nav.push(href)}
            >
              <Icon name="external-link" />
            </IconButton>
          )}
          <IconButton
            label="Zavřít"
            className="max-sm:absolute max-sm:right-2 max-sm:top-2"
            onClick={onClose}
            data-testid="deal-close"
          >
            <Icon name="x" />
          </IconButton>
        </div>
      </div>

      <div className="space-y-2 px-4 empty:hidden sm:px-5">
        {archived && (
          <p className="rounded-md bg-hover px-3 py-1.5 text-sm text-muted" role="status">
            Zakázka je archivovaná a na nástěnce se nezobrazuje.
          </p>
        )}
        {mode === "other" && href && (
          <p className="rounded-md bg-hover px-3 py-1.5 text-sm text-muted" role="status">
            Zakázka je už vyhraná a běží v další fázi.{" "}
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => nav.push(href)}
            >
              Otevřít zakázku
            </button>
          </p>
        )}
        {mode === "lost" && row.crmLostNote ? (
          <p className="rounded-md bg-danger-soft px-3 py-1.5 text-sm" role="status">
            {String(row.crmLostNote)}
          </p>
        ) : null}
      </div>

      <div className="px-4 pb-3 pt-1 sm:px-5">
        <StageStrip id={id} row={row} />
      </div>

      <WinDealDialog
        deal={dialog === "win" ? { id, title } : null}
        onClose={() => setDialog(null)}
      />
      <LoseDealDialog
        deal={dialog === "lose" ? { id, title } : null}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
