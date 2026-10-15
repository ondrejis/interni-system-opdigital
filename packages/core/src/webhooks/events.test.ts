import { describe, expect, it } from "vitest";
import { WEBHOOK_EVENTS } from "../contracts/events";
import { isValidEventPattern, matchesEvent, webhookEventGroups, webhookEventLabel } from "./events";

describe("výběr událostí endpointu", () => {
  it("přesný název a skupina s hvězdičkou", () => {
    expect(matchesEvent(["deal.won"], "deal.won")).toBe(true);
    expect(matchesEvent(["deal.won"], "deal.lost")).toBe(false);
    expect(matchesEvent(["deal.*"], "deal.stage_changed")).toBe(true);
    expect(matchesEvent(["deal.*"], "dealer.created")).toBe(false);
    expect(matchesEvent(["task.*", "payment.paid"], "payment.paid")).toBe(true);
    expect(matchesEvent([], "deal.won")).toBe(false);
  });

  it("události Disku dostane jen endpoint, který je výslovně odebírá (ne obecný výběr)", () => {
    const general = ["deal.*", "client.status_changed", "project.*", "task.*", "payment.*"];
    for (const e of WEBHOOK_EVENTS.filter((x) => x.startsWith("drive.")))
      expect(matchesEvent(general, e), e).toBe(false);
    expect(matchesEvent(["drive.*"], "drive.client.create")).toBe(true);
    expect(matchesEvent(["drive.client.*"], "drive.project.create")).toBe(false);
  });

  it("platný je jen název z katalogu nebo skupina, která v něm něco má", () => {
    expect(isValidEventPattern("deal.won")).toBe(true);
    expect(isValidEventPattern("drive.*")).toBe(true);
    expect(isValidEventPattern("drive.client.*")).toBe(true);
    expect(isValidEventPattern("client.renamed")).toBe(false); // interní událost bez webhooku
    expect(isValidEventPattern("*")).toBe(false);
    expect(isValidEventPattern("neco.*")).toBe(false);
    expect(isValidEventPattern("deal.won.")).toBe(false);
  });

  it("nabídka v Nastavení obsahuje každou událost katalogu právě jednou", () => {
    const names = webhookEventGroups().flatMap((g) => g.events.map((e) => e.name));
    expect([...names].sort()).toEqual([...WEBHOOK_EVENTS].sort());
    for (const n of names) expect(webhookEventLabel(n)).not.toBe(n); // každá má český popisek
  });
});
