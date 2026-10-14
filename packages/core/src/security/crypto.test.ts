import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCipher, parseKeyRing } from "./crypto";

const key = () => randomBytes(32).toString("base64");

describe("šifrování", () => {
  it("zašifruje a dešifruje; šifrový text se pokaždé liší", () => {
    const cipher = createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: key() }));
    const a = cipher.encrypt("heslo-k-smtp");
    const b = cipher.encrypt("heslo-k-smtp");
    expect(a).not.toBe(b);
    expect(a).not.toContain("heslo");
    expect(cipher.decrypt(a)).toBe("heslo-k-smtp");
  });

  it("poškozená nebo cizí data nedešifruje (null, žádná výjimka)", () => {
    const cipher = createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: key() }));
    const other = createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: key() }));
    const enc = cipher.encrypt("x");
    expect(other.decrypt(enc)).toBeNull();
    expect(cipher.decrypt(enc.slice(0, -3) + "AAA")).toBeNull();
    expect(cipher.decrypt("v2.1.a.b.c")).toBeNull();
    expect(cipher.decrypt(null)).toBeNull();
  });

  it("rotace klíče: nový klíč šifruje, starý dál dešifruje", () => {
    const k1 = key();
    const k2 = key();
    const old = createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: k1 }));
    const encOld = old.encrypt("tajné");
    const rotated = createCipher(parseKeyRing({ APP_ENCRYPTION_KEYS: `2:${k2},1:${k1}` }));
    expect(rotated.decrypt(encOld)).toBe("tajné");
    expect(rotated.encrypt("nové")).toContain("v2.2.");
    expect(old.decrypt(rotated.encrypt("nové"))).toBeNull();
  });

  it("odmítne chybějící nebo špatně dlouhý klíč srozumitelnou chybou", () => {
    expect(() => parseKeyRing({})).toThrow(/APP_ENCRYPTION_KEY/);
    expect(() => parseKeyRing({ APP_ENCRYPTION_KEY: "zmen-me" })).toThrow(/32 bajtů/);
    expect(() => parseKeyRing({ APP_ENCRYPTION_KEYS: "bezid" })).toThrow(/id:klíč/);
  });
});
