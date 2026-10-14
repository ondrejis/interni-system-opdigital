import { describe, expect, it } from "vitest";
import { emailList } from "../settings";
import {
  DEFAULT_MAIL_TEMPLATES,
  dispatchBlocker,
  mailVariables,
  renderMailText,
  renderTemplate,
  unknownVariables,
  MAIL_VARIABLES,
} from "./templates";

const inv = {
  number: "FV-2026-0012",
  kind: "partial",
  currency: "CZK",
  grossMinor: 12_540_000,
  paidMinor: 540_000,
  dueDate: "2026-10-01",
  variableSymbol: "20260012",
  customerName: "Stavby Novák s.r.o.",
  jobNumber: "Z-2026-014",
  bankAccount: "19-2000145399/0800",
};

describe("šablony e-mailů", () => {
  it("dosadí proměnné, neznámé nechá, prázdné vymaže", () => {
    expect(
      renderTemplate("Faktura {cislo} / {neznama} / [{zakazka}]", { cislo: "A1", zakazka: "" }),
    ).toBe("Faktura A1 / {neznama} / []");
    expect(renderTemplate("{cislo}{cislo}", { cislo: "x" })).toBe("xx");
  });

  it("hodnoty se nikdy nevyhodnocují (žádné vnořené dosazování)", () => {
    expect(renderTemplate("{nazev_firmy}", { nazev_firmy: "{cislo}", cislo: "TAJNE" })).toBe(
      "{cislo}",
    );
  });

  it("najde překlepy v proměnných", () => {
    expect(
      unknownVariables("Dobrý den {cislo}, {castak} a {castak} a {dnu_po_splatnosti}"),
    ).toEqual(["castak"]);
    expect(unknownVariables("bez proměnných")).toEqual([]);
  });

  it("výchozí šablony používají jen známé proměnné a neobsahují interní název", () => {
    for (const t of Object.values(DEFAULT_MAIL_TEMPLATES)) {
      expect(unknownVariables(t)).toEqual([]);
      expect(t.toLowerCase()).not.toContain("rebar");
    }
    expect(DEFAULT_MAIL_TEMPLATES.invoiceBody).toContain("{cislo}");
    expect(DEFAULT_MAIL_TEMPLATES.invoiceBody).toContain("{variabilni_symbol}");
    expect(MAIL_VARIABLES.map((v) => v.key)).toEqual(
      expect.arrayContaining(["cislo", "castka", "splatnost", "nazev_firmy", "variabilni_symbol"]),
    );
  });

  it("hodnoty proměnných dokladu: částky, datum, dny po splatnosti", () => {
    const v = mailVariables(inv, "Moje firma s.r.o.", "2026-10-06");
    expect(v.cislo).toBe("FV-2026-0012");
    expect(v.castka).toBe("125 400 Kč");
    expect(v.zbyva).toBe("120 000 Kč");
    expect(v.splatnost).toBe("1. 10. 2026");
    expect(v.dnu_po_splatnosti).toBe("5");
    expect(v.druh).toBe("Faktura");
    expect(v.dodavatel).toBe("Moje firma s.r.o.");
    expect(
      mailVariables({ ...inv, dueDate: "2026-10-10" }, "x", "2026-10-06").dnu_po_splatnosti,
    ).toBe("0");
    expect(mailVariables({ ...inv, kind: "proforma" }, "x", "2026-10-06").druh).toBe(
      "Zálohová faktura",
    );
    expect(
      mailVariables({ ...inv, dueDate: null, number: null }, "x", "2026-10-06").splatnost,
    ).toBe("");
  });

  it("výsledný předmět je jednořádkový a text má sjednocené konce řádků", () => {
    const r = renderMailText(
      { subject: "Faktura\n{cislo}", body: "Dobrý den,\r\n\r\n{cislo}\r\n" },
      { cislo: "A1" },
    );
    expect(r.subject).toBe("Faktura A1");
    expect(r.body).toBe("Dobrý den,\n\nA1");
  });

  it("výchozí upomínka obsahuje všechny údaje, které věřitel potřebuje", () => {
    const v = mailVariables(inv, "Moje firma s.r.o.", "2026-10-06");
    const m = renderMailText(
      {
        subject: DEFAULT_MAIL_TEMPLATES.reminderSubject,
        body: DEFAULT_MAIL_TEMPLATES.reminderBody,
      },
      v,
    );
    expect(m.subject).toBe("Upomínka: Faktura FV-2026-0012 po splatnosti");
    for (const s of [
      "FV-2026-0012",
      "120 000 Kč",
      "1. 10. 2026",
      "5 dní",
      "19-2000145399/0800",
      "20260012",
      "Moje firma s.r.o.",
    ])
      expect(m.body).toContain(s);
    expect(m.body).not.toMatch(/\{[a-z_]+\}/);
  });

  it("seznam kopií: čárky, středníky, mezery", () => {
    expect(emailList("a@x.cz, b@x.cz;c@x.cz  d@x.cz")).toEqual([
      "a@x.cz",
      "b@x.cz",
      "c@x.cz",
      "d@x.cz",
    ]);
    expect(emailList("")).toEqual([]);
  });
});

describe("kdy lze odeslat", () => {
  const today = "2026-10-09";
  it("koncept nejde odeslat", () => {
    expect(
      dispatchBlocker("invoice", { state: "draft", kind: "partial", dueDate: null }, today),
    ).toMatch(/Koncept/);
  });
  it("vystavený doklad jde odeslat vždy, i uhrazený", () => {
    for (const state of ["issued", "partial", "paid", "credited"])
      expect(
        dispatchBlocker("invoice", { state, kind: "partial", dueDate: "2026-12-01" }, today),
      ).toBeNull();
  });
  it("upomínka jen po splatnosti a jen neuhrazeným dokladům", () => {
    expect(
      dispatchBlocker(
        "reminder",
        { state: "issued", kind: "partial", dueDate: "2026-10-08" },
        today,
      ),
    ).toBeNull();
    expect(
      dispatchBlocker(
        "reminder",
        { state: "partial", kind: "final", dueDate: "2026-09-01" },
        today,
      ),
    ).toBeNull();
    expect(
      dispatchBlocker(
        "reminder",
        { state: "issued", kind: "partial", dueDate: "2026-10-09" },
        today,
      ),
    ).toMatch(/po splatnosti/);
    expect(
      dispatchBlocker("reminder", { state: "issued", kind: "partial", dueDate: null }, today),
    ).toMatch(/po splatnosti/);
    expect(
      dispatchBlocker("reminder", { state: "paid", kind: "partial", dueDate: "2026-01-01" }, today),
    ).toMatch(/uhrazený/);
    expect(
      dispatchBlocker(
        "reminder",
        { state: "credited", kind: "partial", dueDate: "2026-01-01" },
        today,
      ),
    ).toMatch(/dobropisem/);
    expect(
      dispatchBlocker(
        "reminder",
        { state: "issued", kind: "credit_note", dueDate: "2026-01-01" },
        today,
      ),
    ).toMatch(/dobropisu/);
  });
});
