import { describe, expect, it } from "vitest";
import { parseWidget, SAFE_HREF } from "./definition";

const base = { id: "w-test-1", title: "Test", w: 3, h: 1 };
const VIEW = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("zdroje widgetů Přehledu", () => {
  it("Číslo z pohledu (kpi) a Seznam z pohledu (table) přijmou odkaz na pohled", () => {
    expect(() =>
      parseWidget({
        ...base,
        type: "kpi",
        source: { kind: "view", viewId: VIEW, agg: { fn: "count" } },
      }),
    ).not.toThrow();
    expect(() =>
      parseWidget({ ...base, type: "table", source: { kind: "view", viewId: VIEW, limit: 10 } }),
    ).not.toThrow();
  });

  it("pohled nepatří do grafu ani seznamu a id musí být UUID", () => {
    expect(() =>
      parseWidget({ ...base, type: "chart", source: { kind: "view", viewId: VIEW } }),
    ).toThrow();
    expect(() =>
      parseWidget({ ...base, type: "kpi", source: { kind: "view", viewId: "neni-uuid" } }),
    ).toThrow();
  });

  it("Rychlé odkazy: jen adresy uvnitř systému nebo https, nejvýš 12 odkazů", () => {
    const links = (href: string) =>
      parseWidget({
        ...base,
        type: "list",
        source: { kind: "links", links: [{ title: "X", href }], viewIds: [] },
      });
    expect(() => links("/obchody?pohled=1")).not.toThrow();
    expect(() => links("https://opdigital.cz/x")).not.toThrow();
    for (const bad of ["javascript:alert(1)", "//evil.example", "data:text/html,x", "obchody"])
      expect(() => links(bad), bad).toThrow();
    expect(SAFE_HREF.test("/ok")).toBe(true);
    expect(() =>
      parseWidget({
        ...base,
        type: "list",
        source: {
          kind: "links",
          links: Array.from({ length: 13 }, (_, i) => ({ title: `L${i}`, href: "/a" })),
          viewIds: [],
        },
      }),
    ).toThrow();
  });

  it("Seznam čerpá i z metriky tvaru seznam; dlaždice a úkoly mají parametry", () => {
    expect(() =>
      parseWidget({
        ...base,
        type: "list",
        source: { kind: "metric", metric: "prehled.recent_changes", params: { scope: "mine" } },
      }),
    ).not.toThrow();
    expect(() =>
      parseWidget({
        ...base,
        type: "builtin",
        source: { kind: "builtin", builtin: "tiles", params: { tileIds: ["obchody.pipeline"] } },
      }),
    ).not.toThrow();
    expect(() =>
      parseWidget({
        ...base,
        type: "list",
        source: {
          kind: "builtin",
          builtin: "my_tasks",
          params: { includeDelegated: true, limit: 5 },
        },
      }),
    ).not.toThrow();
  });
});
