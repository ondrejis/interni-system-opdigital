import { describe, expect, it } from "vitest";
import { buildTopTabs, mergeModuleUi, type RecordTab, type RecordTabGroup } from "./module-ui";

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

describe("mergeModuleUi", () => {
  const page = (path: string) => ({ path, render: () => null });
  const action = (id: string) => ({ id, label: id });

  it("stránky a příkazy palety se přidají za sebe, mapy podle entity se zřetězí", () => {
    const merged = mergeModuleUi(
      {
        pages: [page("/a")],
        paletteActions: [action("x")],
        recordActions: { company: [action("a1")] },
      },
      {
        pages: [page("/b")],
        paletteActions: [action("y")],
        recordActions: { company: [action("a2")], job: [action("j1")] },
      },
    );
    expect(merged.pages?.map((p) => p.path)).toEqual(["/a", "/b"]);
    expect(merged.paletteActions?.map((a) => a.id)).toEqual(["x", "y"]);
    expect(merged.recordActions?.company?.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(merged.recordActions?.job?.map((a) => a.id)).toEqual(["j1"]);
  });

  it("sloty různých oblastí se spojí, stejný slot drží první oblast", () => {
    const first = () => null;
    const second = () => null;
    const third = () => null;
    const merged = mergeModuleUi(
      { slots: { "task.dialog.extras": first } },
      { slots: { "task.dialog.extras": second, "job.header.extra": third } },
    );
    expect(merged.slots?.["task.dialog.extras"]).toBe(first);
    expect(merged.slots?.["job.header.extra"]).toBe(third);
  });

  it("vstupní objekty se nemění", () => {
    const a = { pages: [page("/a")] };
    mergeModuleUi(a, { pages: [page("/b")] });
    expect(a.pages).toHaveLength(1);
  });
});
