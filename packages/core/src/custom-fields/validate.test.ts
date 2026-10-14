import { describe, expect, it } from "vitest";
import { validateCustomValues, type FieldDef } from "./validate";
import { UserError } from "../rbac/errors";

const def = (key: string, type: FieldDef["type"], extra: Partial<FieldDef> = {}): FieldDef => ({
  key,
  label: key.toUpperCase(),
  type,
  options: {},
  required: false,
  ...extra,
});
const choices = {
  choices: [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ],
};
const uuid = "0198f0c0-1111-7222-8333-444455556666";

describe("validateCustomValues", () => {
  it("normalizuje hodnoty všech 12 typů", () => {
    const defs = [
      def("t", "text"),
      def("n", "number"),
      def("c", "currency"),
      def("d", "date"),
      def("s", "select", { options: choices }),
      def("m", "multiselect", { options: choices }),
      def("u", "user"),
      def("r", "record", { options: { entityType: "job" } }),
      def("k", "checkbox"),
      def("w", "url"),
      def("p", "phone"),
      def("e", "email"),
    ];
    const out = validateCustomValues(defs, {
      t: "  ahoj ",
      n: 1.5,
      c: 125000,
      d: "2026-10-08",
      s: "a",
      m: ["a", "b", "a"],
      u: uuid.toUpperCase(),
      r: uuid,
      k: false,
      w: " https://example.cz/x ",
      p: "+420 777 123 456",
      e: " Jana@Firma.CZ ",
    });
    expect(out).toEqual({
      t: "ahoj",
      n: 1.5,
      c: 125000,
      d: "2026-10-08",
      s: "a",
      m: ["a", "b"],
      u: uuid,
      r: uuid,
      k: false,
      w: "https://example.cz/x",
      p: "+420777123456",
      e: "jana@firma.cz",
    });
  });

  it.each([
    [def("n", "number"), "5", /musí být číslo/],
    [def("c", "currency"), 12.5, /haléřích/],
    [def("d", "date"), "8. 10. 2026", /datum/],
    [def("d", "date"), "2026-13-45", /datum/],
    [def("s", "select", { options: choices }), "x", /nabízených/],
    [def("m", "multiselect", { options: choices }), ["a", "x"], /nenabízenou/],
    [def("u", "user"), "není-uuid", /odkazovat/],
    [def("k", "checkbox"), "ano", /ano\/ne/],
    [def("w", "url"), "javascript:alert(1)", /platná adresa/],
    [def("w", "url"), "ftp://x.cz", /platná adresa/],
    [def("p", "phone"), "123", /telefonní/],
    [def("e", "email"), "bez zavináče", /e-mail/],
    [def("t", "text"), "x".repeat(2001), /příliš dlouhé/],
  ])("odmítne špatnou hodnotu %#", (d, value, message) => {
    expect(() => validateCustomValues([d], { [d.key]: value })).toThrow(message);
  });

  it("neznámý klíč je chyba, prázdná hodnota pole odstraní", () => {
    const defs = [def("t", "text")];
    expect(() => validateCustomValues(defs, { tt: "překlep" })).toThrow(/Neznámé pole „tt“/);
    expect(validateCustomValues(defs, { t: "" })).toEqual({});
    expect(validateCustomValues(defs, { t: null })).toEqual({});
  });

  it("povinné pole: při založení chybí = chyba; při částečné úpravě jen když ho zadání maže", () => {
    const defs = [def("t", "text", { required: true }), def("n", "number")];
    expect(() => validateCustomValues(defs, { n: 1 })).toThrow(/„T“ je povinné/);
    expect(validateCustomValues(defs, { n: 2 }, { partial: true })).toEqual({ n: 2 });
    expect(() => validateCustomValues(defs, { t: "" }, { partial: true })).toThrow(/povinné/);
  });

  it("vypíše všechny chyby najednou jako UserError", () => {
    const defs = [def("n", "number"), def("e", "email")];
    try {
      validateCustomValues(defs, { n: "x", e: "y" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UserError);
      expect((err as Error).message).toContain("„N“");
      expect((err as Error).message).toContain("„E“");
    }
  });
});
