import { describe, expect, it } from "vitest";
import {
  BULK_DOMAIN_LIMIT,
  daysCs,
  expiryState,
  expiryText,
  normalizeDomain,
  parseDomainList,
  sanitizeWarnDays,
  summarizeDomains,
} from "./logic";

const TODAY = "2026-10-14";
const inDays = (n: number) => {
  const d = new Date(Date.UTC(2026, 9, 14 + n));
  return d.toISOString().slice(0, 10);
};

describe("barva podle expirace (DOM-02, R-19)", () => {
  it("výchozí hranice: > 60 normální, 60–30 upozornění, < 30 kritická", () => {
    expect(expiryState(inDays(61), 30, TODAY).level).toBe("normal");
    expect(expiryState(inDays(60), 30, TODAY).level).toBe("warning");
    expect(expiryState(inDays(31), 30, TODAY).level).toBe("warning");
    expect(expiryState(inDays(30), 30, TODAY).level).toBe("warning");
    expect(expiryState(inDays(29), 30, TODAY).level).toBe("critical");
    expect(expiryState(inDays(1), 30, TODAY).level).toBe("critical");
    expect(expiryState(inDays(0), 30, TODAY).level).toBe("critical");
  });

  it("po expiraci je kritická a vypršelá", () => {
    const s = expiryState(inDays(-3), 30, TODAY);
    expect(s).toEqual({ level: "critical", daysLeft: -3, expired: true });
    expect(expiryState(inDays(0), 30, TODAY).expired).toBe(false);
  });

  it("hranici jde u domény změnit: warn_days = 14 → kritická < 14, upozornění do 28", () => {
    expect(expiryState(inDays(13), 14, TODAY).level).toBe("critical");
    expect(expiryState(inDays(14), 14, TODAY).level).toBe("warning");
    expect(expiryState(inDays(28), 14, TODAY).level).toBe("warning");
    expect(expiryState(inDays(29), 14, TODAY).level).toBe("normal");
    expect(expiryState(inDays(45), 30, TODAY).level).toBe("warning");
    expect(expiryState(inDays(45), 14, TODAY).level).toBe("normal");
  });

  it("bez expirace je stav neznámý, nevalidní warn_days se nahradí výchozími 30", () => {
    expect(expiryState(null, 30, TODAY)).toEqual({
      level: "unknown",
      daysLeft: null,
      expired: false,
    });
    expect(expiryState(inDays(10), 0, TODAY).level).toBe("critical");
    expect(expiryState(inDays(40), null, TODAY).level).toBe("warning");
    expect(sanitizeWarnDays(0)).toBe(30);
    expect(sanitizeWarnDays(-5)).toBe(30);
    expect(sanitizeWarnDays(Number.NaN)).toBe(30);
    expect(sanitizeWarnDays(7.9)).toBe(7);
  });

  it("přijme datum s časovou částí a počítá přes přelom roku", () => {
    expect(expiryState("2027-01-05T00:00:00.000Z", 30, "2026-12-30").daysLeft).toBe(6);
  });

  it("popisuje zbývající dobu česky", () => {
    expect(daysCs(1)).toBe("1 den");
    expect(daysCs(3)).toBe("3 dny");
    expect(daysCs(5)).toBe("5 dní");
    expect(daysCs(0)).toBe("0 dní");
    expect(expiryText(expiryState(inDays(23), 30, TODAY))).toBe("Za 23 dní");
    expect(expiryText(expiryState(inDays(1), 30, TODAY))).toBe("Vyprší zítra");
    expect(expiryText(expiryState(inDays(0), 30, TODAY))).toBe("Vyprší dnes");
    expect(expiryText(expiryState(inDays(-1), 30, TODAY))).toBe("Vypršela před 1 dnem");
    expect(expiryText(expiryState(inDays(-5), 30, TODAY))).toBe("Vypršela před 5 dny");
    expect(expiryText(expiryState(null, 30, TODAY))).toBe("Bez expirace");
  });
});

