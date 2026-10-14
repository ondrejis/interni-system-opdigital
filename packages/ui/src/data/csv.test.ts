import type { AttributeDescriptor, Labels, RecordRow } from "@rebar/core/shared";
import { describe, expect, it } from "vitest";
import { buildCsv } from "./csv";

const attr = (
  a: Partial<AttributeDescriptor> & Pick<AttributeDescriptor, "key" | "label" | "type">,
) =>
  ({
    custom: true,
    readonly: false,
    required: false,
    sortable: true,
    filterable: true,
    aggregate: false,
    defaultVisible: true,
    width: 160,
    ...a,
  }) as AttributeDescriptor;

describe("export CSV s vlastními poli", () => {
  const cols = [
    attr({ key: "name", label: "Název", type: "text", custom: false }),
    attr({ key: "custom.smlouva", label: "Číslo smlouvy", type: "text" }),
    attr({ key: "custom.plocha", label: "Plocha", type: "number" }),
    attr({ key: "custom.cena", label: "Cena", type: "currency" }),
    attr({ key: "custom.od", label: "Od", type: "date" }),
    attr({
      key: "custom.typ",
      label: "Typ",
      type: "select",
      choices: [{ value: "dum", label: "Rodinný dům" }],
    }),
    attr({
      key: "custom.stitky",
      label: "Štítky",
      type: "multiselect",
      choices: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    }),
    attr({ key: "custom.garant", label: "Garant", type: "user" }),
    attr({ key: "custom.ok", label: "Schváleno", type: "checkbox" }),
  ];
  const row: RecordRow = {
    id: "1",
    updatedAt: "2026-10-09T10:00:00.000Z",
    name: 'Dům; "Nový"',
    "custom.smlouva": "S-2026/7",
    "custom.plocha": 120.5,
    "custom.cena": 1_234_500,
    "custom.od": "2026-10-01",
    "custom.typ": "dum",
    "custom.stitky": ["a", "b"],
    "custom.garant": "u1",
    "custom.ok": true,
  };
  const labels: Labels = { "custom.garant": { u1: { label: "Jan Novák" } } };

  it("vlastní pole jsou sloupce se stejnou podobou hodnot jako v tabulce", () => {
    const csv = buildCsv(cols, [row], labels);
    const [head, line] = csv.replace("﻿", "").split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(head).toBe("Název;Číslo smlouvy;Plocha;Cena;Od;Typ;Štítky;Garant;Schváleno");
    expect(line).toContain('"Dům; ""Nový"""');
    expect(line).toContain("S-2026/7");
    expect(line).toContain("Rodinný dům");
    expect(line).toContain("A, B");
    expect(line).toContain("Jan Novák");
    expect(line!.endsWith("ano")).toBe(true);
  });

  it("prázdné vlastní pole je prázdná buňka", () => {
    const csv = buildCsv(cols, [{ id: "2", updatedAt: "x", name: "Bez polí" }], labels);
    expect(csv.replace("﻿", "").split("\r\n")[1]).toBe("Bez polí;;;;;;;;");
  });
});

describe("export CSV: ochrana proti vzorcům", () => {
  it("text začínající = + - @ dostane apostrof, číslo a datum ne", () => {
    const cols = [
      attr({ key: "name", label: "Název", type: "text", custom: false }),
      attr({ key: "custom.cena", label: "Cena", type: "currency" }),
    ];
    const csv = buildCsv(
      cols,
      [
        { id: "1", updatedAt: "x", name: '=HYPERLINK("http://zlo")', "custom.cena": 12_300 },
        { id: "2", updatedAt: "x", name: "+420 123", "custom.cena": 100 },
        { id: "3", updatedAt: "x", name: "@cmd", "custom.cena": 100 },
        { id: "4", updatedAt: "x", name: "-1+1", "custom.cena": 100 },
        { id: "5", updatedAt: "x", name: "Novák", "custom.cena": 100 },
      ],
      {},
    );
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[1]).toBe('"\'=HYPERLINK(""http://zlo"")";123\u00a0Kč');
    expect(lines[2]!.startsWith("'+420 123")).toBe(true);
    expect(lines[3]!.startsWith("'@cmd")).toBe(true);
    expect(lines[4]!.startsWith("'-1+1")).toBe(true);
    expect(lines[5]!.startsWith("Novák")).toBe(true);
  });
});
