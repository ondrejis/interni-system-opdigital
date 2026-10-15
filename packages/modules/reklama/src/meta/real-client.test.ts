import { describe, expect, it, vi } from "vitest";
import { MetaApiError } from "./client";
import { createRealMetaClient } from "./real-client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const make = (responses: (Response | Error)[]) => {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      auth: new Headers(init?.headers).get("authorization"),
    });
    const r = responses.shift();
    if (!r) throw new Error("nečekané volání");
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  const client = createRealMetaClient({
    accessToken: "tajny-token",
    fetchImpl,
    sleep: async () => {},
    retries: 2,
  });
  return { client, calls };
};

describe("real Meta client", () => {
  it("token posílá v hlavičce, ne v adrese; stránkuje a mapuje účty", async () => {
    const { client, calls } = make([
      json({
        data: [
          {
            id: "act_1",
            name: "Účet",
            currency: "CZK",
            timezone_name: "Europe/Prague",
            account_status: 1,
          },
        ],
        paging: { next: "https://graph.facebook.com/v21.0/me/adaccounts?after=x" },
      }),
      json({ data: [{ id: "act_2", account_status: 2 }] }),
    ]);
    const accounts = await client.listAdAccounts();
    expect(accounts).toEqual([
      { id: "act_1", name: "Účet", currency: "CZK", timezone: "Europe/Prague", active: true },
      { id: "act_2", name: "act_2", currency: null, timezone: null, active: false },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.auth === "Bearer tajny-token")).toBe(true);
    expect(calls.some((c) => c.url.includes("tajny-token"))).toBe(false);
  });

  it("dočasné chyby (429, 5xx, síť, limit Meta) opakuje a pak uspěje", async () => {
    const { client, calls } = make([
      json({ error: { message: "limit", code: 17 } }, 400),
      new Error("ECONNRESET"),
      json({ data: [{ id: "1", name: "K", objective: "LEADS", status: "ACTIVE" }] }),
    ]);
    expect(await client.listCampaigns("act_1")).toEqual([
      { id: "1", name: "K", objective: "LEADS", status: "ACTIVE" },
    ]);
    expect(calls).toHaveLength(3);
  });

  it("po vyčerpání pokusů vyhodí dočasnou chybu", async () => {
    const { client, calls } = make([json({}, 503), json({}, 503), json({}, 503)]);
    await expect(client.listAds("act_1")).rejects.toMatchObject({
      name: "MetaApiError",
      retryable: true,
    });
    expect(calls).toHaveLength(3);
  });

  it("neplatný token (kód 190) se neopakuje a je označen jako `auth`", async () => {
    const { client, calls } = make([json({ error: { message: "expired", code: 190 } }, 400)]);
    const err = await client.listAdSets("act_1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect((err as MetaApiError).auth).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("insights: útrata na haléře, leady z actions, ID podle úrovně", async () => {
    const { client } = make([
      json({
        data: [
          {
            campaign_id: "c1",
            adset_id: "s1",
            date_start: "2026-10-14",
            spend: "123.45",
            impressions: "1000",
            clicks: "30",
            actions: [{ action_type: "lead", value: "4" }],
          },
          { date_start: "2026-10-14", spend: "1" },
        ],
      }),
    ]);
    const rows = await client.getInsights("act_1", {
      level: "adset",
      from: "2026-10-14",
      to: "2026-10-14",
    });
    expect(rows).toEqual([
      {
        level: "adset",
        objectId: "s1",
        date: "2026-10-14",
        spendMinor: 12_345,
        impressions: 1000,
        clicks: 30,
        leads: 4,
      },
    ]);
  });
});
