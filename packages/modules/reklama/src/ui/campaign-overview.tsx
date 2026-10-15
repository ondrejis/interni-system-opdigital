"use client";

import { formatInstant } from "@rebar/core/time";
import {
  Button,
  Chip,
  Combobox,
  Dialog,
  DialogContent,
  EmptyState,
  Notice,
  Skeleton,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
} from "@rebar/ui";
import { useState } from "react";
import type { AccountsListOutput, AdRow, CampaignDetailOutput, CampaignLead } from "../contract";
import { JobCell } from "./account-overview";
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
import {
  accountHref,
  fmtInt,
  lostInfo,
  objectiveLabel,
  RESULT_COLOR,
  RESULT_LABEL,
  safeImageUrl,
  statusInfo,
} from "./format";

/*
  Detail kampaně (REK-09): reklamní sady a reklamy se stejnými čísly jako účet, náhled kreativy, seznam leadů
  (obchodů) z kampaně a graf útraty a leadů po dnech; vedle karta s přiřazením kampaně marketingové zakázce (REK-06).
  Rozdíl leadů Meta × OPSYS je nahoře i textem, ne jen barvou. Čísla bere `reklama.campaign.detail`.
*/

/** Náhled kreativy: miniatura, která se po kliknutí otevře větší; bez adresy (nebo bez http/https) popisek „bez náhledu“. */
export function CreativeThumb({ ad }: { ad: Pick<AdRow, "name" | "creativeUrl"> }) {
  const [open, setOpen] = useState(false);
  const url = safeImageUrl(ad.creativeUrl);
  if (!url)
    return (
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded border border-dashed border-line text-center text-[10px] leading-tight text-faint"
        data-testid="creative-none"
      >
        bez náhledu
      </span>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="size-10 shrink-0 overflow-hidden rounded border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]"
        aria-label={`Zvětšit náhled reklamy ${ad.name}`}
        data-testid="creative-thumb"
      >
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      </button>
      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent title="Náhled reklamy" description={ad.name} data-testid="creative-dialog">
            <div className="p-4">
              <img
                src={url}
                alt={`Náhled reklamy ${ad.name}`}
                referrerPolicy="no-referrer"
                className="mx-auto max-h-[60vh] w-auto max-w-full rounded"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function statusChip(status: string | null) {
  const st = statusInfo(status);
  return st ? <Chip color={st.color}>{st.label}</Chip> : undefined;
}

/** Řádky sad a pod nimi jejich reklamy (odsazené, s náhledem kreativy). */
export function adSetRows(adSets: CampaignDetailOutput["adSets"]): MetricsRow[] {
  return adSets.flatMap((s) => [
    {
      id: s.id,
      name: <span className="font-medium">{s.name}</span>,
      ...(s.status ? { sub: statusChip(s.status) } : {}),
      metrics: s.metrics,
    },
    ...s.ads.map((a) => ({
      id: a.id,
      indent: true,
      name: (
        <span className="flex items-center gap-2">
          <CreativeThumb ad={a} />
          <span>{a.name}</span>
        </span>
      ),
      ...(a.status ? { sub: statusChip(a.status) } : {}),
      metrics: a.metrics,
    })),
  ]);
}

const nfDate = (iso: string) => formatInstant(iso, { year: true, time: false });

/** Leady (obchody se zdrojem Meta) z kampaně: název s odkazem na obchod, kdy přišel, výsledek. */
export function CampaignLeads({ leads }: { leads: CampaignLead[] }) {
  if (leads.length === 0)
    return (
      <p className="px-4 py-6 text-sm text-muted" data-testid="leads-empty">
        Z kampaně zatím nedorazil žádný lead do OPSYS.
      </p>
    );
  return (
    <ul className="divide-y divide-[var(--line-soft)]" data-testid="campaign-leads">
      {leads.map((l) => (
        <li key={l.dealId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <AppLink href={`/obchody/${l.dealId}`} data-testid="lead-link">
            {l.title}
          </AppLink>
          <span className="flex items-center gap-2 text-sm text-muted">
            <span className="tabular-nums">{nfDate(l.createdAt)}</span>
            <Chip color={RESULT_COLOR[l.result]}>{RESULT_LABEL[l.result]}</Chip>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Hlavní karty Přehledu kampaně: výkon za období, graf, sady a reklamy, leady. */
export function CampaignPerformance({ campaignId }: { campaignId: string }) {
  const p = usePeriodState();
  const q = useCommandQuery<CampaignDetailOutput, { campaignId: string; period: typeof p.period }>(
    "reklama.campaign.detail",
    { campaignId, period: p.period },
  );
  const d = q.data;
  const currency = d?.account.currency ?? null;
  const lost = d ? lostInfo(d.totals) : null;
  return (
    <div className="space-y-4" data-testid="campaign-performance">
      <PeriodBar state={p} />
      {q.isLoading && <Skeleton className="h-48 w-full" />}
      {q.isError && (
        <EmptyState title="Kampaň se nepodařilo načíst" description={(q.error as Error).message} />
      )}
      {d && (
        <>
          {lost?.tone === "warn" && (
            <Notice tone="warning" title="Část leadů se cestou ztratila">
              Meta napočítala {fmtInt(d.totals.leadsMeta)} leadů, do OPSYS jich dorazilo{" "}
              {fmtInt(d.totals.leadsOpsys)} (rozdíl {fmtInt(d.totals.leadsLost)}). Zkontrolujte v
              Nastavení → Integrace poslední příchozí leady a mapování formulářů.
            </Notice>
          )}
          <KpiTiles m={d.totals} currency={currency} />
          <Section title="Útrata a leady po dnech">
            <DailyCharts daily={d.daily} />
          </Section>
          <Section
            title="Reklamní sady a reklamy"
            count={d.adSets.length}
            flush
            testid="campaign-adsets"
          >
            <MetricsTable
              testid="adsets-table"
              nameHeader="Sada a reklama"
              rows={adSetRows(d.adSets)}
              totals={d.totals}
              currency={currency}
              empty="Kampaň zatím nemá žádné sady. Objeví se po synchronizaci z Meta."
            />
          </Section>
          <Section
            title="Leady z kampaně"
            count={d.leads.length}
            flush
            testid="campaign-leads-card"
          >
            <CampaignLeads leads={d.leads} />
          </Section>
        </>
      )}
    </div>
  );
}

/** Přiřazení kampaně marketingové zakázce: výběr zakázky (u účtu klienta jen zakázky klienta) a zrušení přiřazení. */
export function JobAssign({
  campaignId,
  accountId,
  jobId,
  jobTitle,
}: {
  campaignId: string;
  accountId: string;
  jobId: string | null;
  jobTitle: string | null;
}) {
  const api = useEntityApi();
  const can = useCan();
  const accounts = useCommandQuery<AccountsListOutput, { includeInactive: boolean }>(
    "reklama.accounts.list",
    { includeInactive: true },
  );
  const acc = accounts.data?.accounts.find((a) => a.id === accountId);
  const clientId = acc?.ownerKind === "client" ? acc.companyId : null;
  const assign = useCommandMutation<{ campaignId: string; jobId: string | null }, void>(
    "reklama.campaign.assignJob",
  );
  const [picking, setPicking] = useState(false);

  async function load(q: string) {
    const conditions = [
      { attr: "type", op: "is" as const, value: "marketing" },
      ...(clientId ? [{ attr: "company", op: "is" as const, value: clientId }] : []),
    ];
    const page = await api.query("job", { q, limit: 20, filters: { op: "and", conditions } });
    return page.rows.map((r) => {
      const company = page.labels["company"]?.[String(r.company)]?.label;
      return {
        value: r.id,
        label: [r.number, r.title].filter(Boolean).join(" "),
        ...(company ? { hint: company } : {}),
      };
    });
  }

  return (
    <div className="space-y-3 text-sm" data-testid="job-assign">
      <div>
        <p className="mb-1.5 text-xs text-muted">Přiřazená zakázka</p>
        <JobCell jobId={jobId} jobTitle={jobTitle} />
      </div>
      {can("reklama.write") && (
        <div className="space-y-2">
          {picking ? (
            <Combobox
              open
              onOpenChange={(o) => !o && setPicking(false)}
              aria-label="Marketingová zakázka"
              load={load}
              value={jobId}
              selectedLabels={jobId && jobTitle ? { [jobId]: jobTitle } : {}}
              onChange={(v) => {
                setPicking(false);
                if (typeof v === "string" && v !== jobId) assign.mutate({ campaignId, jobId: v });
              }}
              placeholder="Vyberte zakázku"
              searchPlaceholder="Hledat marketingovou zakázku…"
              emptyText={
                clientId
                  ? "Klient nemá žádnou marketingovou zakázku."
                  : "Žádná marketingová zakázka."
              }
              className="w-full"
              trigger={<Button size="sm">Vybrat…</Button>}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => setPicking(true)}
                loading={assign.isPending}
                data-testid="job-pick"
              >
                {jobId ? "Změnit zakázku" : "Přiřadit zakázce"}
              </Button>
              {jobId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => assign.mutate({ campaignId, jobId: null })}
                  loading={assign.isPending}
                  data-testid="job-unassign"
                >
                  Zrušit přiřazení
                </Button>
              )}
            </div>
          )}
          {clientId && (
            <p className="text-xs text-muted">
              Účet patří klientovi, nabízí se jen jeho marketingové zakázky.
            </p>
          )}
          {assign.error && <Notice tone="error">{assign.error.message}</Notice>}
        </div>
      )}
      <p className="text-xs text-muted">
        Čísla kampaně se pak ukážou v záložce Reklama u zakázky a na kartě klienta.
      </p>
    </div>
  );
}

/** Postranní karta Přehledu kampaně: účet, cíl a stav, přiřazená zakázka. */
export function CampaignSide({ campaignId }: { campaignId: string }) {
  // Období jen kvůli tvaru příkazu: stejné jako výchozí v hlavní kartě, takže jde o sdílený dotaz z cache.
  const p = usePeriodState();
  const q = useCommandQuery<CampaignDetailOutput, { campaignId: string; period: typeof p.period }>(
    "reklama.campaign.detail",
    { campaignId, period: p.period },
  );
  if (q.isLoading) return <Skeleton className="h-32 w-full" />;
  const d = q.data;
  if (!d) return null;
  const st = statusInfo(d.campaign.status);
  const obj = objectiveLabel(d.campaign.objective);
  return (
    <Section title="Kampaň a zakázka" testid="campaign-side">
      <div className="space-y-4 text-sm">
        <div className="space-y-1">
          <p className="text-xs text-muted">Reklamní účet</p>
          <AppLink href={accountHref(d.account.id)}>{d.account.name}</AppLink>
          <div className="flex flex-wrap items-center gap-1.5 text-muted">
            {st && <Chip color={st.color}>{st.label}</Chip>}
            {obj && <span>{obj}</span>}
          </div>
        </div>
        <JobAssign
          campaignId={campaignId}
          accountId={d.account.id}
          jobId={d.campaign.jobId}
          jobTitle={d.campaign.jobTitle}
        />
      </div>
    </Section>
  );
}
