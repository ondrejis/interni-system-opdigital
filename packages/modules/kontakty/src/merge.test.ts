import { describe, expect, it } from "vitest";
import { planMerge } from "./merge";

describe("plán sloučení (čistá logika, ORG-07)", () => {
  it("organizace: doplní prázdná pole, vybere aktivnější stav a nejstarší „klient od“, spojí štítky a služby", () => {
    const plan = planMerge(
      "company",
      {
        ico: "27082440",
        dic: "CZ1",
        city: "Praha",
        web: "https://x.cz",
        tags: ["a"],
        services: ["marketing"],
        clientStatus: "active",
        clientSince: "2025-03-01",
        custom: { k: 1 },
      },
      {
        ico: null,
        dic: "CZ2",
        city: "Plzeň",
        tags: ["b"],
        services: ["web"],
        clientStatus: "lead",
        clientSince: "2026-01-01",
        custom: { k: 2 },
      },
    );
    expect(plan.fills.map((f) => f.field).sort()).toEqual(
      ["clientSince", "clientStatus", "ico", "web"].sort(),
    );
    expect(plan.set).toMatchObject({
      ico: "27082440",
      webDomain: "x.cz",
      clientStatus: "active",
      clientSince: "2025-03-01",
      tags: ["b", "a"],
      services: ["web", "marketing"],
      custom: { k: 2 },
    });
    expect(plan.warnings.join(" ")).toMatch(/DIČ se liší/);
    expect(plan.warnings.join(" ")).toMatch(/Stav klienta se liší/);
  });

  it("bývalý klient nepřebije aktivního; shodné údaje nic nehlásí", () => {
    const plan = planMerge(
      "company",
      { clientStatus: "former", tags: [], services: [] },
      { clientStatus: "active", tags: [], services: [] },
    );
    expect(plan.set.clientStatus).toBeUndefined();
    expect(plan.warnings.join(" ")).toMatch(/zůstane „Aktivní“/);
  });

  it("osoba: příznak „rozhoduje“ se spojí, jiná hlavní organizace se přidá mezi další", () => {
    const plan = planMerge(
      "person",
      { isDecisionMaker: true, position: "Ředitel", primaryCompanyId: "b", tags: [] },
      { isDecisionMaker: false, position: null, primaryCompanyId: "a", tags: [] },
    );
    expect(plan.set).toMatchObject({ isDecisionMaker: true, position: "Ředitel" });
    expect(plan.set.primaryCompanyId).toBeUndefined();
    expect(plan.adds.join(" ")).toMatch(/další organizace/);
  });
});
