import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@rebar/core/db";
import { indexRecord } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { captureError } from "@rebar/core/observability";
import { todayIso } from "@rebar/core/time";
import type { SyncSummary } from "../contract";
import { ad, adAccount, adCampaign, adInsightDaily, adSet } from "../schema";
import type { MetaAdsClient, MetaInsightLevel, MetaInsightRow } from "./client";
import { getMetaClient, markCredentialFailure } from "./connection";
import { rewriteWindow } from "./logic";

/*
  Synchronizace s Meta Ads (REK-06, REK-07): načte účty, kampaně, sady, reklamy a denní statistiky a uloží je do
  OPSYS. Statistiky se každý běh **přepisují za dnešek a posledních 7 dní** (Meta zpětně koriguje útratu a leady): řádky
  v okně se smažou a nahradí čerstvými, starší zůstanou. Chyba jednoho účtu nezastaví ostatní; zapíše se k účtu
  (`last_sync_error`) a do výsledku. Volá ji denní úloha (6:00) i ruční příkaz `reklama.sync`.
*/

/** Co synchronizace potřebuje od okolí (stačí `ModuleDeps` i `ModuleJobDeps`). */
export type SyncDeps = Pick<ModuleDeps, "registry" | "cipher">;

export type SyncOptions = {
  /** Jen tento účet (ID v OPSYS); jinak všechny aktivní. */
  accountId?: string | undefined;
  /** Klient Meta (testy); jinak se složí z uloženého přístupu. */
  client?: MetaAdsClient | undefined;
  /** Dnešní datum (testy); výchozí dnešek v Praze. */
  today?: string | undefined;
};

const errText = (err: unknown) => {
  const t = err instanceof Error ? err.message : String(err);
  return t.length > 500 ? `${t.slice(0, 500)}…` : t;
};

/** Spustí synchronizaci a vrátí souhrn. Nevyhazuje kvůli chybě jednoho účtu; chybějící přístup k Meta vyhodí. */
export async function syncMeta(db: Db, deps: SyncDeps, opts: SyncOptions = {}): Promise<SyncSummary> {
  const today = opts.today ?? todayIso();
  const window = rewriteWindow(today);
  const summary: SyncSummary = {
    accounts: 0,
    campaigns: 0,
    adSets: 0,
    ads: 0,
    insightRows: 0,
    rewrittenFrom: window.from,
    errors: [],
  };
  const client = opts.client ?? (await getMetaClient(db, deps));

  // 1) účty z Meta (jen když se nesynchronizuje jeden konkrétní)
  try {
    const remote = await client.listAdAccounts();
    for (const a of remote)
      await db
        .insert(adAccount)
        .values({
          metaId: a.id,
          name: a.name,
          currency: a.currency,
          timezone: a.timezone,
          active: a.active,
        })
        .onConflictDoUpdate({
          target: adAccount.metaId,
          // vlastníka a klienta účtu nastavuje uživatel, ten se nepřepisuje; ručně deaktivovaný účet zůstane vypnutý
          set: { name: a.name, currency: a.currency, timezone: a.timezone },
        });
  } catch (err) {
    await markCredentialFailure(db, deps, err);
    summary.errors.push({ accountId: null, message: errText(err) });
    if (opts.accountId === undefined) return summary;
  }

  // 2) každý aktivní účet zvlášť
  const accounts = await db
    .select()
    .from(adAccount)
    .where(
      and(
        isNull(adAccount.deletedAt),
        eq(adAccount.active, true),
        opts.accountId ? eq(adAccount.id, opts.accountId) : undefined,
      ),
    );
  for (const account of accounts) {
    try {
      const part = await syncAccount(db, deps, client, account, window);
      summary.accounts += 1;
      summary.campaigns += part.campaigns;
      summary.adSets += part.adSets;
      summary.ads += part.ads;
      summary.insightRows += part.insightRows;
    } catch (err) {
      captureError(err, { where: "reklama.sync", accountId: account.id });
      await markCredentialFailure(db, deps, err);
      const message = errText(err);
      summary.errors.push({ accountId: account.id, message });
      await db
        .update(adAccount)
        .set({ lastSyncError: message })
        .where(eq(adAccount.id, account.id))
        .catch(() => {});
    }
  }
  return summary;
}

type AccountRow = typeof adAccount.$inferSelect;

