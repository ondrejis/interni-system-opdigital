import { describe, expect, it } from "vitest";
import { diffRecords, redact } from "./audit";

describe("diffRecords", () => {
  it("vrátí jen změněná pole se starou a novou hodnotou", () => {
    const changes = diffRecords(
      { name: "A", city: "Plzeň", n: 1 },
      { name: "B", city: "Plzeň", n: 1 },
    );
    expect(changes).toEqual([{ field: "name", old: "A", new: "B" }]);
  });

  it("nesleduje updatedAt a podobná technická pole", () => {
    expect(diffRecords({ updatedAt: 1, name: "A" }, { updatedAt: 2, name: "A" })).toEqual([]);
  });

  it("zamaskuje tajná pole, ale ukáže, že se změnila", () => {
    const changes = diffRecords({ passwordHash: "x" }, { passwordHash: "y" });
    expect(changes).toEqual([{ field: "passwordHash", old: "***", new: "***" }]);
  });

  it("založení (before = null) vypíše všechna pole jako nová", () => {
    const changes = diffRecords(null, { title: "Nová", value: 5 });
    expect(changes.map((c) => c.field)).toEqual(["title", "value"]);
    expect(changes.every((c) => c.old === null)).toBe(true);
  });

  it("porovnává i vnořené hodnoty a data", () => {
    expect(diffRecords({ a: { x: 1 } }, { a: { x: 1 } })).toEqual([]);
    expect(diffRecords({ a: { x: 1 } }, { a: { x: 2 } })).toHaveLength(1);
  });
});

describe("redact", () => {
  it("maskuje tajná pole rekurzivně a nechává data", () => {
    const d = new Date(0);
    expect(redact({ user: { name: "A", token: "t" }, list: [{ apiKey: "k" }], at: d })).toEqual({
      user: { name: "A", token: "***" },
      list: [{ apiKey: "***" }],
      at: d,
    });
  });
});
