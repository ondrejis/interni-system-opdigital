"use client";

import {
  Button,
  Chip,
  Combobox,
  Dialog,
  DialogClose,
  DialogContent,
  Notice,
  SegmentedControl,
  useCan,
  useCommandMutation,
  useEntityApi,
} from "@rebar/ui";
import { useId, useState } from "react";
import type { AccountRow, SyncSummary } from "../contract";
import { AppLink } from "./common";
import { syncState } from "./format";

/*
  Části sdílené seznamem účtů, detailem účtu a kampaně: komu účet patří (štítek a dialog změny, REK-02), stav posledního
  stažení dat a tlačítko „Obnovit“ (REK-06). Změna vlastníka jde přes příkaz `reklama.account.setOwner`, který hlídá,
  že účet klienta má klienta.
*/

type OwnerFields = Pick<AccountRow, "id" | "name" | "ownerKind" | "companyId" | "companyName">;

/** Odkaz na kartu klienta (detail klienta je `/kontakty/firmy/<id>`). */
export const clientHref = (companyId: string) => `/kontakty/firmy/${companyId}`;

/** Komu účet patří: „OP Digital“, nebo „Klient: <firma>“ s odkazem na kartu klienta. */
export function OwnerChip({
  a,
}: {
  a: Pick<AccountRow, "ownerKind" | "companyId" | "companyName">;
}) {
  if (a.ownerKind === "agency")
    return (
      <Chip color="blue" data-testid="owner-chip" data-owner="agency">
        OP Digital
      </Chip>
    );
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1.5"
      data-testid="owner-chip"
      data-owner="client"
    >
      <Chip color="purple">Klient</Chip>
      {a.companyId ? (
        <AppLink href={clientHref(a.companyId)}>{a.companyName ?? "Klient"}</AppLink>
      ) : (
        <span className="text-warning">klient nezvolen</span>
      )}
    </span>
  );
}

/** Stav posledního stažení dat: štítek (čas, „Chyba synchronizace“) a pod ním text chyby. */
export function SyncBadge({ a }: { a: Pick<AccountRow, "lastSyncAt" | "lastSyncError"> }) {
  const s = syncState(a.lastSyncAt, a.lastSyncError);
  return (
    <div data-testid="sync-badge" data-state={s.kind}>
      <Chip color={s.color}>{s.label}</Chip>
      {a.lastSyncError && (
        <p className="mt-1 max-w-xs text-xs text-danger" data-testid="sync-error">
          {a.lastSyncError}
        </p>
      )}
    </div>
  );
}

/** Dialog „Komu patří účet“: agentuře (OP Digital), nebo klientovi (výběr firmy). */
export function OwnerDialog({
  account,
  open,
  onOpenChange,
}: {
  account: OwnerFields;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useEntityApi();
  const [kind, setKind] = useState<"agency" | "client">(account.ownerKind);
  const [companyId, setCompanyId] = useState<string | null>(account.companyId);
  const [label, setLabel] = useState<string | undefined>(account.companyName ?? undefined);
  const save = useCommandMutation<
    { accountId: string; ownerKind: "agency" | "client"; companyId?: string | null },
    void
  >("reklama.account.setOwner", { onSuccess: () => onOpenChange(false) });
  const missing = kind === "client" && !companyId;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Komu patří účet" description={account.name} data-testid="owner-dialog">
        <div className="space-y-3 px-5 py-4">
          <SegmentedControl
            label="Vlastník účtu"
            value={kind}
            onChange={setKind}
            options={[
              { value: "agency", label: "OP Digital" },
              { value: "client", label: "Klient" },
            ]}
          />
          {kind === "agency" ? (
            <p className="text-sm text-muted">
              Vlastní akvizice agentury. Čísla se nepřipisují žádnému klientovi.
            </p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Klient</p>
              <Combobox
                aria-label="Klient"
                load={(q) => api.lookups.records("company", q)}
                value={companyId}
                selectedLabels={companyId && label ? { [companyId]: label } : {}}
                onChange={(v) => {
                  setCompanyId(typeof v === "string" ? v : null);
                  setLabel(undefined);
                }}
                placeholder="Vyberte klienta"
                searchPlaceholder="Hledat firmu…"
                className="w-full"
              />
              <p className="text-sm text-muted">
                Čísla účtu se pak ukážou na kartě klienta v záložce Reklama.
              </p>
            </div>
          )}
          {save.error && <Notice tone="error">{save.error.message}</Notice>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <DialogClose asChild>
            <Button>Zrušit</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={missing}
            loading={save.isPending}
            data-testid="owner-save"
            onClick={() =>
              save.mutate({
                accountId: account.id,
                ownerKind: kind,
                ...(kind === "client" ? { companyId } : {}),
              })
            }
          >
            Uložit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Tlačítko „Změnit“ u vlastníka účtu (jen s oprávněním `reklama.write`). */
export function OwnerEdit({ account }: { account: OwnerFields }) {
  const can = useCan();
  const [open, setOpen] = useState(false);
  if (!can("reklama.write")) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="owner-edit">
        Změnit
      </Button>
      {open && <OwnerDialog account={account} open={open} onOpenChange={setOpen} />}
    </>
  );
}

/**
 * Ruční obnova dat z Meta (`reklama.sync`; jen s `reklama.manage`): bez `accountId` všech účtů, jinak jednoho. Po
 * dokončení ukáže, kolik se načetlo, nebo chyby jednotlivých účtů; data se přenačtou sama.
 */
export function SyncControl({
  accountId,
  disabled,
  label = "Obnovit",
}: {
  accountId?: string;
  disabled?: boolean;
  label?: string;
}) {
  const can = useCan();
  const sync = useCommandMutation<{ accountId?: string }, SyncSummary>("reklama.sync");
  const resultId = useId();
  if (!can("reklama.manage")) return null;
  const r = sync.data;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        onClick={() => sync.mutate(accountId ? { accountId } : {})}
        loading={sync.isPending}
        disabled={disabled}
        data-testid="sync-button"
        aria-describedby={sync.data || sync.error ? resultId : undefined}
      >
        {label}
      </Button>
      <div id={resultId} aria-live="polite" className="text-sm">
        {sync.error && <Notice tone="error">Obnova selhala: {sync.error.message}</Notice>}
        {r && r.errors.length === 0 && (
          <p className="text-muted" data-testid="sync-result">
            Obnoveno: kampaní {r.campaigns}, řádků statistik {r.insightRows}.
          </p>
        )}
        {r && r.errors.length > 0 && (
          <Notice tone="warning" title="Obnova dopadla jen částečně">
            <ul className="list-disc pl-4" data-testid="sync-errors">
              {r.errors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          </Notice>
        )}
      </div>
    </div>
  );
}
