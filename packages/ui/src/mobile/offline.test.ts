import { describe, expect, it } from "vitest";
import {
  isNetworkFailure,
  isPersistableKey,
  OFFLINE_MAX_AGE_MS,
  parseSnapshot,
  serializeSnapshot,
  type SavedQuery,
} from "./offline";

const q = (key: unknown[], data: unknown, updatedAt = 1000): SavedQuery => ({
  key,
  data,
  updatedAt,
});
const NOW = 2_000_000;

describe("offline mezipaměť: co se ukládá", () => {
  it("jen čtení záznamů, ne hledání v paletě", () => {
    expect(isPersistableKey(["entity", "company", { q: "" }])).toBe(true);
    expect(isPersistableKey(["command", "ukoly.mine"])).toBe(true);
    expect(isPersistableKey(["palette", "x"])).toBe(false);
    expect(isPersistableKey([])).toBe(false);
  });

  it("serializace zachová Date a bigint a při návratu je obnoví", () => {
    const when = new Date("2026-10-15T08:00:00.000Z");
    const raw = serializeSnapshot(
      "u1",
      [q(["entity", "task"], { due: when, amount: 12345678901234567890n })],
      NOW,
    );
    const back = parseSnapshot(raw, "u1", NOW);
    expect(back).toHaveLength(1);
    const data = back[0]!.data as { due: Date; amount: bigint };
    expect(data.due).toBeInstanceOf(Date);
    expect(data.due.toISOString()).toBe(when.toISOString());
    expect(data.amount).toBe(12345678901234567890n);
  });

  it("nechá nejnovější dotazy a respektuje limit počtu", () => {
    const raw = serializeSnapshot(
      "u1",
      [q(["entity", "a"], 1, 10), q(["entity", "b"], 2, 30), q(["entity", "c"], 3, 20)],
      NOW,
      { maxQueries: 2 },
    );
    expect(parseSnapshot(raw, "u1", NOW).map((x) => x.key[1])).toEqual(["b", "c"]);
  });

  it("limit velikosti zahodí příliš velký dotaz, ostatní zůstanou", () => {
    const big = "x".repeat(500);
    const raw = serializeSnapshot(
      "u1",
      [q(["entity", "big"], big, 30), q(["entity", "small"], 1, 20)],
      NOW,
      {
        maxBytes: 200,
      },
    );
    expect(parseSnapshot(raw, "u1", NOW).map((x) => x.key[1])).toEqual(["small"]);
  });

  it("dotaz, který nejde serializovat, se přeskočí", () => {
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    const raw = serializeSnapshot("u1", [q(["entity", "cyc"], cyc), q(["entity", "ok"], 1)], NOW);
    expect(parseSnapshot(raw, "u1", NOW).map((x) => x.key[1])).toEqual(["ok"]);
  });
});

describe("offline mezipaměť: kdy se použije", () => {
  const raw = serializeSnapshot("u1", [q(["entity", "a"], 1)], NOW);
  it("jiný uživatel nedostane data cizího účtu", () => {
    expect(parseSnapshot(raw, "u2", NOW)).toEqual([]);
  });
  it("starší než sedm dní se nepoužije", () => {
    expect(parseSnapshot(raw, "u1", NOW + OFFLINE_MAX_AGE_MS + 1)).toEqual([]);
    expect(parseSnapshot(raw, "u1", NOW + OFFLINE_MAX_AGE_MS - 1)).toHaveLength(1);
  });
  it("poškozený nebo prázdný záznam nic nevrátí", () => {
    expect(parseSnapshot("{nesmysl", "u1", NOW)).toEqual([]);
    expect(parseSnapshot(null, "u1", NOW)).toEqual([]);
    expect(parseSnapshot('{"v":9,"user":"u1","savedAt":1,"queries":[]}', "u1", NOW)).toEqual([]);
  });
  it("klíč mimo povolené skupiny se po načtení zahodí", () => {
    const bad =
      '{"v":1,"user":"u1","savedAt":2000000,"queries":[{"key":["palette"],"data":1,"updatedAt":1}]}';
    expect(parseSnapshot(bad, "u1", NOW)).toEqual([]);
  });
});

describe("isNetworkFailure", () => {
  it("pozná výpadek spojení", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFailure(new Error("Load failed"))).toBe(true);
    expect(isNetworkFailure(new Error("E-47c79df2"))).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });
});
