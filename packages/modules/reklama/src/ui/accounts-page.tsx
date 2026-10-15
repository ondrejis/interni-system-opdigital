"use client";

import {
  Checkbox,
  EmptyState,
  Icon,
  Notice,
  Skeleton,
  cn,
  useCan,
  useCommandQuery,
} from "@rebar/ui";
import { useState } from "react";
import type { AccountRow, AccountsListOutput } from "../contract";
import { OwnerChip, OwnerEdit, SyncBadge, SyncControl } from "./account-parts";
import { AppLink } from "./common";
import { accountHref, fmtInt, fmtMoney } from "./format";

/*
  Seznam reklamních účtů (`/reklama`, REK-11, REK-02): název, komu patří (OP Digital, nebo klient), počet kampaní,
  útrata tento měsíc a stav posledního stažení dat včetně chyby. Ruční „Obnovit“ stáhne všechny účty. Na telefonu karty.
*/

/** Stránka `/reklama`. */
export function AccountsPage() {
  const can = useCan();
  const [inactive, setInactive] = useState(false);
  const q = useCommandQuery<AccountsListOutput, { includeInactive: boolean }>(
    "reklama.accounts.list",
    { includeInactive: inactive },
  );
  const accounts = q.data?.accounts ?? [];
  const spend = accounts.reduce((s, a) => s + a.spendThisMonthMinor, 0);
  const currencies = new Set(accounts.map((a) => a.currency ?? "CZK"));
  const failing = accounts.filter((a) => a.lastSyncError).length;

  return (
    <div
      className="min-h-0 flex-1 space-y-4 overflow-auto bg-sunken p-4 md:p-6"
      data-testid="reklama-accounts"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Reklamní účty</h1>
          <p className="text-sm text-muted" data-testid="accounts-summary">
            {q.data
              ? `${accounts.length} ${plural(accounts.length)}${
                  currencies.size === 1
                    ? `, útrata tento měsíc ${fmtMoney(spend, [...currencies][0])}`
                    : ""
                }`
              : "Načítám…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={inactive}
              onCheckedChange={(v) => setInactive(v === true)}
              aria-label="Zobrazit i neaktivní účty"
              data-testid="show-inactive"
            />
            Zobrazit i neaktivní
          </label>
          <SyncControl label="Obnovit z Meta" />
        </div>
      </div>

      {q.data && !q.data.connected && (
        <Notice tone="warning" title="Meta zatím není napojená">
          Reklamní účty a kampaně se načtou, až v{" "}
          <AppLink href="/nastaveni/integrace">Nastavení → Integrace</AppLink> uložíte přístupový
          token Meta.
        </Notice>
      )}
      {failing > 0 && (
        <Notice
          tone="error"
          title={`Synchronizace selhala u ${failing} ${failing === 1 ? "účtu" : "účtů"}`}
        >
          Čísla níže mohou být zastaralá. Zkuste „Obnovit z Meta“, text chyby je u účtu.
        </Notice>
      )}

      {q.isLoading && <Skeleton className="h-40 w-full" />}
      {q.isError && (
        <EmptyState title="Účty se nepodařilo načíst" description={(q.error as Error).message} />
      )}
      {q.data && accounts.length === 0 && (
        <EmptyState
          icon={<Icon name="megaphone" />}
          title="Zatím žádné reklamní účty"
          description={
            q.data.connected
              ? "Účty se objeví po první synchronizaci z Meta."
              : "Nejdřív napojte Meta v Nastavení → Integrace."
          }
          {...(can("reklama.manage") && q.data.connected ? { action: <SyncControl /> } : {})}
        />
      )}

      {accounts.length > 0 && (
        <>
          <div className="card hidden overflow-x-auto md:block" data-testid="accounts-table">
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Účet
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Komu patří
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Kampaní
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Útrata tento měsíc
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Poslední synchronizace
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr
                    key={a.id}
                    className={cn(
                      "border-b border-line-soft align-top last:border-0",
                      !a.active && "opacity-60",
                    )}
                    data-testid="account-row"
                    data-account={a.id}
                  >
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      <AppLink href={accountHref(a.id)} data-testid="account-link">
                        {a.name}
                      </AppLink>
                      <div className="text-xs text-muted">
                        {a.metaId}
                        {!a.active && " · neaktivní"}
                      </div>
                    </th>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <OwnerChip a={a} />
                        <OwnerEdit account={a} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(a.campaignCount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMoney(a.spendThisMonthMinor, a.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <SyncBadge a={a} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden" data-testid="accounts-cards">
            {accounts.map((a) => (
              <AccountCard key={a.id} a={a} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AccountCard({ a }: { a: AccountRow }) {
  return (
    <li
      className={cn("card space-y-3 p-4", !a.active && "opacity-60")}
      data-testid="account-card"
      data-account={a.id}
    >
      <div>
        <AppLink href={accountHref(a.id)} className="font-medium text-accent hover:underline">
          {a.name}
        </AppLink>
        <div className="text-xs text-muted">
          {a.metaId}
          {!a.active && " · neaktivní"}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <OwnerChip a={a} />
        <OwnerEdit account={a} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted">Útrata tento měsíc</dt>
          <dd className="tabular-nums">{fmtMoney(a.spendThisMonthMinor, a.currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Kampaní</dt>
          <dd className="tabular-nums">{fmtInt(a.campaignCount)}</dd>
        </div>
      </dl>
      <SyncBadge a={a} />
    </li>
  );
}

const plural = (n: number) => (n === 1 ? "účet" : n >= 2 && n <= 4 ? "účty" : "účtů");
