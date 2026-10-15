import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { themeScript } from "../shell/theme";
import { densityOf, ROW_HEIGHTS } from "./use-density";

describe("hustota řádků (NAS-05)", () => {
  it("kompaktní řádek je nižší než pohodlný a neznámá hodnota je pohodlná", () => {
    expect(ROW_HEIGHTS.compact).toBeLessThan(ROW_HEIGHTS.comfortable);
    expect(densityOf("compact")).toBe("compact");
    expect(densityOf("cokoli")).toBe("comfortable");
    expect(densityOf(null)).toBe("comfortable");
  });

  function run(storage: Record<string, string>) {
    const attrs: Record<string, string> = {};
    vm.runInNewContext(themeScript, {
      localStorage: { getItem: (k: string) => storage[k] ?? null },
      document: {
        documentElement: { setAttribute: (k: string, v: string) => void (attrs[k] = v) },
      },
    });
    return attrs;
  }

  it("themeScript nastaví data-density i data-theme před vykreslením", () => {
    expect(run({ density: "compact", theme: "dark" })).toEqual({
      "data-theme": "dark",
      "data-density": "compact",
    });
    expect(run({})).toEqual({ "data-density": "comfortable" });
  });

  it("themeScript při chybě úložiště nespadne", () => {
    expect(() =>
      vm.runInNewContext(themeScript, {
        localStorage: {
          getItem: () => {
            throw new Error("zakázáno");
          },
        },
        document: { documentElement: { setAttribute: () => undefined } },
      }),
    ).not.toThrow();
  });
});
