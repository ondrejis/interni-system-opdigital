import { NO_VIEW_ID, type DashboardWidget } from "@rebar/core/dashboards-shared";
import { describe, expect, it } from "vitest";
import { isSpecialSource, validateSpecial } from "./widget-special";

const w = (
  source: DashboardWidget["source"],
  type: DashboardWidget["type"] = "kpi",
): DashboardWidget => ({
  id: "w-test-1",
  type,
  title: "Test",
  w: 3,
  h: 1,
  source,
});

describe("nastavení speciálních widgetů", () => {
  it("pohled a odkazy a dlaždice s výběrem mají vlastní nastavení, běžné zdroje ne", () => {
    expect(isSpecialSource(w({ kind: "view", viewId: NO_VIEW_ID }))).toBe(true);
    expect(isSpecialSource(w({ kind: "links", links: [], viewIds: [] }, "list"))).toBe(true);
    expect(
      isSpecialSource(
        w({ kind: "builtin", builtin: "tiles", params: { tileIds: ["a"] } }, "builtin"),
      ),
    ).toBe(true);
    expect(isSpecialSource(w({ kind: "builtin", builtin: "my_tasks" }, "list"))).toBe(false);
    expect(isSpecialSource(w({ kind: "metric", metric: "ukoly.today" }))).toBe(false);
  });

  it("Číslo z pohledu: bez pohledu a součet bez pole se neuloží", () => {
    expect(validateSpecial(w({ kind: "view", viewId: NO_VIEW_ID }))).toMatch(/pohled/);
    const id = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    expect(validateSpecial(w({ kind: "view", viewId: id, agg: { fn: "count" } }))).toBeNull();
    expect(validateSpecial(w({ kind: "view", viewId: id, agg: { fn: "sum" } }))).toMatch(/pole/);
    expect(
      validateSpecial(w({ kind: "view", viewId: id, agg: { fn: "sum", attr: "price" } })),
    ).toBeNull();
  });

  it("Rychlé odkazy: prázdný widget, prázdný řádek a nebezpečná adresa se neuloží", () => {
    const links = (l: { title: string; href: string }[], viewIds: string[] = []) =>
      validateSpecial(w({ kind: "links", links: l, viewIds }, "list"));
    expect(links([])).toMatch(/aspoň jeden/);
    expect(links([{ title: "", href: "/obchody" }])).toMatch(/Vyplňte/);
    expect(links([{ title: "X", href: "javascript:alert(1)" }])).toMatch(/začínat/);
    expect(links([{ title: "X", href: "//evil.example" }])).toMatch(/začínat/);
    expect(links([{ title: "Obchody", href: "/obchody" }])).toBeNull();
    expect(links([{ title: "Web", href: "https://opdigital.cz" }])).toBeNull();
    expect(links([], ["0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"])).toBeNull();
  });
});