async function syncAccount(
  db: Db,
  deps: SyncDeps,
  client: MetaAdsClient,
  account: AccountRow,
  window: { from: string; to: string },
) {
  // vše z Meta se načte předem, do databáze se pak píše v jedné transakci (chyba Meta nezanechá půlku dat)
  const [campaigns, adSets, ads] = await Promise.all([
    client.listCampaigns(account.metaId),
    client.listAdSets(account.metaId),
    client.listAds(account.metaId),
  ]);
  const levels: MetaInsightLevel[] = ["campaign", "adset", "ad"];
  const insights: MetaInsightRow[] = [];
  for (const level of levels)
    insights.push(...(await client.getInsights(account.metaId, { level, ...window })));

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('reklama.sync'))`);

    const campaignIds = new Map<string, string>();
    for (const c of campaigns) {
      const [row] = await tx
        .insert(adCampaign)
        .values({
          accountId: account.id,
          metaId: c.id,
          name: c.name,
          objective: c.objective,
          status: c.status,
        })
        .onConflictDoUpdate({
          target: adCampaign.metaId,
          // `job_id` (přiřazení k zakázce) se synchronizací nemění
          set: { accountId: account.id, name: c.name, objective: c.objective, status: c.status },
        })
        .returning();
      campaignIds.set(c.id, row!.id);
      const def = deps.registry.get("ad_campaign");
      if (def) await indexRecord(tx, { def } as never, row as unknown as Record<string, unknown>);
    }
    const adSetIds = new Map<string, string>();
    for (const s of adSets) {
      const campaignId = campaignIds.get(s.campaignId);
      if (!campaignId) continue;
      const [row] = await tx
        .insert(adSet)
        .values({ campaignId, metaId: s.id, name: s.name, status: s.status })
        .onConflictDoUpdate({
          target: adSet.metaId,
          set: { campaignId, name: s.name, status: s.status },
        })
        .returning({ id: adSet.id });
      adSetIds.set(s.id, row!.id);
    }
    const adIds = new Map<string, string>();
    for (const a of ads) {
      const adSetId = adSetIds.get(a.adSetId);
      if (!adSetId) continue;
      const [row] = await tx
        .insert(ad)
        .values({
          adSetId,
          metaId: a.id,
          name: a.name,
          status: a.status,
          creativeUrl: a.creativeUrl,
        })
        .onConflictDoUpdate({
          target: ad.metaId,
          set: { adSetId, name: a.name, status: a.status, creativeUrl: a.creativeUrl },
        })
        .returning({ id: ad.id });
      adIds.set(a.id, row!.id);
    }

    // přepis okna: smazat řádky účtu v okně a vložit čerstvé
    const idMaps: Record<MetaInsightLevel, Map<string, string>> = {
      campaign: campaignIds,
      adset: adSetIds,
      ad: adIds,
    };
    let insightRows = 0;
    for (const level of levels) {
      const objectIds = await ownObjectIds(tx, account.id, level);
      if (objectIds.length)
        await tx
          .delete(adInsightDaily)
          .where(
            and(
              eq(adInsightDaily.level, level),
              inArray(adInsightDaily.objectId, objectIds),
              sql`${adInsightDaily.date} >= ${window.from}`,
              sql`${adInsightDaily.date} <= ${window.to}`,
            ),
          );
      const fresh = insights
        .filter((r) => r.level === level)
        .flatMap((r) => {
          const objectId = idMaps[level].get(r.objectId);
          return objectId
            ? [
                {
                  level,
                  objectId,
                  date: r.date,
                  spendMinor: r.spendMinor,
                  impressions: r.impressions,
                  clicks: r.clicks,
                  leads: r.leads,
                },
              ]
            : [];
        });
      for (let i = 0; i < fresh.length; i += 500) {
        const chunk = fresh.slice(i, i + 500);
        await tx
          .insert(adInsightDaily)
          .values(chunk)
          .onConflictDoUpdate({
            target: [adInsightDaily.level, adInsightDaily.objectId, adInsightDaily.date],
            set: {
              spendMinor: sql`excluded.spend_minor`,
              impressions: sql`excluded.impressions`,
              clicks: sql`excluded.clicks`,
              leads: sql`excluded.leads`,
            },
          });
      }
      insightRows += fresh.length;
    }
    await tx
      .update(adAccount)
      .set({ lastSyncAt: new Date(), lastSyncError: null })
      .where(eq(adAccount.id, account.id));
    return {
      campaigns: campaignIds.size,
      adSets: adSetIds.size,
      ads: adIds.size,
      insightRows,
    };
  });
}

/** ID objektů účtu v databázi na dané úrovni (kampaně, sady, reklamy), i dřívější, které už Meta nevrací. */
async function ownObjectIds(
  db: Pick<Db, "select">,
  accountId: string,
  level: MetaInsightLevel,
): Promise<string[]> {
  if (level === "campaign") {
    const rows = await db
      .select({ id: adCampaign.id })
      .from(adCampaign)
      .where(eq(adCampaign.accountId, accountId));
    return rows.map((r) => r.id);
  }
  if (level === "adset") {
    const rows = await db
      .select({ id: adSet.id })
      .from(adSet)
      .innerJoin(adCampaign, eq(adCampaign.id, adSet.campaignId))
      .where(eq(adCampaign.accountId, accountId));
    return rows.map((r) => r.id);
  }
  const rows = await db
    .select({ id: ad.id })
    .from(ad)
    .innerJoin(adSet, eq(adSet.id, ad.adSetId))
    .innerJoin(adCampaign, eq(adCampaign.id, adSet.campaignId))
    .where(eq(adCampaign.accountId, accountId));
  return rows.map((r) => r.id);
}
