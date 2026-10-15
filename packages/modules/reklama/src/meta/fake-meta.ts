import {
  MetaApiError,
  type MetaAd,
  type MetaAdAccount,
  type MetaAdSet,
  type MetaAdsClient,
  type MetaCampaign,
  type MetaInsightLevel,
  type MetaInsightRow,
} from "./client";

/*
  `fake-meta`: Meta Ads v paměti pro testy (synchronizace, 7denní přepis, chyby). Nic nevolá po síti. Test si naplní
  účty, kampaně, sady, reklamy a denní statistiky, po „korekci od Meta“ je změní (`setInsight`) a zkouší, že se
  posledních 7 dní přepsalo a starší ne.
*/

/** Data účtu ve fake Meta. */
export type FakeAccountData = {
  account: MetaAdAccount;
  campaigns: MetaCampaign[];
  adSets: MetaAdSet[];
  ads: MetaAd[];
  insights: MetaInsightRow[];
};

/** Fake klient s ovládáním pro testy. */
export type FakeMetaClient = MetaAdsClient & {
  /** Data podle ID účtu; test je smí měnit. */
  accounts: Map<string, FakeAccountData>;
  /** Zaznamenaná volání (`metoda:účet[:úroveň]`). */
  calls: string[];
  /** Příští volání (zadané metody, nebo jakékoli) selže s touto chybou. */
  failNext(error?: MetaApiError, method?: keyof MetaAdsClient): void;
  /** Přidá nebo přepíše denní statistiku (klíč: úroveň, objekt, den). */
  setInsight(accountId: string, row: MetaInsightRow): void;
};

/** Vytvoří fake klienta z hotových dat účtů. */
export function createFakeMetaClient(initial: readonly FakeAccountData[] = []): FakeMetaClient {
  const accounts = new Map(initial.map((a) => [a.account.id, a] as const));
  const calls: string[] = [];
  let failure: { error: MetaApiError; method?: string } | null = null;

  const enter = (method: keyof MetaAdsClient, detail = "") => {
    calls.push(`${method}${detail}`);
    if (failure && (!failure.method || failure.method === method)) {
      const { error } = failure;
      failure = null;
      throw error;
    }
  };
  const data = (id: string): FakeAccountData => {
    const a = accounts.get(id);
    if (!a) throw new MetaApiError(`Účet ${id} neexistuje.`, { status: 400, code: 100 });
    return a;
  };

  return {
    accounts,
    calls,
    failNext(error = new MetaApiError("Meta je nedostupná.", { retryable: true }), method) {
      failure = { error, ...(method ? { method } : {}) };
    },
    setInsight(accountId, row) {
      const list = data(accountId).insights;
      const i = list.findIndex(
        (r) => r.level === row.level && r.objectId === row.objectId && r.date === row.date,
      );
      if (i >= 0) list[i] = row;
      else list.push(row);
    },
    async listAdAccounts() {
      enter("listAdAccounts");
      return [...accounts.values()].map((a) => ({ ...a.account }));
    },
    async listCampaigns(accountId) {
      enter("listCampaigns", `:${accountId}`);
      return data(accountId).campaigns.map((c) => ({ ...c }));
    },
    async listAdSets(accountId) {
      enter("listAdSets", `:${accountId}`);
      return data(accountId).adSets.map((c) => ({ ...c }));
    },
    async listAds(accountId) {
      enter("listAds", `:${accountId}`);
      return data(accountId).ads.map((c) => ({ ...c }));
    },
    async getInsights(accountId, { level, from, to }) {
      enter("getInsights", `:${accountId}:${level satisfies MetaInsightLevel}`);
      return data(accountId)
        .insights.filter((r) => r.level === level && r.date >= from && r.date <= to)
        .map((r) => ({ ...r }));
    },
  };
}