describe("souhrn domén (DOM-03: počet kritických)", () => {
  it("počítá úrovně, domény bez klienta a bez expirace", () => {
    const s = summarizeDomains(
      [
        { expiresOn: inDays(-1), warnDays: 30, companyId: "a" },
        { expiresOn: inDays(10), warnDays: 30, companyId: null },
        { expiresOn: inDays(40), warnDays: 30, companyId: "a" },
        { expiresOn: inDays(100), warnDays: 30, companyId: "b" },
        { expiresOn: null, warnDays: 30, companyId: "b" },
        { expiresOn: inDays(40), warnDays: 14, companyId: "b" },
      ],
      TODAY,
    );
    expect(s).toEqual({
      total: 6,
      critical: 2,
      warning: 1,
      normal: 2,
      unknown: 1,
      withoutClient: 1,
    });
  });
});

describe("normalizace domény", () => {
  it("odstraní protokol, cestu, port, www a koncovou tečku, malá písmena", () => {
    expect(normalizeDomain("Example.CZ")).toBe("example.cz");
    expect(normalizeDomain("https://www.Example.cz/kontakt?x=1#a")).toBe("example.cz");
    expect(normalizeDomain("http://user:pass@example.cz:8080/")).toBe("example.cz");
    expect(normalizeDomain("  example.cz.  ")).toBe("example.cz");
    expect(normalizeDomain("blog.example.cz")).toBe("blog.example.cz");
    expect(normalizeDomain("a-b.example.co.uk")).toBe("a-b.example.co.uk");
  });

  it("diakritické domény převede na punycode", () => {
    expect(normalizeDomain("příklad.cz")).toBe("xn--pklad-zsa96e.cz");
  });

  it("odmítne to, co doménou není", () => {
    for (const bad of [
      "",
      "   ",
      "example",
      "exa mple.cz",
      "-a.cz",
      "a-.cz",
      ".cz",
      "a..cz",
      "a.c",
      "ex_ample.cz",
    ])
      expect(normalizeDomain(bad), bad).toBeNull();
    expect(normalizeDomain(`${"a".repeat(64)}.cz`)).toBeNull();
  });
});

describe("hromadné vložení domén (DOM-04)", () => {
  it("rozebere řádky, oddělovače, komentáře a prázdné řádky", () => {
    const r = parseDomainList(
      [
        "firma.cz",
        "",
        "https://www.druha.cz/",
        "tretí, ctvrta.cz; pata.cz # poznámka",
        "# jen komentář",
        "neni domena",
      ].join("\n"),
    );
    expect(r.valid).toEqual(["firma.cz", "druha.cz", "ctvrta.cz", "pata.cz"]);
    expect(r.invalid).toEqual(["tretí", "neni", "domena"]);
    expect(r.duplicates).toEqual([]);
    expect(r.truncated).toBe(false);
  });

  it("opakování v zadání nahlásí a nevloží dvakrát (i s jiným zápisem)", () => {
    const r = parseDomainList("firma.cz\nFIRMA.cz\nhttp://www.firma.cz/x\nnova.cz");
    expect(r.valid).toEqual(["firma.cz", "nova.cz"]);
    expect(r.duplicates).toEqual(["firma.cz", "firma.cz"]);
  });

  it("zvládne Windows konce řádků a omezí počet zápisů", () => {
    expect(parseDomainList("a.cz\r\nb.cz\r\n").valid).toEqual(["a.cz", "b.cz"]);
    const many = Array.from({ length: BULK_DOMAIN_LIMIT + 5 }, (_, i) => `d${i}.cz`).join("\n");
    const r = parseDomainList(many);
    expect(r.valid).toHaveLength(BULK_DOMAIN_LIMIT);
    expect(r.truncated).toBe(true);
    expect(parseDomainList(many, 3).valid).toHaveLength(3);
  });

  it("prázdný text nedá nic", () => {
    expect(parseDomainList("  \n\n")).toEqual({
      valid: [],
      duplicates: [],
      invalid: [],
      truncated: false,
    });
  });
});
