import { describe, expect, it } from "vitest";
import { phoneSearchKeys, toE164 } from "./phone";

describe("toE164", () => {
  it("české číslo bez předvolby, s mezerami i oddělovači", () => {
    expect(toE164("777 123 456")).toBe("+420777123456");
    expect(toE164("777-123-456")).toBe("+420777123456");
    expect(toE164("(777) 123 456")).toBe("+420777123456");
    expect(toE164("  777123456 ")).toBe("+420777123456");
  });

  it("číslo s předvolbou + nebo 00 si nese zemi", () => {
    expect(toE164("+420 777 123 456")).toBe("+420777123456");
    expect(toE164("00420 777 123 456")).toBe("+420777123456");
    expect(toE164("+421 905 123 456")).toBe("+421905123456");
    expect(toE164("+49 151 23456789")).toBe("+4915123456789");
  });

  it("výchozí země jde změnit", () => {
    expect(toE164("0905 123 456", "SK")).toBe("+421905123456");
  });

  it("neplatné nebo prázdné číslo je null", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("   ")).toBeNull();
    expect(toE164("abc")).toBeNull();
    expect(toE164("123")).toBeNull();
    expect(toE164("777 123")).toBeNull();
  });

  it("stejné číslo v různých zápisech dá stejnou hodnotu (základ detekce duplicit)", () => {
    const forms = ["777123456", "+420 777 123 456", "00420777123456", "777 12 34 56"];
    expect(new Set(forms.map((f) => toE164(f))).size).toBe(1);
  });
});

describe("phoneSearchKeys", () => {
  it("klíč je posledních devět číslic bez předvolby", () => {
    expect(phoneSearchKeys("+420 777 123 456")).toEqual(["777123456"]);
    expect(phoneSearchKeys("00420777123456")).toEqual(["777123456"]);
    expect(phoneSearchKeys("777123456")).toEqual(["777123456"]);
  });

  it("„777 12“ najde „+420 777 123 456“: hledaný text se normalizuje stejně a hledá se podčástí", () => {
    const [key] = phoneSearchKeys("+420 777 123 456");
    const [query] = phoneSearchKeys("777 12");
    expect(query).toBe("77712");
    expect(key!.includes(query!)).toBe(true);
  });

  it("kratší číslo se bere celé, příliš krátké (méně než tři číslice) se neindexuje", () => {
    expect(phoneSearchKeys("158")).toEqual(["158"]);
    expect(phoneSearchKeys("12")).toEqual([]);
    expect(phoneSearchKeys("")).toEqual([]);
    expect(phoneSearchKeys("abc")).toEqual([]);
  });
});
