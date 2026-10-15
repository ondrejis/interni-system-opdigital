import { and, asc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { canSeePrivate, privateScope } from "@rebar/core/entities";
import type { Ctx } from "@rebar/core/rbac";
import { NotFoundError } from "@rebar/core/rbac";
import { monthRange, todayIso } from "@rebar/core/time";
import { deal } from "@rebar/obchody/schema";
import type {
  AccountDetailOutput,
  AccountRow,
  AccountsListOutput,
  AdSetRow,
  AdsOverviewOutput,
  CampaignDetailOutput,
  CampaignLead,
  CampaignRow,
  DailyPoint,
  MetricsOutput,
  Period,
  PerformanceMetrics,
} from "../contract";
import { ad, adAccount, adCampaign, adInsightDaily, adSet } from "../schema";
import { createCredentialStore } from "@rebar/core/integrations";
import type { ModuleDeps } from "@rebar/core/module-server";
import {
  buildMetrics,
  emptyMetricsInput,
  fillDaily,
  sumMetricsInputs,
  type MetricsInput,
} from "./logic";

/*
  Čtení reklamy pro příkazy, metriky a příspěvky karet (REK-08, 09, 10): účty a kampaně s výkonem za období, sady a
  reklamy, graf po dnech, leady kampaně. „Leady OPSYS“ jsou obchody se zdrojem Meta (podle data založení v pražském
  čase) a respektují soukromé obchody (`privateScope`); počítají se bez ohledu na rozsah „jen moje“, protože jde
  o souhrn reklamy agentury. „Vyhrané“ jsou obchody těchto leadů (kohorta období) s výsledkem `won`.
*/

type Db = Ctx["db"];
const num = (v: unknown) => Number(v ?? 0);
const TZ = "Europe/Prague";

type Totals = { spend: number; impressions: number; clicks: number; leads: number };
type Level = "campaign" | "adset" | "ad";

/** Součty denních statistik po objektech úrovně za období. */
async function insightTotals(
  db: Db,
  level: Level,
  ids: readonly string[],
  period: Period,
): Promise<Map<string, Totals>> {
  const out = new Map<string, Totals>();
  if (!ids.length) return out;
  const rows = await db
    .select({
      id: adInsightDaily.objectId,
      spend: sql<number>`coalesce(sum(${adInsightDaily.spendMinor}), 0)::float8`,
      impressions: sql<number>`coalesce(sum(${adInsightDaily.impressions}), 0)::float8`,
      clicks: sql<number>`coalesce(sum(${adInsightDaily.clicks}), 0)::float8`,
      leads: sql<number>`coalesce(sum(${adInsightDaily.leads}), 0)::float8`,
    })
    .from(adInsightDaily)
    .where(
      and(
        eq(adInsightDaily.level, level),
        inArray(adInsightDaily.objectId, [...ids]),
        sql`${adInsightDaily.date} >= ${period.from}`,
        sql`${adInsightDaily.date} <= ${period.to}`,
      ),
    )
    .groupBy(adInsightDaily.objectId);
  for (const r of rows)
    out.set(r.id, {
      spend: num(r.spend),
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      leads: num(r.leads),
    });
  return out;
}

const dealDay = sql`(${deal.createdAt} at time zone ${TZ})::date`;

/** Obchody se zdrojem Meta (leady OPSYS) a z nich vyhrané, po objektech podle Meta ID kampaně, sady nebo reklamy. */
async function dealTotals(
  ctx: Ctx,
  level: Level,
  metaIds: readonly string[],
  period: Period,
): Promise<Map<string, { leads: number; won: number }>> {
  const out = new Map<string, { leads: number; won: number }>();
  if (!metaIds.length) return out;
  const col =
    level === "campaign"
      ? deal.metaCampaignId
      : level === "adset"
        ? deal.metaAdsetId
        : deal.metaAdId;
  const rows = await ctx.db
    .select({
      id: col,
      leads: sql<number>`count(*)::int`,
      won: sql<number>`count(*) filter (where ${deal.result} = 'won')::int`,
    })
    .from(deal)
    .where(
      and(
        isNull(deal.deletedAt),
        eq(deal.source, "meta"),
        inArray(col, [...metaIds]),
        privateScope(ctx, deal),
        sql`${dealDay} between ${period.from}::date and ${period.to}::date`,
      ),
    )
    .groupBy(col);
  for (const r of rows) if (r.id) out.set(r.id, { leads: num(r.leads), won: num(r.won) });
  return out;
}

type Base = { id: string; metaId: string };

/** Hrubé součty (útrata, leady Meta i OPSYS, výhry) po objektech úrovně; chybějící objekt = nuly. */
async function inputsFor(
  ctx: Ctx,
  level: Level,
  bases: readonly Base[],
  period: Period,
): Promise<Map<string, MetricsInput>> {
  const [ins, deals] = await Promise.all([
    insightTotals(
      ctx.db,
      level,
      bases.map((b) => b.id),
      period,
    ),
    dealTotals(
      ctx,
      level,
      bases.map((b) => b.metaId),
      period,
    ),
  ]);
  return new Map(
    bases.map((b) => {
      const i = ins.get(b.id);
      const d = deals.get(b.metaId);
      return [
        b.id,
        {
          spendMinor: i?.spend ?? 0,
          impressions: i?.impressions ?? 0,
          clicks: i?.clicks ?? 0,
          leadsMeta: i?.leads ?? 0,
          leadsOpsys: d?.leads ?? 0,
          wonDeals: d?.won ?? 0,
        },
      ] as const;
    }),
  );
}

/** Graf po dnech pro zadané kampaně: útrata, zobrazení, kliky, leady Meta (statistiky) a leady OPSYS (obchody). */
async function dailyFor(
  ctx: Ctx,
  campaigns: readonly Base[],
  period: Period,
): Promise<DailyPoint[]> {
  if (!campaigns.length) return fillDaily([], period.from, period.to);
  const ins = await ctx.db
    .select({
      date: adInsightDaily.date,
      spend: sql<number>`coalesce(sum(${adInsightDaily.spendMinor}), 0)::float8`,
      impressions: sql<number>`coalesce(sum(${adInsightDaily.impressions}), 0)::float8`,
      clicks: sql<number>`coalesce(sum(${adInsightDaily.clicks}), 0)::float8`,
      leads: sql<number>`coalesce(sum(${adInsightDaily.leads}), 0)::float8`,
    })
    .from(adInsightDaily)
    .where(
      and(
        eq(adInsightDaily.level, "campaign"),
        inArray(
          adInsightDaily.objectId,
          campaigns.map((c) => c.id),
        ),
        sql`${adInsightDaily.date} >= ${period.from}`,
        sql`${adInsightDaily.date} <= ${period.to}`,
      ),
    )
    .groupBy(adInsightDaily.date);
  const deals = await ctx.db
    .select({
      date: sql<string>`to_char(${dealDay}, 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(deal)
    .where(
      and(
        isNull(deal.deletedAt),
        eq(deal.source, "meta"),
        inArray(
          deal.metaCampaignId,
          campaigns.map((c) => c.metaId),
        ),
        privateScope(ctx, deal),
        sql`${dealDay} between ${period.from}::date and ${period.to}::date`,
      ),
    )
    .groupBy(sql`1`);
  return fillDaily(
    [
      ...ins.map((r) => ({
        date: r.date,
        spendMinor: num(r.spend),
        impressions: num(r.impressions),
        clicks: num(r.clicks),
        leadsMeta: num(r.leads),
        leadsOpsys: 0,
      })),
      ...deals.map((r) => ({
        date: r.date,
        spendMinor: 0,
        impressions: 0,
        clicks: 0,
        leadsMeta: 0,
        leadsOpsys: num(r.n),
      })),
    ],
    period.from,
    period.to,
  );
}

/* ---------- zakázky (měkký odkaz, tabulka `job` jiného modulu) ---------- */

type JobInfo = { id: string; title: string; companyId: string | null; type: string };

/** Zakázky podle id (jen ty, které aktér smí vidět); modul zakázek nemusí být zapnutý, pak je výsledek prázdný. */
export async function loadJobs(ctx: Ctx, ids: readonly string[]): Promise<Map<string, JobInfo>> {
  const out = new Map<string, JobInfo>();
  if (!ids.length) return out;
  try {
    const list = sql.join(
      ids.map((i) => sql`${i}::uuid`),
      sql`, `,
    );
    const priv = canSeePrivate(ctx) ? sql`` : sql` and is_private = false`;
    const rows = (await ctx.db.execute(
      sql`select id, title, company_id as "companyId", type from job where deleted_at is null and id in (${list})${priv}`,
    )) as unknown as JobInfo[];
    for (const r of rows) out.set(r.id, r);
  } catch {
    // tabulka `job` neexistuje (modul zakázek není nasazen)
  }
  return out;
}

/** ID zakázek klienta (viditelné aktérovi). */
async function jobIdsOfCompany(ctx: Ctx, companyId: string): Promise<string[]> {
  try {
    const priv = canSeePrivate(ctx) ? sql`` : sql` and is_private = false`;
    const rows = (await ctx.db.execute(
      sql`select id from job where deleted_at is null and company_id = ${companyId}::uuid${priv}`,
    )) as unknown as { id: string }[];
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

/* ---------- kampaně s výkonem ---------- */

type CampaignBase = typeof adCampaign.$inferSelect;

async function toCampaignRows(
  ctx: Ctx,
  campaigns: readonly CampaignBase[],
  period: Period,
): Promise<{ rows: CampaignRow[]; inputs: Map<string, MetricsInput> }> {
  const inputs = await inputsFor(ctx, "campaign", campaigns, period);
  const jobs = await loadJobs(
    ctx,
    campaigns.flatMap((c) => (c.jobId ? [c.jobId] : [])),
  );
  const rows = campaigns.map((c) => ({
    id: c.id,
    metaId: c.metaId,
    accountId: c.accountId,
    name: c.name,
    objective: c.objective,
    status: c.status,
    jobId: c.jobId,
    jobTitle: c.jobId ? (jobs.get(c.jobId)?.title ?? null) : null,
    metrics: buildMetrics(inputs.get(c.id) ?? emptyMetricsInput()),
  }));
  return { rows, inputs };
}

const totalsOf = (inputs: Iterable<MetricsInput>): PerformanceMetrics =>
  buildMetrics(sumMetricsInputs([...inputs]));

/** Sloupce účtu pro přehled. */
async function accountRows(ctx: Ctx, where: SQL | undefined): Promise<AccountRow[]> {
  const accounts = await ctx.db
    .select()
    .from(adAccount)
    .where(and(isNull(adAccount.deletedAt), where))
    .orderBy(asc(adAccount.name));
  if (!accounts.length) return [];
  const ids = accounts.map((a) => a.id);
  const month = { from: monthRange(todayIso().slice(0, 7)).from, to: todayIso() };
  const spent = await ctx.db
    .select({
      accountId: adCampaign.accountId,
      spend: sql<number>`coalesce(sum(${adInsightDaily.spendMinor}), 0)::float8`,
    })
    .from(adInsightDaily)
    .innerJoin(adCampaign, eq(adCampaign.id, adInsightDaily.objectId))
    .where(
      and(
        eq(adInsightDaily.level, "campaign"),
        inArray(adCampaign.accountId, ids),
        sql`${adInsightDaily.date} >= ${month.from}`,
        sql`${adInsightDaily.date} <= ${month.to}`,
      ),
    )
    .groupBy(adCampaign.accountId);
  const counts = await ctx.db
    .select({ accountId: adCampaign.accountId, n: sql<number>`count(*)::int` })
    .from(adCampaign)
    .where(and(inArray(adCampaign.accountId, ids), isNull(adCampaign.deletedAt)))
    .groupBy(adCampaign.accountId);
  const companyIds = [...new Set(accounts.flatMap((a) => (a.companyId ? [a.companyId] : [])))];
  const names = new Map<string, string>();
  if (companyIds.length) {
    try {
      const list = sql.join(
        companyIds.map((i) => sql`${i}::uuid`),
        sql`, `,
      );
      const priv = canSeePrivate(ctx) ? sql`` : sql` and is_private = false`;
      const rows = (await ctx.db.execute(
        sql`select id, name from company where deleted_at is null and id in (${list})${priv}`,
      )) as unknown as { id: string; name: string }[];
      for (const r of rows) names.set(r.id, r.name);
    } catch {
      // bez modulu kontaktů nelze pojmenovat klienta
    }
  }
  const spentBy = new Map(spent.map((r) => [r.accountId, num(r.spend)] as const));
  const countBy = new Map(counts.map((r) => [r.accountId, num(r.n)] as const));
  return accounts.map((a) => ({
    id: a.id,
    metaId: a.metaId,
    name: a.name,
    ownerKind: a.ownerKind,
    companyId: a.companyId,
    companyName: a.companyId ? (names.get(a.companyId) ?? null) : null,
    currency: a.currency,
    timezone: a.timezone,
    active: a.active,
    lastSyncAt: a.lastSyncAt ? a.lastSyncAt.toISOString() : null,
    lastSyncError: a.lastSyncError,
    campaignCount: countBy.get(a.id) ?? 0,
    spendThisMonthMinor: spentBy.get(a.id) ?? 0,
  }));
}

/** Seznam účtů (REK-11) a zda je Meta napojená. */
export async function listAccounts(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "cipher">,
  input: { includeInactive?: boolean | undefined },
): Promise<AccountsListOutput> {
  const accounts = await accountRows(
    ctx,
    input.includeInactive ? undefined : eq(adAccount.active, true),
  );
  const info = (
    await createCredentialStore(deps.cipher)
      .list(ctx)
      .catch(() => [])
  ).find((c) => c.provider === "meta" && c.userId === null);
  return { accounts, connected: !!info };
}

/** Detail účtu: kampaně za období se všemi čísly (REK-08). */
export async function accountDetail(
  ctx: Ctx,
  input: { accountId: string; period: Period },
): Promise<AccountDetailOutput> {
  const [account] = await accountRows(ctx, eq(adAccount.id, input.accountId));
  if (!account) throw new NotFoundError();
  const campaigns = await ctx.db
    .select()
    .from(adCampaign)
    .where(and(eq(adCampaign.accountId, account.id), isNull(adCampaign.deletedAt)))
    .orderBy(asc(adCampaign.name));
  const { rows, inputs } = await toCampaignRows(ctx, campaigns, input.period);
  return {
    account,
    campaigns: rows.sort((a, b) => b.metrics.spendMinor - a.metrics.spendMinor),
    totals: totalsOf(inputs.values()),
    daily: await dailyFor(ctx, campaigns, input.period),
  };
}

/** Detail kampaně: sady a reklamy se stejnými čísly, graf po dnech a leady (REK-09). */
export async function campaignDetail(
  ctx: Ctx,
  input: { campaignId: string; period: Period },
): Promise<CampaignDetailOutput> {
  const [campaign] = await ctx.db
    .select()
    .from(adCampaign)
    .where(and(eq(adCampaign.id, input.campaignId), isNull(adCampaign.deletedAt)));
  if (!campaign) throw new NotFoundError();
  const [account] = await ctx.db
    .select()
    .from(adAccount)
    .where(eq(adAccount.id, campaign.accountId));
  const { rows, inputs } = await toCampaignRows(ctx, [campaign], input.period);

  const sets = await ctx.db
    .select()
    .from(adSet)
    .where(and(eq(adSet.campaignId, campaign.id), isNull(adSet.deletedAt)))
    .orderBy(asc(adSet.name));
  const ads = sets.length
    ? await ctx.db
        .select()
        .from(ad)
        .where(
          and(
            inArray(
              ad.adSetId,
              sets.map((s) => s.id),
            ),
            isNull(ad.deletedAt),
          ),
        )
        .orderBy(asc(ad.name))
    : [];
  const setInputs = await inputsFor(ctx, "adset", sets, input.period);
  const adInputs = await inputsFor(ctx, "ad", ads, input.period);
  const adSets: AdSetRow[] = sets.map((s) => ({
    id: s.id,
    metaId: s.metaId,
    name: s.name,
    status: s.status,
    metrics: buildMetrics(setInputs.get(s.id) ?? emptyMetricsInput()),
    ads: ads
      .filter((a) => a.adSetId === s.id)
      .map((a) => ({
        id: a.id,
        metaId: a.metaId,
        name: a.name,
        status: a.status,
        creativeUrl: a.creativeUrl,
        metrics: buildMetrics(adInputs.get(a.id) ?? emptyMetricsInput()),
      })),
  }));

  const leads: CampaignLead[] = (
    await ctx.db
      .select({
        dealId: deal.id,
        title: deal.title,
        createdAt: deal.createdAt,
        result: deal.result,
        stageId: deal.stageId,
        companyId: deal.companyId,
      })
      .from(deal)
      .where(
        and(
          isNull(deal.deletedAt),
          eq(deal.source, "meta"),
          eq(deal.metaCampaignId, campaign.metaId),
          privateScope(ctx, deal),
          sql`${dealDay} between ${input.period.from}::date and ${input.period.to}::date`,
        ),
      )
      .orderBy(sql`${deal.createdAt} desc`)
      .limit(200)
  ).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));

  return {
    campaign: rows[0]!,
    account: {
      id: account?.id ?? campaign.accountId,
      name: account?.name ?? "",
      currency: account?.currency ?? null,
    },
    adSets,
    totals: totalsOf(inputs.values()),
    daily: await dailyFor(ctx, [campaign], input.period),
    leads,
  };
}

/** Kampaně podle rozsahu: účet, klient (kampaně jeho zakázek i účty klienta), zakázka, nebo všechny aktivní účty. */
export async function campaignsInScope(
  ctx: Ctx,
  scope: {
    accountId?: string | undefined;
    companyId?: string | undefined;
    jobId?: string | undefined;
  },
): Promise<CampaignBase[]> {
  const conds: (SQL | undefined)[] = [isNull(adCampaign.deletedAt)];
  if (scope.jobId) conds.push(eq(adCampaign.jobId, scope.jobId));
  else if (scope.accountId) conds.push(eq(adCampaign.accountId, scope.accountId));
  else if (scope.companyId) {
    const jobIds = await jobIdsOfCompany(ctx, scope.companyId);
    const own = and(eq(adAccount.ownerKind, "client"), eq(adAccount.companyId, scope.companyId));
    conds.push(jobIds.length ? or(inArray(adCampaign.jobId, jobIds), own) : own);
  } else conds.push(eq(adAccount.active, true));
  const rows = await ctx.db
    .select({ c: adCampaign })
    .from(adCampaign)
    .innerJoin(adAccount, eq(adAccount.id, adCampaign.accountId))
    .where(and(...conds))
    .orderBy(asc(adCampaign.name));
  return rows.map((r) => r.c);
}

/** Souhrn výkonu pro rozsah (metriky, widgety, záložky karet). */
export async function metricsFor(
  ctx: Ctx,
  input: {
    scope?: { accountId?: string; companyId?: string; jobId?: string } | undefined;
    period: Period;
  },
): Promise<AdsOverviewOutput> {
  const campaigns = await campaignsInScope(ctx, input.scope ?? {});
  const { rows, inputs } = await toCampaignRows(ctx, campaigns, input.period);
  const currencies = campaigns.length
    ? await ctx.db
        .select({ currency: adAccount.currency })
        .from(adAccount)
        .where(inArray(adAccount.id, [...new Set(campaigns.map((c) => c.accountId))]))
    : [];
  return {
    totals: totalsOf(inputs.values()),
    daily: await dailyFor(ctx, campaigns, input.period),
    campaigns: rows.sort((a, b) => b.metrics.spendMinor - a.metrics.spendMinor),
    currency: currencies.find((c) => c.currency)?.currency ?? "CZK",
  };
}

/** Totéž bez seznamu kampaní (příkaz `reklama.metrics`). */
export async function metricsOnly(
  ctx: Ctx,
  input: Parameters<typeof metricsFor>[1],
): Promise<MetricsOutput> {
  const { totals, daily, currency } = await metricsFor(ctx, input);
  return { totals, daily, currency };
}
