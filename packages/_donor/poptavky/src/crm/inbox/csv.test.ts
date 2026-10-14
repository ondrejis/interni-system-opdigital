import { describe, expect, it } from "vitest";
import {
  defuseCell,
  detectDelimiter,
  guessMapping,
  parseCsv,
  parseMoneyMinor,
  stripControlChars,
} from "./csv";

describe("parseCsv", () => {
  it("Excel CSV: středník, BOM, uvozovky s oddělovačem a odřádkováním uvnitř buňky", () => {
    const text =
      '﻿Jméno;Zpráva;Telefon\r\n"Novák; Jan";"Dobrý den,\nrád bych poptal";777 111 222\r\n\r\nSvoboda;"Řekl ""ahoj""";\r\n';
    expect(parseCsv(text)).toEqual([
      ["Jméno", "Zpráva", "Telefon"],
      ["Novák; Jan", "Dobrý den,\nrád bych poptal", "777 111 222"],
      ["Svoboda", 'Řekl "ahoj"', ""],
    ]);
  });
  it("rozpozná čárku a tabulátor; oddělovač v uvozovkách hlavičku nezmate", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter('"a;b",c,d')).toBe(",");
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("prázdný soubor a soubor bez konce řádku", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("a;b")).toEqual([["a", "b"]]);
  });
});

describe("mapování sloupců", () => {
  it("navrhne pole podle názvů bez diakritiky a velikosti písmen; každé pole jednou", () => {
    expect(
      guessMapping([
        "Jméno kontaktu",
        "E-mail",
        "Telefon",
        "Firma",
        "Poznámka",
        "Neznámý",
        "Email",
      ]),
    ).toEqual(["name", "email", "phone", "company", "message", null, null]);
    expect(guessMapping(["utm_source", "UTM campaign", "Odhad hodnoty"])).toEqual([
      "sourceChannel",
      "campaign",
      "value",
    ]);
  });
});

describe("ochrana buněk", () => {
  it("vzorce dostanou apostrof, běžný text a řídicí znaky se ošetří", () => {
    expect(defuseCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(defuseCell("  @cmd")).toBe("'@cmd");
    expect(defuseCell("+420 777")).toBe("'+420 777");
    expect(defuseCell("-5")).toBe("'-5");
    expect(defuseCell("Dobrý den")).toBe("Dobrý den");
    expect(defuseCell("a\u0007b")).toBe("ab");
    expect(stripControlChars("a\nb\u0000c", true)).toBe("a\nbc");
    expect(stripControlChars("a\nb", false)).toBe("ab");
  });
  it("částky: tisíce, desetinná čárka, měna; nesmysl je null", () => {
    expect(parseMoneyMinor("150 000")).toBe(15_000_000);
    expect(parseMoneyMinor("150000,50 Kč")).toBe(15_000_050);
    expect(parseMoneyMinor("1.200.000")).toBe(120_000_000);
    expect(parseMoneyMinor("12,5")).toBe(1250);
    expect(parseMoneyMinor("hodně")).toBeNull();
    expect(parseMoneyMinor("")).toBeNull();
  });
});
