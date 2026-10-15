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
import { formatMoney } from "../logic";

/*
  Sdílené kousky UI financí: popisky, formáty, seznam uživatelů a mutace s potvrzením přepočtu rozdělení zaplacené
  platby (FIN-13, SPOL-15). UI importuje z `../logic` jen čisté funkce a z `../contract` jen typy.
*/

export const KIND_LABELS: Record<string, string> = {
  one_off: "Jednorázová",
  intro: "Úvodní fáze",
  retainer: "Retainer",
  extra: "Navíc",
  recurring: "Opakovaná (Fakturoid)",
};
export const STATUS_LABELS: Record<string, string> = {
  planned: "Plánovaná",
  issued: "Vystavená",
  paid: "Zaplacená",
  canceled: "Zrušená",
};
export const STATUS_COLORS: Record<string, string> = {
  planned: "gray",
  issued: "blue",
  paid: "green",
  canceled: "red",
};
export const METHOD_LABELS: Record<string, string> = {
  invoice: "Faktura mezi IČO",
  transfer: "Převod",
  offset: "Zápočet",
};
export const TYPE_LABELS: Record<string, string> = {
  web: "Web",
  marketing: "Marketing",
  systemy: "Systémy",
  recurring: "Opakované (Fakturoid)",
};

/** Částka v haléřích česky (`12 400 Kč`). */
export const money = (minor: number): string => formatMoney(minor);

/** Dnešní datum `RRRR-MM-DD` v místním čase. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Aktuální měsíc `RRRR-MM`. */
export const thisMonth = (): string => today().slice(0, 7);

/** `2026-10-14` → `14. 10. 2026`; prázdné → pomlčka. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

/** `2026-12` → `12/2026`. */
export function monthLabel(month: string | null | undefined): string {
  return month ? `${month.slice(5)}/${month.slice(0, 4)}` : "Bez data";
}

const MONTH_NAMES = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];
/** `2026-12` → `prosinec 2026`. */
export function monthName(month: string | null | undefined): string {
  return month
    ? `${MONTH_NAMES[Number(month.slice(5)) - 1] ?? month} ${month.slice(0, 4)}`
    : "Bez data";
}

/** Zkratka měsíce do osy grafu. */
export const SHORT_MONTHS = [
  "led",
  "úno",
  "bře",
  "dub",
  "kvě",
  "čvn",
  "čvc",
  "srp",
  "zář",
  "říj",
  "lis",
  "pro",
];

/** Křestní jméno z celého jména („Ondřej Dvořák“ → „Ondřej“). */
export const firstNameOf = (label: string): string => label.trim().split(/\s+/)[0] ?? label;

/** Jméno osoby z odpovědi příkazů (`people`), jinak znak „?“. */
export function personName(people: People, id: string | null | undefined): string {
  if (!id) return "–";
  return people[id]?.firstName || people[id]?.name || "?";
}

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
      .then((r) =>
        r.map((o) => ({ value: o.value, label: o.label, firstName: firstNameOf(o.label) })),
      )
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
