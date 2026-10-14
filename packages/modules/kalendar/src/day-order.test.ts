import { describe, expect, it } from "vitest";
import { dayComparator, type OrderedItem } from "./day-order";

const ev = (title: string, start: string, end: string, over: Partial<OrderedItem> = {}) =>
  ({
    kind: "event",
    title,
    start,
    end,
    allDay: false,
    own: true,
    ...over,
  }) satisfies OrderedItem;
const order = (day: string, now: string | null, items: OrderedItem[]) =>
  [...items].sort(dayComparator(day, now)).map((i) => i.title);

describe("pořadí položek dne", () => {
  const D = "2026-10-12";
  it("vlastní události před pozvanými, ty před obsazeností, vrstvami a svátky", () => {
    const items: OrderedItem[] = [
      { ...ev("Svátek", D, D, { kind: "holiday", allDay: true, own: false }) },
      ev("Vrstva", `${D}T07:00`, `${D}T08:00`, { kind: "layer", own: false }),
      ev("Obsazeno", `${D}T07:30`, `${D}T08:30`, { kind: "busy", own: false }),
      ev("Pozvaný", `${D}T08:00`, `${D}T09:00`, { own: false }),
      ev("Vlastní odpoledne", `${D}T15:00`, `${D}T16:00`),
      ev("Vlastní ráno", `${D}T09:00`, `${D}T10:00`),
    ];
    expect(order(D, null, items)).toEqual([
      "Vlastní ráno",
      "Vlastní odpoledne",
      "Pozvaný",
      "Obsazeno",
      "Vrstva",
      "Svátek",
    ]);
  });

  it("celodenní událost je před časovou", () => {
    const items = [
      ev("Schůzka", `${D}T09:00`, `${D}T10:00`),
      ev("Celý den", D, D, { allDay: true }),
    ];
    expect(order(D, null, items)).toEqual(["Celý den", "Schůzka"]);
  });

  it("dnes jdou nejbližší (neskončené) před skončenými, jindy podle času", () => {
    const items = [
      ev("Ráno", `${D}T08:00`, `${D}T09:00`),
      ev("Poledne", `${D}T12:00`, `${D}T13:00`),
      ev("Večer", `${D}T18:00`, `${D}T19:00`),
    ];
    expect(order(D, `${D}T12:30`, items)).toEqual(["Poledne", "Večer", "Ráno"]);
    // jiný den než dnes: čistě podle času
    expect(order("2026-10-13", `${D}T12:30`, items)).toEqual(["Ráno", "Poledne", "Večer"]);
  });

  it("vícedenní událost, která dnes ještě trvá, se za skončenou nepovažuje", () => {
    const items = [
      ev("Včerejší konec", `${D}T06:00`, `${D}T07:00`),
      ev("Vícedenní", "2026-10-11T22:00", "2026-10-13T10:00"),
    ];
    expect(order(D, `${D}T12:00`, items)).toEqual(["Vícedenní", "Včerejší konec"]);
  });
});
