import { describe, expect, it } from "vitest";
import {
  formatPhone,
  isGenericDomain,
  isValidIco,
  isValidPhone,
  normalizeEmail,
  normalizeIco,
  normalizePhone,
  normalizePhoneE164,
  splitFullName,
  webDomainOf,
} from "./normalize";

describe("telefon v E.164 (KON-03)", () => {
  it("mezery, pomlčky i předvolba dají totéž číslo", () => {
    const variants = [
      "777 123 456",
      "777123456",
      "777-123-456",
      "+420 777 123 456",
      "+420777123456",
      "00420 777 123 456",
      "00420777123456",
      " (+420) 777 123 456 ",
    ];
    for (const v of variants) expect(normalizePhoneE164(v), v).toBe("+420777123456");
  });

  it("zahraniční číslo si nese svou zemi", () => {
    expect(normalizePhoneE164("+421 905 123 456")).toBe("+421905123456");
    expect(normalizePhoneE164("00421905123456")).toBe("+421905123456");
  });

  it("neplatné číslo se nezahodí, ale zapíše co nejvěrněji; nesmysl je null", () => {
    // 123 456 789 není platné české číslo, přesto se musí shodovat s variantou s předvolbou
    expect(isValidPhone("123 456 789")).toBe(false);
    expect(normalizePhoneE164("123 456 789")).toBe("+420123456789");
    expect(normalizePhoneE164("+420 123 456 789")).toBe("+420123456789");
    expect(normalizePhoneE164("12")).toBeNull();
    expect(normalizePhoneE164("   ")).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
  });

  it("platnost a zobrazení", () => {
    expect(isValidPhone("777 123 456")).toBe(true);
    expect(formatPhone("777123456")).toBe("+420 777 123 456");
    expect(formatPhone("nesmysl")).toBe("nesmysl");
    expect(formatPhone(null)).toBe("");
  });

  it("starý tvar (devět koncových číslic) zůstává pro volný text", () => {
    expect(normalizePhone("+420 777 123 456")).toBe("777123456");
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("IČO", () => {
  it("normalizace doplní nuly a odmítne nesmysl", () => {
    expect(normalizeIco("2 70 82 440")).toBe("27082440");
    expect(normalizeIco("6947")).toBe("00006947");
    expect(normalizeIco("123456789")).toBeNull();
    expect(normalizeIco("")).toBeNull();
    expect(normalizeIco(null)).toBeNull();
  });

  it("kontrolní součet mod 11 pozná platné a chybně opsané IČO", () => {
    expect(isValidIco("27082440")).toBe(true);
    expect(isValidIco("00006947")).toBe(true);
    expect(isValidIco("27082441")).toBe(false);
    expect(isValidIco("1234")).toBe(false);
  });
});

describe("e-mail a doména webu", () => {
  it("e-mail malými písmeny a bez mezer; bez zavináče nebo domény je neplatný", () => {
    expect(normalizeEmail("  Jan.Novak@Example.CZ ")).toBe("jan.novak@example.cz");
    expect(normalizeEmail("bez-zavinace")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
  });

  it("doména webu bez protokolu, www, cesty a portu", () => {
    expect(webDomainOf("https://www.Example.cz/kontakt?x=1")).toBe("example.cz");
    expect(webDomainOf("example.cz")).toBe("example.cz");
    expect(webDomainOf("http://user:pw@shop.example.cz:8080/a")).toBe("shop.example.cz");
    expect(webDomainOf("není web")).toBeNull();
    expect(webDomainOf("")).toBeNull();
  });

  it("sdílené profily a katalogy nejsou důkaz duplicity", () => {
    expect(isGenericDomain("facebook.com")).toBe(true);
    expect(isGenericDomain("m.facebook.com")).toBe(true);
    expect(isGenericDomain("novak.firmy.cz")).toBe(true);
    expect(isGenericDomain("novak-stavby.cz")).toBe(false);
    expect(isGenericDomain(null)).toBe(true);
  });
});

describe("jméno", () => {
  it("poslední slovo je příjmení, jedno slovo je příjmení", () => {
    expect(splitFullName("Jan Novák")).toEqual({ firstName: "Jan", lastName: "Novák" });
    expect(splitFullName("Marie Anna Svobodová")).toEqual({
      firstName: "Marie Anna",
      lastName: "Svobodová",
    });
    expect(splitFullName("Novák")).toEqual({ firstName: null, lastName: "Novák" });
  });
});
