"use client";

import {
  ConfirmDialog,
  errorToast,
  successToast,
  useCommandMutation,
  useEntityApi,
} from "@rebar/ui";
import { useEffect, useState, type ReactNode } from "react";
import type { AllocationChange, People } from "../contract";

/*
  Sdílené kousky UI financí: popisky, formáty, seznam uživatelů a mutace s potvrzením přepočtu rozdělení zaplacené
  platby (FIN-13, SPOL-15). UI importuje z `../logic` jen čisté funkce a z `../contract` jen typy.
*/

export * from "./format";
import { firstNameOf, money, personName, STATUS_LABELS } from "./format";
/** Uživatel v nabídkách výběru: id, celé jméno a křestní jméno. */
export type UserOption = { value: string; label: string; firstName: string };

let usersCache: Promise<UserOption[]> | null = null;

/** Všichni uživatelé (v OPSYS dva); načtou se jednou na relaci přes lookup jádra. */
export function useUsers(): UserOption[] {
  const api = useEntityApi();
  const [users, setUsers] = useState<UserOption[]>([]);
  useEffect(() => {
    let live = true;
    usersCache ??= api.lookups
      .users("")
      .then((r) => {
        // stejné křestní jméno u dvou lidí: ve větách se rozliší celým jménem
        const first = r.map((o) => firstNameOf(o.label));
        return r.map((o, i) => ({
          value: o.value,
          label: o.label,
          firstName: first.filter((f) => f === first[i]).length > 1 ? o.label : first[i]!,
        }));
      })
      .catch(() => {
        usersCache = null;
        return [];
      });
    void usersCache.then((u) => live && setUsers(u));
    return () => {
      live = false;
    };
  }, [api]);
  return users;
}

/** Jména uživatelů podle id: z `people` odpovědi doplněná o seznam uživatelů. */
export function usePeople(people?: People): People {
  const users = useUsers();
  const out: People = {};
  for (const u of users)
    out[u.value] = { id: u.value, name: u.label, firstName: u.firstName, shortName: null };
  for (const [k, v] of Object.entries(people ?? {})) out[k] = v;
  return out;
}

/** Odpověď příkazu, který čeká na potvrzení přepočtu. */
function needsConfirmation(
  out: unknown,
): out is { status: "needs_confirmation"; changes: AllocationChange[] } {
  return (
    typeof out === "object" &&
    out !== null &&
    (out as { status?: string }).status === "needs_confirmation"
  );
}

/** Okno potvrzení přepočtu rozdělení zaplacených plateb (co se změní). */
export function RecalcConfirm({
  changes,
  people,
  onConfirm,
  onCancel,
}: {
  changes: AllocationChange[] | null;
  people: People;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={changes !== null}
      onOpenChange={(o) => !o && onCancel()}
      title="Přepočítat rozdělení zaplacené platby?"
      description="Změna ovlivní rozdělení plateb, které už jsou zaplacené, a tím i saldo vyrovnání."
      confirmLabel="Přepočítat"
      onConfirm={() => {
        onConfirm();
      }}
    >
      <ul className="max-h-64 space-y-2 overflow-y-auto text-sm" data-testid="recalc-changes">
        {(changes ?? []).map((c) => (
          <li key={c.paymentId} className="rounded-md border border-line-soft p-2">
            <p className="font-medium">
              {c.description} <span className="text-muted">({STATUS_LABELS[c.status]})</span>
            </p>
            <p className="text-muted">
              Teď:{" "}
              {c.before
                .map((a) => `${personName(people, a.userId)} ${money(a.amountMinor)}`)
                .join(", ") || "–"}
            </p>
            <p>
              Nově:{" "}
              {c.after
                .map((a) => `${personName(people, a.userId)} ${money(a.amountMinor)}`)
                .join(", ") || "–"}
            </p>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}

/**
 * Mutace příkazu, který může vrátit `needs_confirmation` (přepočet zaplacené platby). Výsledek `ok` zavolá `onOk`,
 * jinak se ukáže potvrzení a po souhlasu se příkaz zopakuje s `confirmRecalc: true`. Chyby jdou do toastu.
 */
export function useConfirmedMutation<
  I extends { confirmRecalc?: boolean | undefined },
  O = unknown,
>(
  name: string,
  opts: { success?: string; onOk?: (out: O, input: I) => void; people?: People } = {},
): { run: (input: I) => void; pending: boolean; dialog: ReactNode } {
  const m = useCommandMutation<I, O>(name);
  const [ask, setAsk] = useState<{ input: I; changes: AllocationChange[] } | null>(null);
  const people = usePeople(opts.people);

  const run = (input: I) =>
    m.mutate(input, {
      onError: (e) => errorToast(e.message),
      onSuccess: (out) => {
        if (needsConfirmation(out)) return setAsk({ input, changes: out.changes });
        if (opts.success) successToast(opts.success);
        opts.onOk?.(out, input);
      },
    });

  const dialog = (
    <RecalcConfirm
      changes={ask?.changes ?? null}
      people={people}
      onCancel={() => setAsk(null)}
      onConfirm={() => {
        const input = ask?.input;
        setAsk(null);
        if (input) run({ ...input, confirmRecalc: true });
      }}
    />
  );
  return { run, pending: m.isPending, dialog };
}

/** Mutace s toastem při chybě a úspěchu. */
export function useToastMutation<I, O = unknown>(
  name: string,
  opts: {
    success?: string | ((out: O, input: I) => string);
    onOk?: (out: O, input: I) => void;
  } = {},
) {
  const m = useCommandMutation<I, O>(name);
  const run = (input: I) =>
    m.mutate(input, {
      onError: (e) => errorToast(e.message),
      onSuccess: (out) => {
        if (opts.success)
          successToast(
            typeof opts.success === "function" ? opts.success(out, input) : opts.success,
          );
        opts.onOk?.(out, input);
      },
    });
  return { run, pending: m.isPending };
}
