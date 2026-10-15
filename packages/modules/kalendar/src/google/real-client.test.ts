import { describe, expect, it } from "vitest";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { randomBytes } from "node:crypto";
import { GoogleAuthError, GoogleGoneError } from "./client";
import { createGoogleClient } from "./real-client";
import { openState, openTokens, sealState, sealTokens } from "./accounts";

type Call = { url: URL; init: RequestInit };
const mockFetch = (responses: { status?: number; body?: unknown }[]) => {
  const calls: Call[] = [];
  const f = (async (url: URL | string, init: RequestInit) => {
    calls.push({ url: new URL(url.toString()), init });
    const r = responses.shift() ?? { status: 200, body: {} };
    return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), {
      status: r.status ?? 200,
    });
  }) as typeof fetch;
  return { f, calls };
};
const client = (responses: Parameters<typeof mockFetch>[0]) => {
  const m = mockFetch(responses);
  return {
    c: createGoogleClient({ clientId: "cid", clientSecret: "sec", fetch: m.f }),
    calls: m.calls,
  };
};

describe("skutečný klient Google API (transport podstrčený)", () => {
  it("adresa souhlasu žádá o offline přístup a jen o události a seznam kalendářů", () => {
    const { c } = client([]);
    const u = new URL(c.authUrl({ state: "s", redirectUri: "https://x/cb", loginHint: "a@b.cz" }));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    );
    expect(u.searchParams.get("client_secret")).toBeNull();
    expect(u.searchParams.get("state")).toBe("s");
  });
  it("výměna kódu posílá tajemství v těle, ne v adrese; invalid_grant je chyba přístupu", async () => {
    const ok = client([{ body: { access_token: "at", refresh_token: "rt", expires_in: 3600 } }]);
    const t = await ok.c.exchangeCode("kod", "https://x/cb");
    expect(t).toMatchObject({ accessToken: "at", refreshToken: "rt" });
    expect(ok.calls[0]!.url.search).toBe("");
    expect(String(ok.calls[0]!.init.body)).toContain("client_secret=sec");
    const bad = client([{ status: 400, body: { error: "invalid_grant" } }]);
    await expect(bad.c.refresh("rt")).rejects.toBeInstanceOf(GoogleAuthError);
  });
  it("přírůstková synchronizace posílá jen syncToken (bez okna), výskyty se rozbalují", async () => {
    const { c, calls } = client([{ body: { items: [], nextSyncToken: "n" } }]);
    await c.listEvents("tok", "a@b.cz", { syncToken: "st", timeMin: "2026-01-01T00:00:00Z" });
    const q = calls[0]!.url.searchParams;
    expect(q.get("syncToken")).toBe("st");
    expect(q.get("timeMin")).toBeNull();
    expect(q.get("singleEvents")).toBe("true");
    expect(calls[0]!.url.pathname).toBe("/calendar/v3/calendars/a%40b.cz/events");
  });
  it("410 je GoogleGoneError; smazání neexistující události je v pořádku", async () => {
    const gone = client([{ status: 410, body: { error: { message: "Gone" } } }]);
    await expect(gone.c.listEvents("t", "c", { syncToken: "x" })).rejects.toBeInstanceOf(
      GoogleGoneError,
    );
    const del = client([{ status: 404, body: { error: { message: "nf" } } }]);
    await expect(
      del.c.deleteEvent("t", "c", "e", { sendUpdates: "none" }),
    ).resolves.toBeUndefined();
  });
  it("zápis s Meet žádá o konferenci a bez pozvánek posílá sendUpdates=none", async () => {
    const { c, calls } = client([{ body: { id: "e1" } }]);
    await c.insertEvent(
      "t",
      "c",
      { summary: "x", start: { date: "2026-10-15" }, end: { date: "2026-10-16" }, id: "e1" },
      { sendUpdates: "none", conference: true },
    );
    expect(calls[0]!.url.searchParams.get("sendUpdates")).toBe("none");
    expect(calls[0]!.url.searchParams.get("conferenceDataVersion")).toBe("1");
    expect(
      JSON.parse(String(calls[0]!.init.body)).conferenceData.createRequest.conferenceSolutionKey
        .type,
    ).toBe("hangoutsMeet");
  });
});

describe("tokeny a stav OAuth", () => {
  const cipher = createCipher(
    parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
  );
  it("tokeny jsou v databázi šifrované a vrátí se beze změny", () => {
    const enc = sealTokens(cipher, {
      accessToken: "AT-tajny",
      refreshToken: "RT-tajny",
      expiresAt: 1,
    });
    expect(enc).not.toContain("tajny");
    expect(openTokens(cipher, enc)).toMatchObject({
      accessToken: "AT-tajny",
      refreshToken: "RT-tajny",
    });
    expect(openTokens(cipher, "v2.x.y.z.w")).toBeNull();
  });
  it("stav návratu patří uživateli a vyprší", () => {
    const s = sealState(cipher, "u1", "/nastaveni/google-kalendar");
    expect(openState(cipher, s, "u1").returnTo).toBe("/nastaveni/google-kalendar");
    expect(() => openState(cipher, s, "u2")).toThrow();
    expect(() => openState(cipher, s, "u1", Date.now() + 11 * 60_000)).toThrow();
    expect(() => openState(cipher, "podvrh", "u1")).toThrow();
  });
});
