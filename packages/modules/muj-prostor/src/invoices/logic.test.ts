import { describe, expect, it } from "vitest";
import {
  czDate,
  invoiceCustomId,
  invoiceLineName,
  invoicePeriod,
  isDueForPreparation,
  minorToMajor,
  normalizeIco,
  prepareDateOf,
} from "./logic";

describe("období faktury", () => {
  it("roční služba: od obnovy do dne před další obnovou", () => {
    expect(invoicePeriod("2027-03-15", "yearly")).toEqual({
      from: "2027-03-15",
      to: "2028-03-14",
      next: "2028-03-15",
    });
  });
  it("měsíční služba: kalendářní měsíc od obnovy", () => {
    expect(invoicePeriod("2027-01-10", "monthly")).toEqual({
      from: "2027-01-10",
      to: "2027-02-09",
      next: "2027-02-10",
    });
  });
  it("zkrácený měsíc: obnova 31. 1. měsíčně končí 27. 2. a další začíná 28. 2.", () => {
    const p = invoicePeriod("2027-01-31", "monthly");
    expect(p.next).toBe("2027-02-28");
    expect(p.to).toBe("2027-02-27");
  });
  it("přestupný den: 29. 2. 2028 ročně → 28. 2. 2029, období končí 27. 2. 2029", () => {
    const p = invoicePeriod("2028-02-29", "yearly");
    expect(p.next).toBe("2029-02-28");
    expect(p.to).toBe("2029-02-27");
  });
  it("přijímá datum s časem", () => {
    expect(invoicePeriod("2027-03-15T00:00:00Z", "yearly").from).toBe("2027-03-15");
  });
});

describe("termín přípravy návrhu", () => {
  it("14 dní před obnovou", () => {
    expect(prepareDateOf("2027-03-15", 14)).toBe("2027-03-01");
  });
  it("přes hranici měsíce a roku", () => {
    expect(prepareDateOf("2027-01-05", 14)).toBe("2026-12-22");
  });
  it("je čas přesně v den přípravy, ne den předtím", () => {
    expect(isDueForPreparation("2027-03-15", 14, "2027-02-28")).toBe(false);
    expect(isDueForPreparation("2027-03-15", 14, "2027-03-01")).toBe(true);
  });
  it("dožene i po termínu obnovy", () => {
    expect(isDueForPreparation("2027-03-15", 14, "2027-04-20")).toBe(true);
  });
  it("bez data obnovy se nepřipravuje; záporné dny se berou jako 0", () => {
    expect(isDueForPreparation(null, 14, "2027-03-01")).toBe(false);
    expect(prepareDateOf("2027-03-15", -5)).toBe("2027-03-15");
  });
});

describe("pomocné funkce", () => {
  it("český zápis data", () => {
    expect(czDate("2027-03-05")).toBe("5. 3. 2027");
  });
  it("text řádku faktury s webem i bez něj", () => {
    expect(
      invoiceLineName({ name: "Hosting", web: "firma.cz", from: "2027-03-15", to: "2028-03-14" }),
    ).toBe("Hosting (firma.cz), 15. 3. 2027 až 14. 3. 2028");
    expect(invoiceLineName({ name: "Údržba", from: "2027-03-15", to: "2028-03-14" })).toBe(
      "Údržba, 15. 3. 2027 až 14. 3. 2028",
    );
  });
  it("haléře na koruny bez chyby plovoucí čárky", () => {
    expect(minorToMajor(123_456)).toBe(1234.56);
    expect(minorToMajor(1)).toBe(0.01);
    expect(minorToMajor(29)).toBe(0.29);
  });
  it("IČO se doplní na osm číslic; neplatné je null", () => {
    expect(normalizeIco("12 345 678")).toBe("12345678");
    expect(normalizeIco("123456")).toBe("00123456");
    expect(normalizeIco("abc")).toBeNull();
    expect(normalizeIco("123456789")).toBeNull();
    expect(normalizeIco(null)).toBeNull();
  });
  it("klíč idempotence nese id návrhu", () => {
    expect(invoiceCustomId("abc")).toBe("opsys-ri-abc");
  });
});
