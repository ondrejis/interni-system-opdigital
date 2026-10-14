import { describe, expect, it } from "vitest";
import type { SavedViewInfo } from "./api";
import { resolveViews, type ViewLayout } from "./view-layout";

const view = (id: string, name: string, extra: Partial<SavedViewInfo> = {}): SavedViewInfo => ({
  id,
  name,
  shared: true,
  mine: false,
  favorite: false,
  config: { viewType: "table" },
  ...extra,
});

const LAYOUT: ViewLayout = {
  groups: [
    { id: "mine", label: "Moje" },
    { id: "clean", label: "Čištění dat", hint: "Kontroly" },
  ],
  meta: (v) =>
    v.name === "Moje otevřené"
      ? { group: "mine", pinned: true }
      : v.name.startsWith("Čištění: ")
        ? { group: "clean", label: v.name.slice(9), description: "Popis" }
        : undefined,
};

describe("resolveViews", () => {
  const views = [
    view("1", "Čištění: A"),
    view("2", "Moje otevřené"),
    view("3", "Cizí sdílený"),
    view("4", "Můj vlastní", { mine: true, shared: false }),
  ];

  it("zařazené pohledy jdou do svých skupin v pořadí z uspořádání, ostatní do Moje/Sdílené pohledy", () => {
    const r = resolveViews(views, LAYOUT, null);
    expect(r.groups.map((g) => [g.id, g.items.map((i) => i.view.id)])).toEqual([
      ["mine", ["2"]],
      ["clean", ["1"]],
      ["__mine", ["4"]],
      ["__shared", ["3"]],
    ]);
  });

  it("zkrácený název a popis se použijí jen v nabídce, název pohledu zůstává", () => {
    const item = resolveViews(views, LAYOUT, null).groups.find((g) => g.id === "clean")!.items[0]!;
    expect(item.label).toBe("A");
    expect(item.description).toBe("Popis");
    expect(item.view.name).toBe("Čištění: A");
  });

  it("viditelné záložky: připnuté a oblíbené nezařazené, nejvýš maxPinned", () => {
    const fav = [...views, view("5", "Oblíbený", { favorite: true })];
    expect(resolveViews(fav, LAYOUT, null).pinned.map((v) => v.id)).toEqual(["2", "5"]);
    expect(resolveViews(fav, { ...LAYOUT, maxPinned: 1 }, null).pinned.map((v) => v.id)).toEqual([
      "2",
    ]);
  });

  it("aktuální pohled mimo záložky se vrací zvlášť a počet skrytých se drží", () => {
    const r = resolveViews(views, LAYOUT, "1");
    expect(r.hiddenCurrent?.id).toBe("1");
    expect(r.hidden).toBe(3);
    expect(resolveViews(views, LAYOUT, "2").hiddenCurrent).toBeNull();
  });

  it("pohledy ve skupině se nikdy neztratí: součet položek = počet pohledů", () => {
    const r = resolveViews(views, LAYOUT, null);
    expect(r.groups.reduce((n, g) => n + g.items.length, 0)).toBe(views.length);
  });
});
