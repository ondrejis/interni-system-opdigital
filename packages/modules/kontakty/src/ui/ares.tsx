"use client";

import {
  Button,
  Chip,
  Skeleton,
  successToast,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import { useState } from "react";
import type { AresChange, AresCommandResult, AresField } from "../contract";

type Ok = Extract<AresCommandResult, { ok: true }>;

/** Tabulka změn z ARES se zaškrtávátky (ORG-03): co je teď a co přináší ARES. */
export function AresChangeList({
  changes,
  selected,
  onToggle,
}: {
  changes: AresChange[];
  selected: ReadonlySet<AresField>;
  onToggle: (f: AresField) => void;
}) {
  if (!changes.length)
    return (
      <p className="text-sm text-muted">Údaje v ARES se shodují s organizací, není co měnit.</p>
    );
  return (
    <table className="w-full text-sm" data-testid="ares-changes">
      <thead>
        <tr className="text-left text-muted">
          <th className="w-8" />
          <th>Pole</th>
          <th>Teď</th>
          <th>ARES</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.field} className="border-t border-line-soft">
            <td>
              <input
                type="checkbox"
                aria-label={`Použít ${c.label}`}
                checked={selected.has(c.field)}
                onChange={() => onToggle(c.field)}
                className="accent-[var(--accent)]"
              />
            </td>
            <td className="py-1.5 pr-2 font-medium">{c.label}</td>
            <td className="pr-2 text-muted">{c.current ?? "—"}</td>
            <td>
              {c.incoming} {c.kind === "fill" && <Chip color="green">doplní se</Chip>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Výběr polí k zápisu: výchozí jsou předvybraná pole z náhledu. */
export function useAresSelection(changes: AresChange[] | undefined) {
  const [override, setOverride] = useState<Set<AresField> | null>(null);
  const selected =
    override ?? new Set((changes ?? []).filter((c) => c.selected).map((c) => c.field));
  return {
    selected,
    toggle: (f: AresField) => {
      const next = new Set(selected);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      setOverride(next);
    },
  };
}

/**
 * Dialog „Aktualizovat z ARES“ u organizace (ORG-04): načte náhled bez cache, ukáže změny a po potvrzení zapíše
 * vybraná pole a čas synchronizace. Výpadek ARES ukáže větu; organizaci jde dál upravovat ručně.
 */
export function AresUpdateDialogBody({
  companyId,
  close,
}: {
  companyId: string;
  close: () => void;
}) {
  const preview = useCommandQuery<AresCommandResult>("kontakty.ares", { companyId });
  const data = preview.data;
  const { selected, toggle } = useAresSelection(data?.ok ? data.changes : undefined);
  const apply = useCommandMutation<
    { companyId: string; apply: true; fields: AresField[] },
    AresCommandResult
  >("kontakty.ares", {
    onSuccess: (r) => {
      if (r.ok) {
        successToast("Údaje z ARES jsou uložené.");
        close();
      }
    },
    invalidate: [["command"], ["entity"]],
  });
  const res = apply.data;
  return (
    <div className="space-y-3 px-5 py-4" data-testid="ares-dialog">
      {preview.isLoading ? (
        <Skeleton className="h-24" />
      ) : !data || !data.ok ? (
        <p role="alert" className="text-sm text-danger">
          {data?.message ?? preview.error?.message ?? "ARES teď neodpovídá."}
        </p>
      ) : (
        <>
          <p className="text-sm">
            ARES: <strong>{data.company.name}</strong> (IČO {data.company.ico})
            {data.stale && <Chip color="yellow">starší uložená odpověď</Chip>}
          </p>
          {data.duplicate && (
            <p className="text-sm text-danger" role="alert">
              Organizace s tímto IČO už existuje
              {data.duplicate.visible ? `: ${data.duplicate.name}` : ""}.
            </p>
          )}
          <AresChangeList changes={data.changes} selected={selected} onToggle={toggle} />
        </>
      )}
      {(apply.error || (res && !res.ok)) && (
        <p role="alert" className="text-sm text-danger">
          {apply.error?.message ?? (res && !res.ok ? res.message : "")}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={close}>
          Zavřít
        </Button>
        <Button
          variant="primary"
          disabled={!data?.ok || !!(data.ok && data.duplicate)}
          loading={apply.isPending}
          onClick={() => apply.mutate({ companyId, apply: true, fields: [...selected] })}
        >
          Uložit vybrané
        </Button>
      </div>
    </div>
  );
}

/** Úspěšný výsledek `kontakty.ares`. */
export type AresOk = Ok;
