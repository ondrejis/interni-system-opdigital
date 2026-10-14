import type { AttributeDescriptor, AttributeType } from "@rebar/core/shared";
import { describe, expect, it } from "vitest";
import { markBaseline, sameCondition, sectionFilterAttributes } from "./filter-attributes";

const attr = (
  key: string,
  type: AttributeType,
  extra: Partial<AttributeDescriptor> = {},
): AttributeDescriptor => ({
  key,
  label: key,
  type,
  custom: false,
  readonly: false,
  required: false,
  sortable: true,
  filterable: true,
  aggregate: false,
  defaultVisible: true,
  width: 120,
  ...extra,
});

const ATTRS = [
  attr("title", "text"),
  attr("phase", "select"),
  attr("value", "currency"),
  attr("endDate", "date"),
  attr("manager", "user"),
  attr("note", "longtext", { filterable: false }),
  attr("custom.kind", "select", { custom: true }),
  attr("orphan", "number"),
];

describe("sectionFilterAttributes", () => {
  it("bez skupin rozdělí podle typu a vlastní pole dá zvlášť na konec", () => {
    const s = sectionFilterAttributes(ATTRS);
    expect(s.map((x) => [x.label, x.attributes.map((a) => a.key)])).toEqual([
      ["Text", ["title"]],
      ["Čísla a částky", ["value", "orphan"]],
      ["Data", ["endDate"]],
      ["Stav a výběr", ["phase"]],
      ["Lidé a vazby", ["manager"]],
      ["Vlastní pole", ["custom.kind"]],
    ]);
  });

  it("nefiltrovatelné atributy se vynechají", () => {
    const keys = sectionFilterAttributes(ATTRS).flatMap((s) => s.attributes.map((a) => a.key));
    expect(keys).not.toContain("note");
  });

  it("podle zadaných skupin: zachová pořadí, přeskočí chybějící klíče a zbytek dá do Ostatní", () => {
    const s = sectionFilterAttributes(ATTRS, [
      { id: "deal", label: "Obchod", attrs: ["phase", "missing", "title"] },
      { id: "dates", label: "Termíny", attrs: ["endDate"] },
      { id: "empty", label: "Prázdná", attrs: ["nothing"] },
    ]);
    expect(s.map((x) => [x.id, x.attributes.map((a) => a.key)])).toEqual([
      ["deal", ["phase", "title"]],
      ["dates", ["endDate"]],
      ["other", ["value", "manager", "orphan"]],
      ["custom", ["custom.kind"]],
    ]);
  });

  it("atribut je jen v první skupině, která ho uvádí", () => {
    const s = sectionFilterAttributes(ATTRS, [
      { id: "a", label: "A", attrs: ["title"] },
      { id: "b", label: "B", attrs: ["title", "phase"] },
    ]);
    expect(s.find((x) => x.id === "b")?.attributes.map((a) => a.key)).toEqual(["phase"]);
  });
});

describe("sameCondition / markBaseline", () => {
  it("porovnává atribut, operátor i hodnotu", () => {
    expect(
      sameCondition(
        { attr: "phase", op: "is_any_of", value: ["a", "b"] },
        { attr: "phase", op: "is_any_of", value: ["a", "b"] },
      ),
    ).toBe(true);
    expect(
      sameCondition(
        { attr: "phase", op: "is_any_of", value: ["a"] },
        { attr: "phase", op: "is_any_of", value: ["a", "b"] },
      ),
    ).toBe(false);
  });

  it("označí podmínky, které jsou ve výchozím filtru", () => {
    const base = {
      op: "and" as const,
      conditions: [{ attr: "crmArchivedAt", op: "empty" as const }],
    };
    const now = {
      op: "and" as const,
      conditions: [
        { attr: "crmArchivedAt", op: "empty" as const },
        { attr: "manager", op: "is_me" as const },
      ],
    };
    expect(markBaseline(now, base)).toEqual([true, false]);
    expect(markBaseline(now, undefined)).toEqual([false, false]);
    expect(markBaseline(undefined, base)).toEqual([]);
  });
});
