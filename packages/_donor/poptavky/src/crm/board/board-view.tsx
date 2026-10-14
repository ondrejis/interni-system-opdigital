"use client";

import type { EntityDescriptor, RecordRow } from "@rebar/core/shared";
import {
  Dialog,
  DialogContent,
  EntityApiProvider,
  EntityList,
  Skeleton,
  useEntityApi,
  useEntityDescriptor,
  type EntityApi,
  type KanbanDropTarget,
} from "@rebar/ui";
import { useMemo, useState } from "react";
import { ActivityComposer } from "../activities/components";
import { boardFilters, boardStages, type MoveCheck } from "./logic";
import { MoveFixDialog } from "./transition-panel";
import { LoseDealDialog, WinDealDialog, type DealRef } from "./win-lose";

type DialogState = { kind: "won" | "lost" | "activity"; deal: DealRef } | null;

const dealOf = (row: RecordRow): DealRef => ({ id: row.id, title: String(row.title ?? "") });

/** Popis zakázky pro nástěnku: jen stavy fází Poptávka a Nabídka, vytváření řeší tlačítko „+ Zakázka“. */
function boardEntity(full: EntityDescriptor): EntityDescriptor {
  return {
    ...full,
    can: { ...full.can, create: false },
    attributes: full.attributes.map((a) =>
      a.key === full.statusKey && a.stages ? { ...a, stages: boardStages(a.stages) } : a,
    ),
  };
}

/**
 * Nástěnka zakázek: kanban podle stavů fází Poptávka a Nabídka (bez archivovaných a uzavřených), karta a hlavička sloupce
 * z modulu, cílové sloupce Vyhráno a Prohráno při tahu karty, zkratky nad kartou (A, W, L) a detail v pop-upu
 * (`?record=`). Přesun karty, který kontrola nepustí (chybí adresa stavby…), otevře okno s větou a poli k doplnění.
 */
export function BoardView({
  owner,
  initialRecordId,
  initialTab,
  initialSub,
  onAddDeal,
}: {
  owner: string;
  initialRecordId: string | null;
  initialTab?: string | undefined;
  initialSub?: string | undefined;
  /** „+“ pod sloupcem: přidá zakázku rovnou do stavu. */
  onAddDeal: (stageId: string) => void;
}) {
  const base = useEntityApi();
  const descriptor = useEntityDescriptor("job");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [fix, setFix] = useState<{ jobId: string; stageId: string; title: string } | null>(null);

  // přesun karty do stavu se předem zkontroluje; když něco chybí, ukáže se okno s větou a poli a přesun se vrátí
  const guarded = useMemo<EntityApi>(
    () => ({
      ...base,
      update: async (entity, id, patch, expected) => {
        const keys = Object.keys(patch);
        if (entity === "job" && keys.length === 1 && keys[0] === "stage") {
          const check = await base.command<unknown, MoveCheck>("crm.deal.moveCheck", {
            jobId: id,
            stageId: patch.stage,
          });
          if (check.problems.length) {
            const row = await base.get("job", id).catch(() => null);
            setFix({
              jobId: id,
              stageId: String(patch.stage),
              title: String(row?.row.title ?? ""),
            });
            // prázdná chyba: karta se vrátí na místo a nástěnka nehlásí nic navíc (větu ukáže okno)
            throw new Error("");
          }
        }
        return base.update(entity, id, patch, expected);
      },
    }),
    [base],
  );

  const entity = useMemo(
    () => (descriptor.data ? boardEntity(descriptor.data) : null),
    [descriptor.data],
  );
  const baseFilters = useMemo(() => boardFilters(owner), [owner]);
  const defaultConfig = useMemo(() => ({ viewType: "kanban" as const, cardAttributes: [] }), []);
  const canWrite = !!descriptor.data?.can.write;

  const dropTargets = useMemo<KanbanDropTarget[]>(
    () =>
      canWrite
        ? [
            {
              id: "won",
              label: "Vyhráno",
              color: "green",
              icon: "trophy",
              hint: "nebo klávesa W",
              onDrop: (_id, row) => setDialog({ kind: "won", deal: dealOf(row) }),
            },
            {
              id: "lost",
              label: "Prohráno",
              color: "red",
              icon: "thumbs-down",
              hint: "nebo klávesa L",
              onDrop: (_id, row) => setDialog({ kind: "lost", deal: dealOf(row) }),
            },
          ]
        : [],
    [canWrite],
  );

  const kanban = useMemo(
    () => ({
      dropTargets,
      onShortcut: (key: string, row: RecordRow) => {
        if (key === "a") setDialog({ kind: "activity", deal: dealOf(row) });
        else if (!canWrite) return;
        else if (key === "w") setDialog({ kind: "won", deal: dealOf(row) });
        else if (key === "l") setDialog({ kind: "lost", deal: dealOf(row) });
      },
      ...(canWrite ? { onAddCard: onAddDeal } : {}),
    }),
    [dropTargets, canWrite, onAddDeal],
  );

  if (!entity)
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  const close = () => setDialog(null);
  return (
    <EntityApiProvider api={guarded}>
      <EntityList
        entity={entity}
        compact
        hideViewToggle
        baseFilters={baseFilters}
        defaultConfig={defaultConfig}
        openMode="dialog"
        basePath="/crm"
        initialRecordId={initialRecordId}
        initialRecordTab={initialTab}
        initialRecordSub={initialSub}
        kanban={kanban}
      />
      <WinDealDialog deal={dialog?.kind === "won" ? dialog.deal : null} onClose={close} />
      <LoseDealDialog deal={dialog?.kind === "lost" ? dialog.deal : null} onClose={close} />
      <Dialog open={dialog?.kind === "activity"} onOpenChange={(o) => !o && close()}>
        <DialogContent
          title="Naplánovat aktivitu"
          description={dialog?.deal.title ?? ""}
          className="top-[10vh] w-[min(36rem,calc(100vw-2rem))]"
        >
          {dialog?.kind === "activity" && (
            <div className="p-4">
              <ActivityComposer jobId={dialog.deal.id} onCreated={close} />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <MoveFixDialog
        jobId={fix?.jobId ?? null}
        stageId={fix?.stageId ?? null}
        title={fix?.title ?? ""}
        onClose={() => setFix(null)}
      />
    </EntityApiProvider>
  );
}
