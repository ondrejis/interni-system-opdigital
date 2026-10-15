import { describe, expect, it } from "vitest";
import {
  billingToolField,
  deriveShortName,
  icoField,
  isValidIco,
  shortNameField,
} from "./user-fields";

describe("IČO", () => {
  it("ověří kontrolní součet skutečných IČO", () => {
    for (const ico of ["45274649", "00006947", "27082440", "25596641"])
      expect(isValidIco(ico)).toBe(true);
    for (const ico of ["45274640", "12345678", "1234567", "123456789", "abcdefgh", ""])
      expect(isValidIco(ico)).toBe(false);
  });

  it("pole ignoruje mezery, prázdné je bez IČO a neplatné zamítne", () => {
    expect(icoField.parse(" 45 274 649 ")).toBe("45274649");
    expect(icoField.parse("")).toBeNull();
    expect(icoField.safeParse("45274640").success).toBe(false);
  });
});

describe("zkratka a fakturační nástroj", () => {
  it("zkratka z jména: počáteční písmena prvního a posledního slova", () => {
    expect(deriveShortName("Ondřej Dvořák")).toBe("OD");
    expect(deriveShortName("Patrik Šilhánek")).toBe("PŠ");
    expect(deriveShortName("Jan Karel Novák")).toBe("JN");
    expect(deriveShortName("Madonna")).toBe("MA");
    expect(deriveShortName("  ")).toBe("");
  });

  it("zkratka má 2 až 4 písmena nebo číslice, velkými písmeny; prázdná = odvodí se", () => {
    expect(shortNameField.parse(" od ")).toBe("OD");
    expect(shortNameField.parse("ondř")).toBe("ONDŘ");
    expect(shortNameField.parse("")).toBeNull();
    expect(shortNameField.safeParse("O").success).toBe(false);
    expect(shortNameField.safeParse("ONDŘEJ").success).toBe(false);
    expect(shortNameField.safeParse("O-D").success).toBe(false);
  });

  it("fakturační nástroj je volný text do 80 znaků, prázdný se smaže", () => {
    expect(billingToolField.parse(" Fakturoid ")).toBe("Fakturoid");
    expect(billingToolField.parse("  ")).toBeNull();
    expect(billingToolField.safeParse("x".repeat(81)).success).toBe(false);
  });
});
