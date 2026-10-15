import { describe, expect, it } from "vitest";
import { CLIENT_OVERVIEW_ORDER, CLIENT_TABS, type ClientTabId } from "@rebar/core/contracts";
import {
  addressLine,
  groupClients,
  hiddenTabs,
  mapsHref,
  newDealHref,
  OWN_OVERVIEW_ORDER,
  OWN_TAB_ORDER,
  planStatusChange,
  telHref,
  webHref,
} from "./shared";

const TODAY = "2026-10-15";
const none = { status: null, since: null, until: null } as const;

describe("planStatusChange", () => {
  it("první přechod na Aktivní uloží „klient od“", () => {
    const p = planStatusChange(
      { ...none, status: "lead" },
      "active",
      { source: "deal_won" },
      TODAY,
    );
    expect(p).toMatchObject({
      changed: true,
      since: TODAY,
      patch: { clientStatus: "active", clientSince: TODAY },
    });
  });
  it("další přechod na Aktivní „klient od“ nemění (R-17)", () => {
    const p = planStatusChange(
      { status: "paused", since: "2025-01-02", until: null },
      "active",
      { source: "manual" },
      TODAY,
    );
    expect(p).toMatchObject({ changed: true, since: "2025-01-02" });
    expect((p as { patch: object }).patch).not.toHaveProperty("clientSince");
  });
  it("bez změny stavu není co dělat", () => {
    const p = planStatusChange(
      { status: "active", since: "2025-01-02", until: null },
      "active",
      { source: "manual" },
      TODAY,
    );
    expect(p).toMatchObject({ changed: false, since: "2025-01-02" });
  });
  it("Bývalý ručně vyžaduje důvod, datum je výchozí dnes", () => {
    expect(
      planStatusChange({ ...none, status: "active" }, "former", { source: "manual" }, TODAY),
    ).toEqual({
      error: "Napište, proč spolupráce skončila.",
    });
    const p = planStatusChange(
      { ...none, status: "active" },
      "former",
      { source: "manual", reason: " Přešli ke konkurenci " },
      TODAY,
    );
    expect(p).toMatchObject({
      patch: {
        clientStatus: "former",
        clientUntil: TODAY,
        clientEndReason: "Přešli ke konkurenci",
      },
    });
  });
  it("Bývalý po ukončení zakázky nemusí mít důvod, ale má výchozí text a zadané datum", () => {
    const p = planStatusChange(
      { ...none, status: "active" },
      "former",
      { source: "job_ended", endedOn: "2026-10-01" },
      TODAY,
    );
    expect(p).toMatchObject({
      patch: { clientUntil: "2026-10-01", clientEndReason: expect.stringContaining("zakázka") },
    });
  });
  it("návrat z Bývalého smaže datum ukončení a „klient od“ se nemění", () => {
    const p = planStatusChange(
      { status: "former", since: "2024-05-05", until: "2026-01-01" },
      "active",
      { source: "deal_won" },
      TODAY,
    );
    expect(p).toMatchObject({
      changed: true,
      since: "2024-05-05",
      patch: { clientStatus: "active", clientUntil: null },
    });
  });
  it("Bývalý, který se nikdy nestal Aktivním, dostane „klient od“ až při Aktivní", () => {
    const p = planStatusChange(
      { status: "former", since: null, until: "2026-01-01" },
      "active",
      { source: "deal_won" },
      TODAY,
    );
    expect(p).toMatchObject({ since: TODAY, patch: { clientSince: TODAY } });
  });
});

describe("hiddenTabs", () => {
  const all = Object.keys(CLIENT_TABS) as ClientTabId[];
  it("skryje záložky s výslovnou nulou a nikdy Přehled, Kontext a Historii", () => {
    const h = hiddenTabs({ kontakty: 0, finance: 3, ukoly: 0, zakazky: 2, obchody: 1 }, all);
    expect(h).toEqual(expect.arrayContaining(["kontakty", "ukoly"]));
    expect(h).not.toEqual(
      expect.arrayContaining(["finance", "zakazky", "obchody", "prehled", "kontext", "historie"]),
    );
  });
  it("záložky, které kreslí klienti sami, se bez počtu skryjí; cizí bez počtu zůstanou", () => {
    const h = hiddenTabs({}, all);
    expect(h).toEqual(expect.arrayContaining(["zakazky", "obchody"]));
    expect(h).not.toContain("hosting");
    expect(h).not.toContain("reklama");
  });
});

describe("groupClients", () => {
  const rows = [
    { id: "1", status: "active" as const, services: ["web" as const, "marketing" as const] },
    { id: "2", status: "lead" as const, services: [] },
    { id: "3", status: "active" as const, services: ["marketing" as const] },
  ];
  it("podle stavu v pevném pořadí, prázdné vynechá", () => {
    expect(groupClients(rows, "status").map((g) => [g.key, g.rows.length])).toEqual([
      ["lead", 1],
      ["active", 2],
    ]);
  });
  it("podle služby: klient je v každé své službě, bez služby zvlášť", () => {
    expect(groupClients(rows, "service").map((g) => [g.key, g.rows.map((r) => r.id)])).toEqual([
      ["web", ["1"]],
      ["marketing", ["1", "3"]],
      ["none", ["2"]],
    ]);
  });
  it("bez seskupení jedna skupina", () => {
    expect(groupClients(rows, "none")).toHaveLength(1);
  });
});

describe("odkazy akcí", () => {
  it("telefon a web", () => {
    expect(telHref("+420 777 123 456")).toBe("tel:+420777123456");
    expect(telHref("12")).toBeNull();
    expect(webHref("firma.cz")).toBe("https://firma.cz");
    expect(webHref("http://a.cz")).toBe("http://a.cz");
    expect(webHref("")).toBeNull();
  });
  it("adresa do map", () => {
    const a = addressLine({ street: "Hlavní 1", city: "Plzeň", zip: "30100", country: "CZ" });
    expect(a).toBe("Hlavní 1, 30100 Plzeň, Česko");
    expect(mapsHref(a!)).toContain(encodeURIComponent("Hlavní 1"));
    expect(addressLine({ country: "CZ" })).toBeNull();
  });
  it("nový obchod míří na stránku obchodů s klientem", () => {
    expect(newDealHref("abc")).toBe("/obchody?novy=1&klient=abc");
  });
});

describe("konstanty karty", () => {
  it("pořadí záložek a karet je shodné s konstantami jádra (D §2.5)", () => {
    for (const [k, v] of Object.entries(OWN_TAB_ORDER))
      expect(CLIENT_TABS[k as ClientTabId]).toBe(v);
    for (const [k, v] of Object.entries(OWN_OVERVIEW_ORDER))
      expect(CLIENT_OVERVIEW_ORDER[k as keyof typeof CLIENT_OVERVIEW_ORDER]).toBe(v);
  });
});
