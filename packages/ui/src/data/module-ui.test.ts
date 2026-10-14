import { describe, expect, it } from "vitest";
import { buildTopTabs, type RecordTab, type RecordTabGroup } from "./module-ui";

const tab = (id: string, extra: Partial<RecordTab> = {}): RecordTab => ({
  id,
  label: id,
  render: () => null,
  ...extra,
});
const allow = () => true;

describe("buildTopTabs", () => {
  const groups: RecordTabGroup[] = [
    { id: "naklady", label: "Náklady", order: 30, visible: (r) => r.phase === "execution" },
    { id: "rozpocet", label: "Rozpočet", order: 10 },
  ];
  const tabs = [
    tab("material", { group: "naklady", order: 20 }),
    tab("stroje", { group: "naklady", order: 30 }),
    tab("rozpocet", { group: "rozpocet" }),
    tab("tym", { order: 90 }),
  ];

  it("seskupí záložky a seřadí podle order", () => {
    const row = { id: "1", updatedAt: "", phase: "execution" };
    const top = buildTopTabs(tabs, groups, allow, row);
    expect(top.map((t) => t.id)).toEqual(["rozpocet", "naklady", "tym"]);
    expect(top[1]!.tabs.map((t) => t.id)).toEqual(["material", "stroje"]);
  });

  it("záložky skryté skupiny se neobjeví ani samostatně", () => {
    const row = { id: "1", updatedAt: "", phase: "inquiry" };
    const top = buildTopTabs(tabs, groups, allow, row);
    expect(top.map((t) => t.id)).toEqual(["rozpocet", "tym"]);
  });

  it("záložka s neznámou skupinou je samostatná", () => {
    const top = buildTopTabs([tab("x", { group: "neexistuje" })], groups, allow);
    expect(top.map((t) => t.id)).toEqual(["x"]);
  });
});
