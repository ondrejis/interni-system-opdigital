import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { UserError } from "../rbac/errors";
import {
  assertPasswordAcceptable,
  checkPasswordOffline,
  isPasswordBreached,
  normalizeForCompare,
  type RangeFetcher,
} from "./password-policy";

const sha1 = (v: string) => createHash("sha1").update(v).digest("hex").toUpperCase();

describe("offline kontrola hesla", () => {
  it("odmítne krátké heslo (méně než 12 znaků) a příliš dlouhé", () => {
    expect(checkPasswordOffline("Krátké-123")).toBe("too_short");
    expect(checkPasswordOffline("x".repeat(129) + "AbC123!?")).toBe("too_long");
    expect(checkPasswordOffline("dvanáctznaků-")).toBeNull();
  });

  it("odmítne běžné základy s číslicemi, i v češtině a s diakritikou", () => {
    for (const p of [
      "password12345",
      "Heslo123456789",
      "mojeheslo1234",
      "qwertyuiop12",
      "Admin1234567890",
      "opdigital2026",
      "iloveyou12345",
      "heslo-heslo-heslo",
    ])
      expect(checkPasswordOffline(p), p).toBe("common");
  });

  it("odmítne řady a opakování", () => {
    for (const p of [
      "123456789012",
      "abcdefghijkl",
      "qwertyuiopas",
      "zyxwvutsrqpo",
      "aaaaaaaaaaaa",
      "abababababab",
    ])
      expect(checkPasswordOffline(p), p).toBe("repetitive");
  });

  it("odmítne heslo s jménem nebo e-mailem uživatele", () => {
    const subject = { email: "ondrej.dvorak@opdigital.cz", name: "Ondřej Dvořák" };
    expect(checkPasswordOffline("Moje-Ondřej-1990-x", subject)).toBe("personal");
    expect(checkPasswordOffline("xx-DVORAK-tajné-77", subject)).toBe("personal");
    expect(checkPasswordOffline("něco-s-opdigital-uvnitř", subject)).toBe("personal");
    // krátké části jména (do tří znaků) se neberou, jinak by padala většina hesel
    expect(checkPasswordOffline("Ivo-má-krásné-heslo-77", { name: "Ivo Li" })).toBeNull();
  });

  it("přijme dlouhé věty a náhodná hesla", () => {
    for (const p of [
      "správné-heslo-123",
      "kůň pije vodu z potoka",
      "Jx9#mQ2$vL7!pR4&",
      "tři sta třiatřicet stříbrných stříkaček",
    ])
      expect(checkPasswordOffline(p, { email: "jan@firma.cz", name: "Jan Novák" }), p).toBeNull();
  });

  it("normalizace odstraní diakritiku, velikost písmen a znaky mimo písmena a číslice", () => {
    expect(normalizeForCompare("Žluťoučký-Kůň 42!")).toBe("zlutouckykun42");
  });
});

describe("k-anonymní kontrola uniklých hesel", () => {
  const password = "Jx9#mQ2$vL7!pR4&";

  it("do služby posílá jen prvních 5 znaků SHA-1, nikdy heslo ani zbytek otisku", async () => {
    const fetchRange = vi.fn<RangeFetcher>(async () => "0000000000000000000000000000000000A:3\r\n");
    await isPasswordBreached(password, fetchRange);
    expect(fetchRange).toHaveBeenCalledTimes(1);
    const [prefix] = fetchRange.mock.calls[0]!;
    expect(prefix).toBe(sha1(password).slice(0, 5));
    expect(prefix).toHaveLength(5);
    expect(JSON.stringify(fetchRange.mock.calls)).not.toContain(password);
    expect(JSON.stringify(fetchRange.mock.calls)).not.toContain(sha1(password).slice(5));
  });

  it("pozná heslo v odpovědi podle zbytku otisku; nulový počet (výplň) neznamená únik", async () => {
    const suffix = sha1(password).slice(5);
    expect(await isPasswordBreached(password, async () => `ABC:2\r\n${suffix}:1234\r\nDEF:1`)).toBe(
      true,
    );
    expect(await isPasswordBreached(password, async () => `${suffix}:0\r\nABC:5`)).toBe(false);
    expect(await isPasswordBreached(password, async () => "ABC:2\r\nDEF:1")).toBe(false);
  });

  it("nedostupná služba není únik: vrátí null (heslo se nezablokuje)", async () => {
    expect(
      await isPasswordBreached(password, async () => {
        throw new Error("síť");
      }),
    ).toBeNull();
  });

  it("assertPasswordAcceptable: uniklé heslo zamítne s českou hláškou, nedostupná služba a vypnutá kontrola projdou", async () => {
    const suffix = sha1(password).slice(5);
    await expect(
      assertPasswordAcceptable(password, { breachCheck: async () => `${suffix}:99` }),
    ).rejects.toThrow(/uniklých databázích/);
    await expect(
      assertPasswordAcceptable(password, { breachCheck: async () => `${suffix}:99` }),
    ).rejects.toBeInstanceOf(UserError);
    await expect(
      assertPasswordAcceptable(password, {
        breachCheck: async () => {
          throw new Error("offline");
        },
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertPasswordAcceptable(password, { breachCheck: "off" }),
    ).resolves.toBeUndefined();
  });

  it("offline pravidla běží vždy, i když je kontrola uniklých hesel vypnutá, a síť se pro ně nevolá", async () => {
    const fetchRange = vi.fn<RangeFetcher>(async () => "");
    await expect(
      assertPasswordAcceptable("password12345", { breachCheck: fetchRange }),
    ).rejects.toThrow(/běžné/);
    expect(fetchRange).not.toHaveBeenCalled();
  });

  it("v testech je výchozí kontrola vypnutá (žádné volání ven)", async () => {
    await expect(assertPasswordAcceptable(password)).resolves.toBeUndefined();
  });
});
