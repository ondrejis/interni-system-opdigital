import { describe, expect, it } from "vitest";
import {
  FetchBlockedError,
  fetchCalendarText,
  isPrivateIp,
  parsePublicUrl,
  safeLookup,
  type Transport,
} from "./safe-fetch";

describe("isPrivateIp", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::1",
    "2001:db8::1",
    "not-an-ip",
  ])("%s je zakázaná", (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.32.0.1",
    "172.15.255.255",
    "100.63.0.1",
    "93.184.216.34",
    "2606:4700:4700::1111",
    "2a00:1450:4001:81b::200e",
    "::ffff:8.8.8.8",
  ])("%s je veřejná", (ip) => expect(isPrivateIp(ip)).toBe(false));
});

describe("parsePublicUrl", () => {
  it("přijme https a webcal, odmítne zbytek", () => {
    expect(parsePublicUrl("webcal://calendar.google.com/x.ics").protocol).toBe("https:");
    expect(parsePublicUrl(" https://example.com/a.ics ").hostname).toBe("example.com");
    for (const bad of [
      "http://example.com/a.ics",
      "file:///etc/passwd",
      "ftp://example.com/a.ics",
      "https://localhost/a.ics",
      "https://foo.localhost/a.ics",
      "https://nas.local/a.ics",
      "https://db.internal/a.ics",
      "https://intranet/a.ics",
      "https://127.0.0.1/a.ics",
      "https://[::1]/a.ics",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.5/a.ics",
      "https://[::ffff:127.0.0.1]/a.ics",
      "https://example.com:8443/a.ics",
      "https://user:pass@example.com/a.ics",
      "není adresa",
    ])
      expect(() => parsePublicUrl(bad), bad).toThrow(FetchBlockedError);
  });
});

describe("safeLookup", () => {
  it("odmítne jméno, které vede na loopback", async () => {
    const err = await new Promise<Error | null>((resolve) =>
      safeLookup("localhost", {}, (e) => resolve(e)),
    );
    expect(err).toBeInstanceOf(FetchBlockedError);
  });
});

describe("fetchCalendarText", () => {
  const ICS = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";
  const respond =
    (...steps: ({ status: number; location?: string; body?: string } | Error)[]): Transport =>
    async () => {
      const s = steps.shift();
      if (!s) throw new Error("nečekaný požadavek");
      if (s instanceof Error) throw s;
      return s;
    };

  it("vrátí text kalendáře", async () => {
    expect(
      await fetchCalendarText("https://example.com/a.ics", {
        transport: respond({ status: 200, body: ICS }),
      }),
    ).toBe(ICS);
  });

  it("následuje přesměrování a každé znovu ověří", async () => {
    const seen: string[] = [];
    const steps = [
      { status: 302, location: "/b.ics" },
      { status: 200, body: ICS },
    ];
    const transport: Transport = async (url) => {
      seen.push(url.toString());
      return steps.shift()!;
    };
    await fetchCalendarText("https://example.com/a.ics", { transport });
    expect(seen).toEqual(["https://example.com/a.ics", "https://example.com/b.ics"]);

    await expect(
      fetchCalendarText("https://example.com/a.ics", {
        transport: respond({ status: 302, location: "http://169.254.169.254/latest" }),
      }),
    ).rejects.toThrow(/https/);
    await expect(
      fetchCalendarText("https://example.com/a.ics", {
        transport: respond({ status: 301, location: "https://127.0.0.1/x.ics" }),
      }),
    ).rejects.toThrow(/není povolená/);
  });

  it("omezí počet přesměrování, chybové stavy, velikost a obsah", async () => {
    const loop: Transport = async () => ({
      status: 302,
      location: "https://example.com/again.ics",
    });
    await expect(
      fetchCalendarText("https://example.com/a.ics", { transport: loop }),
    ).rejects.toThrow(/přesměrování/);
    await expect(
      fetchCalendarText("https://example.com/a.ics", { transport: respond({ status: 404 }) }),
    ).rejects.toThrow(/chybou 404/);
    await expect(
      fetchCalendarText("https://example.com/a.ics", {
        maxBytes: 10,
        transport: respond({ status: 200, body: ICS }),
      }),
    ).rejects.toThrow(/příliš velký/);
    await expect(
      fetchCalendarText("https://example.com/a.ics", {
        transport: respond({ status: 200, body: "<html>ne</html>" }),
      }),
    ).rejects.toThrow(/iCal/);
  });

  it("interní chyby spojení se uživateli neprozradí", async () => {
    await expect(
      fetchCalendarText("https://example.com/a.ics", {
        transport: respond(new Error("connect ECONNREFUSED 10.0.0.1:443")),
      }),
    ).rejects.toThrow("Kalendář se nepodařilo stáhnout.");
  });
});
