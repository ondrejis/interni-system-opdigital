"use client";

import { Chip, EmptyState, Skeleton, useCommandQuery } from "@rebar/ui";
import type { AccountDetailOutput, AccountsListOutput, CampaignRow } from "../contract";
import { OwnerChip, OwnerEdit, SyncBadge, SyncControl } from "./account-parts";
import {
  AppLink,
  DailyCharts,
  KpiTiles,
  MetricsTable,
  PeriodBar,
  Section,
  usePeriodState,
  type MetricsRow,
} from "./common";
import { campaignHref, objectiveLabel, statusInfo } from "./format";

/*
  Detail reklamního účtu (REK-08): na Přehledu účtu (`/reklama/<id>`) hlavní karta s kampaněmi za zvolené období
  (7, 30, 90 dní, měsíc, vlastní), součty, graf útraty a leadů po dnech; vedle karta s vlastníkem účtu a stavem
  synchronizace. Čísla bere příkaz `reklama.account.detail`.
*/

/** Název kampaně s odkazem, stavem a cílem pod ním. */
export function campaignName(c: Pick<CampaignRow, "id" | "name" | "status" | "objective">) {
  const st = statusInfo(c.status);
  const obj = objectiveLabel(c.objective);
  return {
    name: (
      <AppLink href={campaignHref(c.id)} data-testid="campaign-link">
        {c.name}
      </AppLink>
    ),
    sub:
      st || obj ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {st && <Chip color={st.color}>{st.label}</Chip>}
          {obj && <span>{obj}</span>}
        </span>
      ) : undefined,
  };
}

/** Přiřazená zakázka kampaně jako odkaz (`/zakazky/<id>`), nebo nic. */
export function JobCell({ jobId, jobTitle }: { jobId: string | null; jobTitle: string | null }) {
  if (!jobId) return <span className="text-muted">Nepřiřazeno</span>;
  return (
    <AppLink href={`/zakazky/${jobId}`} data-testid="job-link">
      {jobTitle ?? "Zakázka"}
    </AppLink>
  );
}

/** Řádky tabulky kampaní. */
export function campaignRows(list: CampaignRow[]): MetricsRow[] {
  return list.map((c) => {
    const n = campaignName(c);
    return {
      id: c.id,
      name: n.name,
      ...(n.sub ? { sub: n.sub } : {}),
      metrics: c.metrics,
      extra: <JobCell jobId={c.jobId} jobTitle={c.jobTitle} />,
    };
  });
}

/** Hlavní karty Přehledu účtu: výkon za období, graf a kampaně. */
export function AccountPerformance({ accountId }: { accountId: string }) {
  const p = usePeriodState();
  const q = useCommandQuery<AccountDetailOutput, { accountId: string; period: typeof p.period }>(
    "reklama.account.detail",
    { accountId, period: p.period },
  );
  const d = q.data;
  const currency = d?.account.currency ?? null;
  return (
    <div className="space-y-4" data-testid="account-performance">
      <PeriodBar state={p} />
      {q.isLoading && <Skeleton className="h-48 w-full" />}
      {q.isError && (
        <EmptyState
          title="Výkon účtu se nepodařilo načíst"
          description={(q.error as Error).message}
        />
      )}
      {d && (
        <>
          <KpiTiles m={d.totals} currency={currency} />
          <Section title="Útrata a leady po dnech">
            <DailyCharts daily={d.daily} />
          </Section>
          <Section title="Kampaně" count={d.campaigns.length} flush testid="account-campaigns">
            <MetricsTable
              testid="campaigns-table"
              nameHeader="Kampaň"
              extraHeader="Zakázka"
              rows={campaignRows(d.campaigns)}
              totals={d.totals}
              currency={currency}
              empty="Účet zatím nemá žádné kampaně. Objeví se po synchronizaci z Meta."
            />
          </Section>
        </>
      )}
    </div>
  );
}

/** Postranní karta Přehledu účtu: komu účet patří, měna a stav synchronizace s tlačítkem Obnovit. */
export function AccountSide({ accountId }: { accountId: string }) {
  const q = useCommandQuery<AccountsListOutput, { includeInactive: boolean }>(
    "reklama.accounts.list",
    { includeInactive: true },
  );
  const a = q.data?.accounts.find((x) => x.id === accountId);
  if (q.isLoading) return <Skeleton className="h-32 w-full" />;
  if (!a) return null;
  return (
    <Section title="Účet a synchronizace" testid="account-side">
      <div className="space-y-4 text-sm">
        <div>
          <p className="mb-1.5 text-xs text-muted">Komu patří</p>
          <div className="flex flex-wrap items-center gap-2">
            <OwnerChip a={a} />
            <OwnerEdit account={a} />
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs text-muted">Data z Meta</p>
          <SyncBadge a={a} />
        </div>
        <SyncControl accountId={a.id} />
        <p className="text-xs text-muted">
          Měna {a.currency ?? "neznámá"}
          {a.timezone ? `, časové pásmo ${a.timezone}` : ""}. Posledních 7 dní se při každé
          synchronizaci přepočítá kvůli zpětným úpravám od Meta.
        </p>
      </div>
    </Section>
  );
}
