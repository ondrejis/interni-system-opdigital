"use client";

import { Button, ConfirmDialog, EmptyState, Input, errorToast, successToast } from "@rebar/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { purgeTrashAction, listTrashAction, restoreTrashAction } from "@/server/trash-actions";
import { unwrap } from "../nastaveni/_shared/action-query";

type Item = {
  entityType: string;
  entityLabel: string;
  id: string;
  title: string;
  deletedAt: string;
  deletedByName: string | null;
  children: number;
  daysLeft: number;
  isPrivate: boolean;
};

const fmt = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" });

/** Seznam koše s filtrem typu a hledáním, obnovou a trvalým smazáním (s potvrzením). */
export function TrashView({ canPurge }: { canPurge: boolean }) {
  const qc = useQueryClient();
  const [entity, setEntity] = useState("");
  const [q, setQ] = useState("");
  const [purging, setPurging] = useState<Item | null>(null);
  const list = useQuery({
    queryKey: ["trash", entity, q],
    queryFn: () => unwrap(listTrashAction({ ...(entity ? { entity } : {}), ...(q ? { q } : {}) })),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["trash"] });
  const restore = useMutation({
    mutationFn: (i: Item) => unwrap(restoreTrashAction({ entity: i.entityType, id: i.id })),
    onSuccess: (_d, i) => {
      successToast(`Obnoveno: ${i.title || i.entityLabel}.`);
      refresh();
    },
    onError: (e: Error) => errorToast(e.message),
  });
  const purge = useMutation({
    mutationFn: (i: Item) => unwrap(purgeTrashAction({ entity: i.entityType, id: i.id })),
    onSuccess: () => {
      successToast("Trvale smazáno.");
      setPurging(null);
      refresh();
    },
    onError: (e: Error) => errorToast(e.message),
  });
  const items = (list.data?.items ?? []) as Item[];
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5" data-testid="trash">
      <p className="text-sm text-muted">
        Smazané záznamy zůstávají v koši 30 dní. Obnova vrátí i podřízené záznamy (úkoly, poznámky,
        platby…), které se smazaly spolu s nimi.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Typ záznamu"
          className="h-9 rounded-md border border-line bg-bg px-2 text-base"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
        >
          <option value="">Všechny typy</option>
          {(list.data?.types ?? []).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <Input
          aria-label="Hledat v koši"
          placeholder="Hledat podle názvu"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-72"
        />
      </div>
      {list.isLoading ? null : items.length === 0 ? (
        <EmptyState title="Koš je prázdný" description="Smazané záznamy se objeví tady." />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {items.map((i) => (
            <li
              key={`${i.entityType}:${i.id}`}
              className="flex flex-wrap items-center gap-3 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium [overflow-wrap:anywhere]">{i.title || "Bez názvu"}</div>
                <div className="text-sm text-muted">
                  {i.entityLabel}
                  {i.isPrivate ? " · soukromé" : ""} · smazáno {fmt.format(new Date(i.deletedAt))}
                  {i.deletedByName ? ` (${i.deletedByName})` : ""}
                  {i.children > 0 ? ` · + ${i.children} podřízených` : ""} · zbývá {i.daysLeft} dní
                </div>
              </div>
              <Button
                variant="secondary"
                loading={restore.isPending}
                onClick={() => restore.mutate(i)}
              >
                Obnovit
              </Button>
              {canPurge && (
                <Button variant="ghost" onClick={() => setPurging(i)}>
                  Smazat natrvalo
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!purging}
        onOpenChange={(o) => !o && setPurging(null)}
        title="Smazat natrvalo?"
        description={`„${purging?.title ?? ""}“ i s podřízenými záznamy se nenávratně smaže. Historie změn zůstane.`}
        confirmLabel="Smazat natrvalo"
        danger
        onConfirm={() => void (purging && purge.mutate(purging))}
      />
    </div>
  );
}
