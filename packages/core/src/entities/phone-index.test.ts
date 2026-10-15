import { describe, expect, it } from "vitest";
import { phoneKeysInText, phoneQueryKey } from "./phone-index";

describe("telefon v hledání (C3)", () => {
  it("z textu vytáhne klíč každého čísla bez ohledu na formát", () => {
    expect(phoneKeysInText("Jan Novák +420 777 123 456 jan@x.cz")).toEqual(["777123456"]);
    expect(phoneKeysInText("tel 00420777123456, 603-111-222")).toEqual(["777123456", "603111222"]);
  });
  it("IČO a krátká čísla nejsou telefon", () => {
    expect(phoneKeysInText("IČO 27082440 Plzeň 12345")).toEqual(["27082440"]); // 8 číslic je ještě číslo
    expect(phoneKeysInText("Zakázka, 12 345, Plzeň")).toEqual([]);
  });
  it("dotaz „777 12“ se převede na klíč, který najde +420 777 123 456", () => {
    const key = phoneQueryKey("777 12")!;
    expect(key).toBe("77712");
    expect("777123456".includes(key)).toBe(true);
  });
  it("předvolba v dotazu se ignoruje", () => {
    expect(phoneQueryKey("+420 777 12")).toBe("77712");
    expect(phoneQueryKey("00420777123456")).toBe("777123456");
    expect(phoneQueryKey("+420 777 123 456")).toBe("777123456");
  });
  it("text a krátké dotazy nejsou telefon", () => {
    expect(phoneQueryKey("novák")).toBeNull();
    expect(phoneQueryKey("77")).toBeNull();
    expect(phoneQueryKey("a777123")).toBeNull();
  });
});
