/*
  Rozhraní adaptéru Meta Ads (`MetaAdsClient`), tvary dat Marketing API a chyby. Skutečný klient (`real-client.ts`,
  `fetch` ke Graph API) a `fake-meta.ts` (paměť, pro testy) ho implementují stejně. Zbytek modulu zná jen toto
  rozhraní, takže se synchronizace dá ověřit celá bez Mety. Klient jen čte (reklamy se v OPSYS nespravují).
*/

/** Reklamní účet tak, jak ho vrací `me/adaccounts`; `id` je ve tvaru `act_123…`. */
export type MetaAdAccount = {
  id: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  /** `false` u zakázaných nebo uzavřených účtů. */
  active: boolean;
};
/** Kampaň účtu. */
export type MetaCampaign = {
  id: string;
  name: string;
  objective: string | null;
  status: string | null;
};
/** Sada reklam; `campaignId` je Meta ID kampaně. */
export type MetaAdSet = { id: string; campaignId: string; name: string; status: string | null };
/** Reklama; `adSetId` je Meta ID sady, `creativeUrl` náhled kreativy. */
export type MetaAd = {
  id: string;
  adSetId: string;
  name: string;
  status: string | null;
  creativeUrl: string | null;
};

/** Úroveň statistik. */
export type MetaInsightLevel = "campaign" | "adset" | "ad";
/** Denní statistika objektu (`objectId` je Meta ID kampaně, sady nebo reklamy); útrata v haléřích měny účtu. */
export type MetaInsightRow = {
  level: MetaInsightLevel;
  objectId: string;
  date: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  leads: number;
};

/** Čtecí rozhraní Meta Marketing API pro jeden přístupový token. */
export interface MetaAdsClient {
  /** Účty dostupné tokenu. */
  listAdAccounts(): Promise<MetaAdAccount[]>;
  listCampaigns(accountId: string): Promise<MetaCampaign[]>;
  listAdSets(accountId: string): Promise<MetaAdSet[]>;
  listAds(accountId: string): Promise<MetaAd[]>;
  /** Denní statistiky (`time_increment=1`) účtu na dané úrovni za období včetně obou konců. */
  getInsights(
    accountId: string,
    input: { level: MetaInsightLevel; from: string; to: string },
  ): Promise<MetaInsightRow[]>;
}

/** Chyba volání Meta API. `retryable` = dočasná (limit, výpadek), `auth` = token je neplatný nebo vypršel. */
export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly options: { status?: number; code?: number; retryable?: boolean; auth?: boolean } = {},
  ) {
    super(message);
    this.name = "MetaApiError";
  }
  get auth(): boolean {
    return this.options.auth === true;
  }
  get retryable(): boolean {
    return this.options.retryable === true;
  }
}
