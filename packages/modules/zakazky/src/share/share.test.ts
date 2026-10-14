import { describe, expect, it } from "vitest";
import { DEFAULT_SCOPE, describeScope, normalizeScope, shareStatus } from "./model";
import { SHARE_TOKEN_RE, hashShareToken, newShareToken } from "./token";

const ID = "11111111-1111-4111-8111-111111111111";

describe("rozsah odkazu pro investora", () => {
  it("neznámé a chybné hodnoty se zahodí, nikdy nevznikne širší přístup", () => {
    expect(normalizeScope(null)).toEqual({
      schedule: false,
      diary: "none",
      photos: false,
      documentIds: [],
    });
    expect(
      normalizeScope({
        schedule: "yes",
        diary: "everything",
        photos: 1,
        documentIds: ["x", ID, ID],
      }),
    ).toEqual({
      schedule: false,
      diary: "none",
      photos: false,
      documentIds: [ID],
    });
    expect(normalizeScope({ ...DEFAULT_SCOPE })).toEqual(DEFAULT_SCOPE);
  });

  it("popis rozsahu", () => {
    expect(describeScope({ schedule: false, diary: "none", photos: false, documentIds: [] })).toBe(
      "jen název zakázky",
    );
    expect(describeScope({ schedule: true, diary: "all", photos: true, documentIds: [ID] })).toBe(
      "fáze a postup, celý deník, fotky, 1 dokument",
    );
  });

  it("stav odkazu: platí, vypršel, zrušen", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(shareStatus({ revokedAt: null, expiresAt: null }, now)).toBe("active");
    expect(shareStatus({ revokedAt: null, expiresAt: new Date("2026-10-09T11:00:00Z") }, now)).toBe(
      "expired",
    );
    expect(shareStatus({ revokedAt: new Date(), expiresAt: null }, now)).toBe("revoked");
  });
});

describe("token odkazu", () => {
  it("je dlouhý náhodný a v databázi je jen otisk", () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).not.toBe(b);
    expect(SHARE_TOKEN_RE.test(a)).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashShareToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(a)).not.toContain(a);
    expect(SHARE_TOKEN_RE.test("kratky")).toBe(false);
    expect(SHARE_TOKEN_RE.test("../../etc/passwd" + "x".repeat(30))).toBe(false);
  });
});
