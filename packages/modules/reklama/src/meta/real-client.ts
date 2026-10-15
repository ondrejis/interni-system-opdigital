import {
  MetaApiError,
  type MetaAd,
  type MetaAdAccount,
  type MetaAdSet,
  type MetaAdsClient,
  type MetaCampaign,
  type MetaInsightRow,
} from "./client";
import { leadsFromActions, toCount, toMinor } from "./logic";

/*
  Skutečný klient Meta Marketing API (Graph API) přes `fetch`: jen čtení, token v hlavičce `Authorization` (nikdy
  v adrese, aby neskončil v logu), časový limit každého volání, opakování dočasných chyb (HTTP 429 a 5xx, limity Meta,
  síť) s exponenciální prodlevou a stránkování. Neplatný token (kód 190) skončí `MetaApiError` s `auth` — volající
  označí přístup jako „vyžaduje přihlášení“. Klíče nikde v repu nejsou: token se čte z `integration_credential`.
*/

const DEFAULT_VERSION = "v21.0";
const BASE = "https://graph.facebook.com";
/** Kódy Meta, které znamenají „zkus za chvíli“ (limity volání, dočasná chyba). */
const RETRY_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);
/** Nejvíc stránek jednoho výpisu (pojistka proti nekonečnému stránkování). */
const MAX_PAGES = 100;

/** Nastavení klienta; `fetchImpl` a `sleep` se mění jen v testech. */
export type RealMetaClientOptions = {
  accessToken: string;
  version?: string;
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

type Page<T> = { data?: T[]; paging?: { next?: string } };
type GraphError = { error?: { message?: string; code?: number; type?: string } };

/** Vytvoří klienta Graph API pro přístupový token. */
export function createRealMetaClient(opts: RealMetaClientOptions): MetaAdsClient {
  const version = opts.version ?? DEFAULT_VERSION;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const retries = opts.retries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function request<T>(url: string): Promise<T> {
    let last: MetaApiError | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(baseDelay * 2 ** (attempt - 1));
      try {
        const res = await doFetch(url, {
          headers: { Authorization: `Bearer ${opts.accessToken}`, Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = (await res.json().catch(() => ({}))) as T & GraphError;
        if (res.ok && !body.error) return body;
        const code = body.error?.code;
        const auth = code === 190 || res.status === 401;
        const retryable =
          !auth &&
          (res.status === 429 ||
            res.status >= 500 ||
            (code !== undefined && RETRY_CODES.has(code)));
        last = new MetaApiError(
          auth
            ? "Přístup k Meta vypršel nebo byl odvolán, přihlaste se znovu."
            : `Meta API: ${body.error?.message ?? `HTTP ${res.status}`}`,
          { status: res.status, ...(code !== undefined ? { code } : {}), retryable, auth },
        );
        if (!retryable) throw last;
      } catch (err) {
        if (err instanceof MetaApiError) {
          if (!err.retryable) throw err;
          last = err;
          continue;
        }
        // síť nebo časový limit
        last = new MetaApiError(
          err instanceof Error && err.name === "TimeoutError"
            ? "Meta API neodpovědělo včas."
            : "Meta API není dostupné.",
          { retryable: true },
        );
      }
    }
    throw last ?? new MetaApiError("Meta API selhalo.");
  }

  async function list<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const qs = new URLSearchParams(params).toString();
    let url: string | undefined = `${BASE}/${version}/${path}?${qs}`;
    const out: T[] = [];
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const body: Page<T> = await request<Page<T>>(url);
      out.push(...(body.data ?? []));
      // další stránku smíme stáhnout jen z Graph API (jinak by odpověď mohla odnést přístupový token na cizí adresu)
      const next = body.paging?.next;
      url = next?.startsWith(`${BASE}/`) ? next : undefined;
    }
    return out;
  }

  return {
    async listAdAccounts(): Promise<MetaAdAccount[]> {
      const rows = await list<{
        id: string;
        name?: string;
        currency?: string;
        timezone_name?: string;
        account_status?: number;
      }>("me/adaccounts", {
        fields: "id,name,currency,timezone_name,account_status",
        limit: "100",
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name ?? r.id,
        currency: r.currency ?? null,
        timezone: r.timezone_name ?? null,
        // 1 = aktivní, 2 = zakázaný, 3 = nezaplacený, 101 = uzavřený
        active: r.account_status === undefined || r.account_status === 1,
      }));
    },
    async listCampaigns(accountId): Promise<MetaCampaign[]> {
      const rows = await list<{ id: string; name?: string; objective?: string; status?: string }>(
        `${accountId}/campaigns`,
        { fields: "id,name,objective,status", limit: "200" },
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name ?? r.id,
        objective: r.objective ?? null,
        status: r.status ?? null,
      }));
    },
    async listAdSets(accountId): Promise<MetaAdSet[]> {
      const rows = await list<{ id: string; campaign_id: string; name?: string; status?: string }>(
        `${accountId}/adsets`,
        { fields: "id,campaign_id,name,status", limit: "200" },
      );
      return rows.map((r) => ({
        id: r.id,
        campaignId: r.campaign_id,
        name: r.name ?? r.id,
        status: r.status ?? null,
      }));
    },
    async listAds(accountId): Promise<MetaAd[]> {
      const rows = await list<{
        id: string;
        adset_id: string;
        name?: string;
        status?: string;
        creative?: { thumbnail_url?: string; image_url?: string };
      }>(`${accountId}/ads`, {
        fields: "id,adset_id,name,status,creative{thumbnail_url,image_url}",
        limit: "200",
      });
      return rows.map((r) => ({
        id: r.id,
        adSetId: r.adset_id,
        name: r.name ?? r.id,
        status: r.status ?? null,
        creativeUrl: r.creative?.image_url ?? r.creative?.thumbnail_url ?? null,
      }));
    },
    async getInsights(accountId, { level, from, to }): Promise<MetaInsightRow[]> {
      const rows = await list<{
        campaign_id?: string;
        adset_id?: string;
        ad_id?: string;
        date_start: string;
        spend?: string;
        impressions?: string;
        clicks?: string;
        actions?: { action_type: string; value: string }[];
      }>(`${accountId}/insights`, {
        level,
        time_increment: "1",
        time_range: JSON.stringify({ since: from, until: to }),
        fields: "campaign_id,adset_id,ad_id,spend,impressions,clicks,actions",
        limit: "500",
      });
      const idOf = (r: (typeof rows)[number]) =>
        level === "campaign" ? r.campaign_id : level === "adset" ? r.adset_id : r.ad_id;
      return rows.flatMap((r) => {
        const objectId = idOf(r);
        if (!objectId) return [];
        return [
          {
            level,
            objectId,
            date: r.date_start,
            spendMinor: toMinor(r.spend),
            impressions: toCount(r.impressions),
            clicks: toCount(r.clicks),
            leads: leadsFromActions(r.actions),
          },
        ];
      });
    },
  };
}
