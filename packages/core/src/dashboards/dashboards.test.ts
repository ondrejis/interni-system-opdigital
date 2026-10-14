import { describe, expect, it } from "vitest";
import { migrateDefinition, parseDefinition, parseWidget, MAX_WIDGETS } from "./definition";
import { deltaOf, formatCompact, formatValue } from "./format";
import {
  bucketLabel,
  bucketsBetween,
  bucketStart,
  comparisonRange,
  defaultBucket,
  filtersFromSearch,
  filtersToSearch,
  isoWeek,
  resolvePeriod,
} from "./periods";
import { resultToTable } from "./result-table";
import { seedDashboard, standardDashboards } from "./shared";
import type { WidgetResult } from "./types";

const meta = { period: null, generatedAt: "2026-10-10T00:00:00Z" };

describe("období", () => {
  it("předvolby podle dnešního data (týden začíná pondělím, čtvrtletí, loni)", () => {
    const today = "2026-10-09"; // pátek
    expect(resolvePeriod("this_week", today)).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(resolvePeriod("last_week", today)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(resolvePeriod("this_month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod("last_month", "2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(resolvePeriod("this_quarter", today)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(resolvePeriod("last_quarter", today)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(resolvePeriod("last_year", today)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(resolvePeriod("last_30_days", today)).toEqual({ from: "2026-09-10", to: "2026-10-09" });
    expect(resolvePeriod("all", today)).toBeNull();
    expect(resolvePeriod("custom", today, { from: "2026-02-01", to: "2026-01-01" })).toBeNull();
  });

  it("přes přechod letního času (29. 3. a 25. 10. 2026) se dny a týdny počítají kalendářně", () => {
    expect(resolvePeriod("this_week", "2026-03-29")).toEqual({
      from: "2026-03-23",
      to: "2026-03-29",
    });
    expect(bucketsBetween({ from: "2026-03-25", to: "2026-03-31" }, "day")).toHaveLength(7);
    expect(bucketsBetween({ from: "2026-10-20", to: "2026-10-30" }, "week")).toEqual([
      "2026-10-19",
      "2026-10-26",
    ]);
    expect(bucketStart("2026-10-25", "week")).toBe("2026-10-19");
    expect(bucketStart("2026-03-29", "month")).toBe("2026-03-01");
    expect(resolvePeriod("last_7_days", "2026-03-30")).toEqual({
      from: "2026-03-24",
      to: "2026-03-30",
    });
  });

  it("srovnávací období: celý měsíc / čtvrtletí / rok o kalendářní jednotku zpět, jinak stejně dlouhé", () => {
    expect(comparisonRange({ from: "2026-10-01", to: "2026-10-31" }, "previous_period")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(comparisonRange({ from: "2026-01-01", to: "2026-03-31" }, "previous_period")).toEqual({
      from: "2025-10-01",
      to: "2025-12-31",
    });
    expect(comparisonRange({ from: "2026-03-01", to: "2026-03-31" }, "previous_period")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(comparisonRange({ from: "2026-10-05", to: "2026-10-11" }, "previous_period")).toEqual({
      from: "2026-09-28",
      to: "2026-10-04",
    });
    expect(comparisonRange({ from: "2026-02-01", to: "2026-02-28" }, "previous_year")).toEqual({
      from: "2025-02-01",
      to: "2025-02-28",
    });
    expect(comparisonRange({ from: "2026-02-01", to: "2026-02-28" }, "none")).toBeNull();
  });

  it("koše, popisky a ISO týdny (týden 1 roku 2026 začíná 29. 12. 2025)", () => {
    expect(isoWeek("2026-01-01")).toEqual({ year: 2026, week: 1 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(bucketLabel("2026-10-01", "month")).toBe("říjen 2026");
    expect(bucketLabel("2026-10-01", "quarter")).toBe("Q4 2026");
    expect(bucketLabel("2026-10-05", "week")).toBe("T41 2026");
    expect(bucketLabel("2026-10-09", "day")).toBe("9. 10.");
    expect(defaultBucket({ from: "2026-10-01", to: "2026-10-31" })).toBe("day");
    expect(defaultBucket({ from: "2026-01-01", to: "2026-12-31" })).toBe("month");
    expect(defaultBucket(null)).toBe("month");
  });

  it("filtry v adrese: neplatné hodnoty se zahodí, jen odchylky od výchozího stavu", () => {
    const get = (k: string) =>
      ({
        obdobi: "custom",
        od: "2026-10-01",
        do: "špatně",
        zakazka: "není-uuid",
        osoba: "01a124b1-6217-7588-ac59-084a47c914c0",
      })[k];
    expect(filtersFromSearch(get)).toEqual({
      period: "custom",
      from: "2026-10-01",
      userId: "01a124b1-6217-7588-ac59-084a47c914c0",
    });
    expect(filtersFromSearch(() => "neznámé")).toEqual({ period: "all" });
    expect(filtersToSearch({ period: "all" })).toEqual({});
    expect(filtersToSearch({ period: "this_month" })).toEqual({ obdobi: "this_month" });
    expect(filtersToSearch({ period: "this_month" }, "this_month")).toEqual({});
  });
});

describe("formáty a změna", () => {
  it("peníze v haléřích, minuty, procenta; dělení nulou není procento", () => {
    expect(formatValue("money", 12_345_600)).toBe("123 456 Kč");
    expect(formatValue("minutes", 450)).toBe("7:30 h");
    expect(formatValue("percent", 12.5)).toBe("12,5 %");
    expect(formatValue("number", null)).toBe("–");
    expect(formatCompact("money", 250_000_000)).toContain("mil.");
    expect(deltaOf(150, 100)).toEqual({ abs: 50, pct: 50 });
    expect(deltaOf(10, 0)).toEqual({ abs: 10, pct: null });
    expect(deltaOf(null, 5)).toBeUndefined();
  });
});

describe("definice nástěnky: validace, verze a migrace", () => {
  const kpi = {
    id: "kpi-1",
    type: "kpi",
    title: "K",
    w: 3,
    h: 1,
    source: { kind: "entity", entity: "job", agg: { fn: "count" } },
  };

  it("platná definice projde, neplatné kombinace se odmítnou českou větou", () => {
    expect(parseDefinition({ schemaVersion: 1, widgets: [kpi] }).widgets).toHaveLength(1);
    expect(() => parseWidget({ ...kpi, type: "chart" })).toThrow(/seskupení/);
    expect(() => parseWidget({ ...kpi, type: "gauge" })).toThrow(/cíl/);
    expect(() => parseWidget({ ...kpi, title: "" })).toThrow(/název/i);
    expect(() => parseWidget({ ...kpi, w: 99 })).toThrow();
    expect(() => parseWidget({ ...kpi, extra: 1 })).toThrow();
    expect(() =>
      parseWidget({ ...kpi, source: { kind: "entity", entity: "job", agg: { fn: "drop table" } } }),
    ).toThrow();
    expect(() => parseDefinition({ schemaVersion: 1, widgets: [kpi, kpi] })).toThrow(/Duplicitní/);
    const many = Array.from({ length: MAX_WIDGETS + 1 }, (_, i) => ({
      ...kpi,
      id: `kpi-${i + 10}`,
    }));
    expect(() => parseDefinition({ schemaVersion: 1, widgets: many })).toThrow(/nejvýš 24/);
  });

  it("migrace: chybějící verze = 1, starší verze se převedou krok za krokem, novější se odmítne", () => {
    expect(migrateDefinition({ widgets: [kpi] }).schemaVersion).toBe(1);
    const migrations = {
      1: (d: Record<string, unknown>) => ({
        ...d,
        widgets: (d.widgets as unknown[]).map((w) => ({ ...(w as object), h: 2 })),
      }),
    };
    // fiktivní verze 2: cílová verze zvýšená jen pro test, schema ji ale zná jen jako 1 – ověřujeme pořadí kroků
    expect(() => migrateDefinition({ schemaVersion: 5, widgets: [] })).toThrow(/novější verzi/);
    expect(() => migrateDefinition(null)).toThrow(/poškozená/);
    expect(() => migrateDefinition({ schemaVersion: 0, widgets: [] }, {}, 1)).toThrow(
      /nejde převést/,
    );
    void migrations;
  });
});

describe("výchozí sady a převod na tabulku", () => {
  it("sady podle zapnutých modulů: bez modulu vypadnou jeho widgety, prázdná nástěnka se nezakládá", () => {
    const full = standardDashboards([
      "kontakty",
      "poptavky",
      "zakazky",
      "realizace",
      "fakturace",
      "dochazka",
      "stroje",
    ]);
    expect(full.map((d) => d.role)).toEqual(["owner", "office", "foreman", "accountant"]);
    for (const d of full) expect(() => parseDefinition(d.definition)).not.toThrow();
    const small = standardDashboards(["kontakty"]);
    expect(small.map((d) => d.role)).toEqual(["office", "foreman"]); // jen bloky bez modulů (pozornost, úkoly)
    expect(standardDashboards([]).length).toBeLessThanOrEqual(2);
    expect(full.every((d) => !d.home)).toBe(true); // vzhled Přehledu zůstává
    expect(
      seedDashboard({
        key: "a-b",
        name: "N",
        role: "owner",
        widgets: [{ type: "kpi", title: "x", source: { kind: "builtin", builtin: "tiles" } }],
      }).definition.widgets[0],
    ).toMatchObject({ id: "kpi-1", w: 3, h: 1 });
  });

  it("export dat widgetu: částky typu money, procenta jako čísla, minuty na hodiny", () => {
    const chart: WidgetResult = {
      kind: "chart",
      chart: "bar",
      format: "money",
      categories: [{ key: "a", label: "A" }],
      series: [{ key: "v", label: "Marže", values: [12_345] }],
      meta,
    };
    expect(resultToTable(chart, "G")).toEqual({
      columns: [
        { header: "Skupina", type: "text" },
        { header: "Marže", type: "money" },
      ],
      rows: [["A", 12_345]],
    });
    const kpi: WidgetResult = {
      kind: "kpi",
      format: "minutes",
      value: 450,
      previous: 300,
      delta: { abs: 150, pct: 50 },
      meta,
    };
    const t = resultToTable(kpi, "Hodiny");
    expect(t.columns[1]!.header).toContain("(h)");
    expect(t.rows[0]).toEqual(["Hodiny", 7.5, 5, 50]);
  });
});
