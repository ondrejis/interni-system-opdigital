import { describe, expect, it, vi } from "vitest";
import { FakturoidError } from "./client";
import { createHttpFakturoidClient } from "./http-client";

const CONFIG = { account: "acme", clientId: "id", clientSecret: "s3cret", contactEmail: "a@b.cz" };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const token = () => json({ access_token: "tok", token_type: "Bearer", expires_in: 7200 });

type Call = { url: string; init: RequestInit };
function setup(
  handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>,
) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {}, calls.length);
  }) as unknown as typeof fetch;
  const sleeps: number[] = [];
  const client = createHttpFakturoidClient(CONFIG, {
    fetch: fetchImpl,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { client, calls, sleeps };
}

describe("HTTP klient Fakturoidu", () => {
  it("získá token (Basic, User-Agent) a použije ho jako Bearer; token se znovu nežádá", async () => {
    const { client, calls } = setup((url) =>
      url.endsWith("/oauth/token") ? token() : json({ subdomain: "acme", name: "Acme s.r.o." }),
    );
    await client.testConnection();
    await client.testConnection();
    expect(calls.filter((c) => c.url.endsWith("/oauth/token"))).toHaveLength(1);
    const t = calls[0]!;
    expect((t.init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect((t.init.headers as Record<string, string>)["User-Agent"]).toBe("OPSYS (a@b.cz)");
    expect(JSON.parse(String(t.init.body))).toEqual({ grant_type: "client_credentials" });
    const api = calls[1]!;
    expect(api.url).toBe("https://app.fakturoid.cz/api/v3/accounts/acme/account.json");
    expect((api.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("odmítnuté přihlášení je chyba `auth` bez tajných hodnot ve zprávě", async () => {
    const { client } = setup(() => json({ error: "invalid_client" }, 401));
    const e = await client.testConnection().catch((x) => x);
    expect(e).toBeInstanceOf(FakturoidError);
    expect(e.code).toBe("auth");
    expect(e.message).not.toContain("s3cret");
  });

  it("vytvoří fakturu: koruny, řádky, custom_id; 422 se přeloží s názvy polí", async () => {
    const { client, calls } = setup((url, init) => {
      if (url.endsWith("/oauth/token")) return token();
      const body = JSON.parse(String(init.body));
      if (body.lines[0].unit_price < 0) return json({ errors: { lines: ["je neplatné"] } }, 422);
      return json(
        {
          id: 77,
          number: "2027-0001",
          html_url: "https://app.fakturoid.cz/acme/invoices/77",
          issued_on: "2027-03-01",
          due_on: "2027-03-15",
          total: 1500,
        },
        201,
      );
    });
    const inv = await client.createInvoice({
      subjectId: "5",
      customId: "opsys-ri-1",
      lines: [{ name: "Hosting", quantity: 1, unitPrice: 1500, vatRate: 0 }],
      issuedOn: "2027-03-01",
      currency: "CZK",
    });
    expect(inv).toMatchObject({ id: "77", number: "2027-0001", dueOn: "2027-03-15", total: 1500 });
    const sent = JSON.parse(String(calls[1]!.init.body));
    expect(sent).toMatchObject({ subject_id: 5, custom_id: "opsys-ri-1", currency: "CZK" });
    const err = await client
      .createInvoice({
        subjectId: "5",
        customId: "x",
        lines: [{ name: "a", quantity: 1, unitPrice: -1, vatRate: 0 }],
        issuedOn: "2027-03-01",
        currency: "CZK",
      })
      .catch((x) => x);
    expect(err.code).toBe("validation");
    expect(err.message).toContain("lines: je neplatné");
  });

  it("GET se opakuje při 503 a 429 (s prodlevou), POST jen při 429/503, ne při 500", async () => {
    let n = 0;
    const get = setup((url) => {
      if (url.endsWith("/oauth/token")) return token();
      return ++n < 3
        ? json({}, n === 1 ? 503 : 429, n === 2 ? { "retry-after": "2" } : {})
        : json([]);
    });
    expect(await get.client.findInvoiceByCustomId("x")).toBeNull();
    expect(get.sleeps).toEqual([500, 2000]);

    let posts = 0;
    const post = setup((url) => {
      if (url.endsWith("/oauth/token")) return token();
      posts++;
      return json({}, 500);
    });
    const e = await post.client.createSubject({ name: "A", customId: "c" }).catch((x) => x);
    expect(e.code).toBe("unavailable");
    expect(posts).toBe(1);
  });

  it("vyčerpá opakování a vyhodí `rate_limit`", async () => {
    const { client } = setup((url) => (url.endsWith("/oauth/token") ? token() : json({}, 429)));
    const e = await client.testConnection().catch((x) => x);
    expect(e.code).toBe("rate_limit");
  });

  it("časový limit a výpadek sítě mapuje na `timeout` a `network`", async () => {
    const timeout = createHttpFakturoidClient(CONFIG, {
      fetch: (async () => {
        throw Object.assign(new Error("x"), { name: "TimeoutError" });
      }) as typeof fetch,
      sleep: async () => {},
    });
    expect((await timeout.testConnection().catch((x) => x)).code).toBe("timeout");
    const net = createHttpFakturoidClient(CONFIG, {
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
      sleep: async () => {},
      maxRetries: 0,
    });
    expect((await net.testConnection().catch((x) => x)).code).toBe("network");
  });

  it("odběratele najde podle IČO jen při přesné shodě a podle custom_id", async () => {
    const { client, calls } = setup((url) => {
      if (url.endsWith("/oauth/token")) return token();
      if (url.includes("subjects/search.json"))
        return json([
          { id: 1, name: "Jiný", registration_no: "12345679" },
          { id: 2, name: "Acme", registration_no: "12345678" },
        ]);
      return json([{ id: 9, name: "Acme", registration_no: "12345678" }]);
    });
    expect((await client.findSubjectByRegistrationNo("12345678"))?.id).toBe("2");
    expect(await client.findSubjectByRegistrationNo("00000000")).toBeNull();
    expect((await client.findSubjectByCustomId("opsys-co-1"))?.id).toBe("9");
    expect(calls.some((c) => c.url.includes("custom_id=opsys-co-1"))).toBe(true);
  });

  it("401 u API volání obnoví token jednou", async () => {
    let apiCalls = 0;
    const { client, calls } = setup((url) => {
      if (url.endsWith("/oauth/token")) return token();
      return ++apiCalls === 1 ? json({}, 401) : json({ subdomain: "acme", name: "A" });
    });
    await client.testConnection();
    expect(calls.filter((c) => c.url.endsWith("/oauth/token"))).toHaveLength(2);
  });
});
