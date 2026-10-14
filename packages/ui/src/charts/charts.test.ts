import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { layoutBars } from "./bar-layout";
import { arcPath, barPath, markerPath, SERIES_SHAPES } from "./geometry";
import { layoutLine } from "./line-layout";
import {
  axisTickLabel,
  labelVisible,
  linearScale,
  niceScale,
  niceStep,
  planCategoryLabels,
  stackSegments,
  truncateLabel,
  valueExtent,
} from "./scale";
import { gaugeState, prepareSlices, seriesColor } from "./series";
import { BarChart, CHART_EMPTY_TEXT, DonutChart, Gauge, LineChart, Sparkline } from "./index";
import type { ChartCategory, ChartSeries } from "./types";

const cats = (labels: string[]): ChartCategory[] => labels.map((l) => ({ key: l, label: l }));
const count = (html: string, needle: string) => html.split(needle).length - 1;
const noBad = (s: string) => {
  expect(s).not.toMatch(/NaN|Infinity|undefined/);
};

describe("niceScale", () => {
  it("samé nuly dá osu 0–1", () => {
    const s = niceScale(0, 0);
    expect(s.min).toBe(0);
    expect(s.max).toBe(1);
    expect(s.ticks[0]).toBe(0);
  });

  it("jediná kladná hodnota začíná nulou a pokrývá hodnotu", () => {
    const s = niceScale(1234, 1234);
    expect(s.min).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(1234);
    expect(s.ticks).toEqual([...s.ticks].sort((a, b) => a - b));
    expect(s.ticks).toContain(0);
  });

  it("jediná záporná hodnota končí nulou", () => {
    const s = niceScale(-70, -70);
    expect(s.max).toBe(0);
    expect(s.min).toBeLessThanOrEqual(-70);
  });

  it("záporné a kladné hodnoty mají v ose nulu", () => {
    const s = niceScale(-130, 480);
    expect(s.ticks).toContain(0);
    expect(s.min).toBeLessThanOrEqual(-130);
    expect(s.max).toBeGreaterThanOrEqual(480);
  });

  it("velké částky v haléřích mají kulatý krok a žádný šum desetinných míst", () => {
    const s = niceScale(0, 123_456_789, { count: 5 });
    expect(s.step).toBe(50_000_000);
    expect(s.ticks).toEqual([0, 50_000_000, 100_000_000, 150_000_000]);
    for (const t of s.ticks) expect(Number.isInteger(t)).toBe(true);
  });

  it("drobné hodnoty nenasbírají chybu plovoucí řádové čárky", () => {
    const s = niceScale(0, 0.3, { count: 4 });
    expect(s.ticks.every((t) => Number(t.toFixed(10)) === t)).toBe(true);
    expect(s.step).toBe(0.1);
  });

  it("minuty mají časové kroky (15, 30, 60 min), ne 100", () => {
    expect(niceStep(12, "minutes")).toBe(15);
    expect(niceStep(100, "minutes")).toBe(120);
    expect(niceStep(700, "minutes")).toBe(1200);
    const s = niceScale(0, 450, { count: 5, unit: "minutes" });
    expect(s.step % 15).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(450);
  });

  it("bez nuly (čárový graf) drží těsnou osu", () => {
    const s = niceScale(94, 99, { includeZero: false, count: 5 });
    expect(s.min).toBeGreaterThan(80);
    expect(s.max).toBeGreaterThanOrEqual(99);
  });

  it("neplatný vstup nespadne", () => {
    const s = niceScale(NaN, Infinity);
    expect(Number.isFinite(s.min) && Number.isFinite(s.max) && Number.isFinite(s.step)).toBe(true);
  });
});

describe("škálování a pomocné funkce", () => {
  it("linearScale mapuje doménu na rozsah a nedělí nulou", () => {
    const f = linearScale(0, 10, 100, 0);
    expect(f(0)).toBe(100);
    expect(f(10)).toBe(0);
    expect(f(5)).toBe(50);
    expect(linearScale(3, 3, 7, 9)(3)).toBe(7);
  });

  it("valueExtent: skládaný sčítá kladné a záporné zvlášť, null přeskočí", () => {
    const series = [{ values: [10, -5, null] }, { values: [20, -3, null] }];
    expect(valueExtent(series, 3, true)).toEqual({ min: -8, max: 30 });
    expect(valueExtent(series, 3, false)).toEqual({ min: -5, max: 20 });
    expect(valueExtent([{ values: [null, null] }], 2, false)).toBeNull();
  });

  it("stackSegments klade kladné nahoru, záporné dolů, null a 0 vynechá", () => {
    const segs = stackSegments([10, null, -4, 5, 0, -6]);
    expect(segs[0]).toMatchObject({ start: 0, end: 10, first: true, last: false });
    expect(segs[1]).toBeNull();
    expect(segs[2]).toMatchObject({ start: 0, end: -4, first: true, last: false });
    expect(segs[3]).toMatchObject({ start: 10, end: 15, first: false, last: true });
    expect(segs[4]).toBeNull();
    expect(segs[5]).toMatchObject({ start: -4, end: -10, first: false, last: true });
  });

  it("truncateLabel a labelVisible", () => {
    expect(truncateLabel("Stavba bytového domu", 8)).toBe("Stavba…");
    expect(truncateLabel("Krátké", 8)).toBe("Krátké");
    expect(truncateLabel("abc", 1)).toBe("…");
    // poslední kategorie je vidět vždy
    const visible = [0, 1, 2, 3, 4, 5, 6].filter((i) => labelVisible(i, 7, 3));
    expect(visible).toEqual([0, 3, 6]);
  });

  it("planCategoryLabels: vodorovně, zkrátit, otočit, přeskakovat", () => {
    const labels = ["Leden", "Únor", "Březen"];
    const wide = planCategoryLabels({ labels, bandWidth: 120, charWidth: 6.5, lineHeight: 14 });
    expect(wide).toMatchObject({ step: 1, rotate: false });
    const long = ["Rekonstrukce rodinného domu", "Novostavba haly"];
    const cut = planCategoryLabels({ labels: long, bandWidth: 90, charWidth: 6.5, lineHeight: 14 });
    expect(cut.rotate).toBe(false);
    expect(cut.maxChars).toBeLessThan(27);
    const tight = planCategoryLabels({
      labels: long,
      bandWidth: 30,
      charWidth: 6.5,
      lineHeight: 14,
    });
    expect(tight.rotate).toBe(true);
    const dense = planCategoryLabels({
      labels: long,
      bandWidth: 6,
      charWidth: 6.5,
      lineHeight: 14,
    });
    expect(dense.step).toBeGreaterThan(1);
    const skip = planCategoryLabels({
      labels: ["1. 10.", "2. 10."],
      bandWidth: 12,
      charWidth: 6.5,
      lineHeight: 14,
      allowRotate: false,
    });
    expect(skip.rotate).toBe(false);
    expect(skip.step).toBeGreaterThan(1);
  });

  it("axisTickLabel: jemné kroky nezaokrouhlí na stejné číslo", () => {
    expect(axisTickLabel("percent", 2.5, 0.5)).toContain("2,5");
    expect(axisTickLabel("minutes", 90, 30)).toContain("1:30");
    expect(axisTickLabel("minutes", 120, 60)).toContain("2");
    expect(axisTickLabel("money", 120_000_000, 50_000_000)).toContain("Kč");
  });

  it("barva řady je token, od deváté neutrální", () => {
    expect(seriesColor(0)).toBe("var(--chart-1)");
    expect(seriesColor(7)).toBe("var(--chart-8)");
    expect(seriesColor(8)).toBe("var(--chart-other)");
  });
});

describe("geometrie", () => {
  it("cesty nikdy neobsahují NaN, ani pro degenerované vstupy", () => {
    noBad(barPath(0, 0, 0, 0, 4, "top"));
    noBad(barPath(NaN, 1, 10, Infinity, 4, "right"));
    noBad(arcPath(50, 50, 40, 26, 0, Math.PI * 2));
    noBad(arcPath(50, 50, 40, 0, 0, 1));
    expect(arcPath(50, 50, 40, 26, 1, 1)).toBe("");
    for (const shape of [...SERIES_SHAPES, "dash" as const]) noBad(markerPath(shape, 5, 5, 4));
  });

  it("zaoblení jen na straně dat", () => {
    expect(barPath(0, 0, 20, 40, 4, "none")).not.toContain("A");
    expect(count(barPath(0, 0, 20, 40, 4, "top"), "A")).toBe(2);
  });
});

describe("rozložení sloupců", () => {
  const categories = cats(["Leden", "Únor", "Březen"]);
  const two: ChartSeries[] = [
    { key: "a", label: "Tržby", values: [100, 200, 300] },
    { key: "b", label: "Náklady", values: [50, null, 150] },
  ];
  const base = {
    categories,
    series: two,
    horizontal: false,
    format: "number" as const,
    width: 600,
    fontSize: 11.5,
  };

  it("seskupené: sloupec na řadu a hodnotu, null je mezera", () => {
    const l = layoutBars({ ...base, stacked: false });
    expect(l.bars).toHaveLength(5);
    // v rámci kategorie leží řady vedle sebe (různé x), 3 kategorie a 3 pásy
    expect(l.bands).toHaveLength(3);
    const x = (key: string) => l.bars.find((b) => b.key === key)!.rect.x;
    expect(x("0-0")).not.toBe(x("0-1"));
  });

  it("skládané: stejný počet segmentů, ale sdílejí sloupec a jsou vyšší než jednotlivé", () => {
    const grouped = layoutBars({ ...base, stacked: false });
    const stacked = layoutBars({ ...base, stacked: true });
    expect(stacked.bars).toHaveLength(5);
    const r = (key: string) => stacked.bars.find((b) => b.key === key)!.rect;
    expect(r("0-0").x).toBe(r("0-1").x);
    // druhý segment leží nad prvním a mezi nimi je mezera 2 px
    expect(r("0-1").y + r("0-1").h).toBeLessThanOrEqual(r("0-0").y - 1.99);
    expect(stacked.scale.max).toBeGreaterThan(grouped.scale.max - 1);
    expect(stacked.scale.max).toBeGreaterThanOrEqual(450);
  });

  it("záporné hodnoty jdou pod nulu a osa obsahuje nulu", () => {
    const l = layoutBars({
      ...base,
      series: [{ key: "a", label: "Saldo", values: [100, -50, 20] }],
      stacked: false,
    });
    expect(l.scale.min).toBeLessThan(0);
    expect(l.zero).toBeGreaterThan(l.plot.y);
    expect(l.zero).toBeLessThan(l.plot.y + l.plot.h);
    expect(l.ticks.map((t) => t.value)).toContain(0);
  });

  it("vodorovný graf: řádek na kategorii, štítky hodnot u jedné řady", () => {
    const l = layoutBars({
      ...base,
      series: [two[0]!],
      stacked: false,
      horizontal: true,
    });
    expect(l.bars).toHaveLength(3);
    expect(l.valueLabels).toHaveLength(3);
    expect(l.labels).toHaveLength(3);
    expect(l.bands[1]!.y).toBeGreaterThan(l.bands[0]!.y);
  });

  it("výška obsahuje pás popisků a je aspoň 120", () => {
    const l = layoutBars({ ...base, stacked: false, height: 50 });
    expect(l.height).toBe(120);
    expect(l.plot.y + l.plot.h).toBeLessThan(l.height);
  });

  it("úzký telefon (320 px) a mnoho kategorií: popisky se přeskočí, žádné NaN", () => {
    const many = cats(Array.from({ length: 40 }, (_, i) => `Zakázka číslo ${i + 1}`));
    const l = layoutBars({
      categories: many,
      series: [{ key: "a", label: "Částka", values: many.map((_, i) => (i + 1) * 1000) }],
      stacked: false,
      horizontal: false,
      format: "money",
      width: 320,
      fontSize: 13,
    });
    expect(l.labels.length).toBeLessThan(40);
    expect(l.labels.length).toBeGreaterThan(0);
    // poslední kategorie má popisek vždy
    expect(l.labels.at(-1)!.index).toBe(39);
    noBad(JSON.stringify(l));
  });

  it("jedna kategorie a samé nuly nespadnou", () => {
    const one = layoutBars({
      ...base,
      categories: cats(["Jediná"]),
      series: [{ key: "a", label: "A", values: [0] }],
      stacked: false,
    });
    expect(one.empty).toBe(false);
    expect(one.bars).toHaveLength(0);
    noBad(JSON.stringify(one));
  });
});

describe("rozložení čar", () => {
  it("null přeruší čáru na dva úseky", () => {
    const l = layoutLine({
      categories: cats(["1", "2", "3", "4", "5"]),
      series: [{ key: "a", label: "A", values: [1, 2, null, 4, 5] }],
      area: true,
      format: "number",
      width: 500,
      fontSize: 11.5,
    });
    expect(l.lines[0]!.d.split("M").length - 1).toBe(2);
    expect(l.lines[0]!.area.split("M").length - 1).toBe(2);
    expect(l.lines[0]!.points).toHaveLength(4);
    noBad(JSON.stringify(l));
  });

  it("osamělý bod se vyznačí jako značka, ne čára", () => {
    const l = layoutLine({
      categories: cats(["1", "2", "3"]),
      series: [{ key: "a", label: "A", values: [null, 5, null] }],
      area: false,
      format: "number",
      width: 400,
      fontSize: 11.5,
    });
    expect(l.lines[0]!.d).toBe("");
    expect(l.lines[0]!.isolated).toHaveLength(1);
  });

  it("jediná kategorie je uprostřed a hodnoty jsou konečné", () => {
    const l = layoutLine({
      categories: cats(["Dnes"]),
      series: [{ key: "a", label: "A", values: [7] }],
      area: false,
      format: "money",
      width: 300,
      fontSize: 11.5,
    });
    expect(l.xs).toHaveLength(1);
    noBad(JSON.stringify(l));
  });
});

describe("výřezy koláče", () => {
  const ten = Array.from({ length: 10 }, (_, i) => ({
    key: `k${i}`,
    label: `Položka ${i}`,
    value: 100 - i * 7,
  }));

  it("nejvýš 8 výřezů + Ostatní, součet zůstává", () => {
    const { slices, total } = prepareSlices(ten);
    expect(slices).toHaveLength(9);
    expect(slices.at(-1)).toMatchObject({
      label: "Ostatní",
      isOther: true,
      color: "var(--chart-other)",
    });
    const sum = ten.reduce((a, s) => a + s.value, 0);
    expect(total).toBe(sum);
    expect(slices.reduce((a, s) => a + s.value, 0)).toBe(sum);
    expect(slices.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 10);
    // Ostatní jsou dvě nejmenší
    expect(slices.at(-1)!.value).toBe(ten[8]!.value + ten[9]!.value);
  });

  it("do osmi výřezů žádné Ostatní, barvy podle pořadí ve vstupu", () => {
    const { slices } = prepareSlices(ten.slice(0, 3));
    expect(slices.map((s) => s.label)).not.toContain("Ostatní");
    expect(slices.map((s) => s.color)).toEqual([
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
    ]);
  });

  it("nulové, záporné a neplatné hodnoty se vynechají", () => {
    const { slices, total } = prepareSlices([
      { key: "a", label: "A", value: 10 },
      { key: "b", label: "B", value: 0 },
      { key: "c", label: "C", value: -5 },
      { key: "d", label: "D", value: NaN },
    ]);
    expect(slices).toHaveLength(1);
    expect(total).toBe(10);
    expect(prepareSlices([]).slices).toHaveLength(0);
  });

  it("vlastní barva výřezu se zachová", () => {
    const { slices } = prepareSlices([{ key: "a", label: "A", value: 1, color: "var(--chart-5)" }]);
    expect(slices[0]!.color).toBe("var(--chart-5)");
  });
});

describe("měřidlo", () => {
  it("poměr, procento a značka cíle", () => {
    const g = gaugeState(75, 100);
    expect(g.ratio).toBe(0.75);
    expect(g.pct).toBe(75);
    expect(g.over).toBe(false);
    expect(g.markerPct).toBe(100);
    expect(g.fillPct).toBe(75);
    expect(g.tone).toBe("neutral");
  });

  it("překročení cíle: přesah, značka uvnitř pruhu, stav slovy", () => {
    const g = gaugeState(150, 100);
    expect(g.over).toBe(true);
    expect(g.pct).toBe(150);
    expect(g.markerPct).toBeCloseTo(66.667, 2);
    expect(g.fillPct + g.overPct).toBeCloseTo(100, 6);
    expect(g.tone).toBe("good");
    expect(g.status).toContain("Překročeno o 50");
  });

  it("limit (lowerIsBetter): varování blízko, chyba nad", () => {
    expect(gaugeState(85, 100, true).tone).toBe("warning");
    expect(gaugeState(120, 100, true).tone).toBe("bad");
    expect(gaugeState(40, 100, true).tone).toBe("neutral");
  });

  it("nulový nebo neplatný cíl nedělí nulou", () => {
    for (const [v, t] of [
      [10, 0],
      [NaN, 100],
      [5, NaN],
      [-3, 100],
    ] as const) {
      noBad(JSON.stringify(gaugeState(v, t)));
    }
    expect(gaugeState(10, 0).ratio).toBeNull();
    expect(gaugeState(-3, 100).fillPct).toBe(0);
  });
});

describe("vykreslení (SSR)", () => {
  const categories = cats(["Leden", "Únor", "Březen", "Duben"]);
  const series: ChartSeries[] = [
    { key: "t", label: "Tržby", values: [1_000_000, 2_500_000, null, 1_800_000] },
    { key: "n", label: "Náklady", values: [800_000, 1_200_000, 900_000, 1_100_000] },
  ];

  it("BarChart: role img, popisek, skrytá tabulka, jediný tabulátorový bod, šířka 600 bez měření", () => {
    const html = renderToStaticMarkup(
      h(BarChart, {
        categories,
        series,
        format: "money",
        ariaLabel: "Tržby a náklady po měsících",
      }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Tržby a náklady po měsících"');
    expect(html).toContain('<table class="sr-only">');
    expect(html).toContain("<caption>Tržby a náklady po měsících</caption>");
    expect(html).toContain("Leden");
    expect(html).toContain('width="600"');
    expect(count(html, 'data-mark="bar"')).toBe(7);
    expect(count(html, 'tabindex="0"')).toBe(1);
    expect(count(html, 'tabindex="-1"')).toBe(3);
    // legenda u více řad
    expect(html).toContain('aria-label="Legenda"');
    expect(html).toContain("var(--chart-2)");
    // popisek prvku čte hodnoty
    expect(html).toMatch(/aria-label="Leden: Tržby [^"]*Kč; Náklady/);
    noBad(html);
  });

  it("BarChart: jedna řada nemá legendu a respektuje barvu kategorie", () => {
    const html = renderToStaticMarkup(
      h(BarChart, {
        categories: [
          { key: "a", label: "A", color: "var(--chart-4)" },
          { key: "b", label: "B" },
        ],
        series: [{ key: "s", label: "S", values: [5, 7] }],
        format: "number",
        ariaLabel: "Jedna řada",
        horizontal: true,
      }),
    );
    expect(html).not.toContain('aria-label="Legenda"');
    expect(html).toContain("fill:var(--chart-4)");
    expect(html).toContain("fill:var(--chart-1)");
  });

  it("BarChart: kategorie s href je odkaz, s onSelect tlačítko", () => {
    const linked = renderToStaticMarkup(
      h(BarChart, {
        categories: [{ key: "a", label: "A", href: "/zakazky/a" }],
        series: [{ key: "s", label: "S", values: [5] }],
        format: "number",
        ariaLabel: "Odkazy",
      }),
    );
    expect(linked).toContain('href="/zakazky/a"');
    const selectable = renderToStaticMarkup(
      h(BarChart, {
        categories: [{ key: "a", label: "A" }],
        series: [{ key: "s", label: "S", values: [5] }],
        format: "number",
        ariaLabel: "Výběr",
        onSelect: () => {},
      }),
    );
    expect(selectable).toContain('role="button"');
  });

  it("prázdná data: česká hláška, bez NaN", () => {
    for (const html of [
      renderToStaticMarkup(
        h(BarChart, { categories: [], series: [], format: "number", ariaLabel: "Prázdný" }),
      ),
      renderToStaticMarkup(
        h(LineChart, {
          categories,
          series: [{ key: "a", label: "A", values: [null, null, null, null] }],
          format: "number",
          ariaLabel: "Samé null",
        }),
      ),
      renderToStaticMarkup(
        h(DonutChart, { slices: [], format: "number", ariaLabel: "Prázdný koláč" }),
      ),
    ]) {
      expect(html).toContain(CHART_EMPTY_TEXT);
      noBad(html);
    }
    expect(CHART_EMPTY_TEXT).toBe("Žádná data za zvolené období");
  });

  it("LineChart: čára, plocha, značky podle řad, tabulka", () => {
    const html = renderToStaticMarkup(
      h(LineChart, { categories, series, area: true, format: "money", ariaLabel: "Vývoj" }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('<table class="sr-only">');
    expect(count(html, 'data-mark="line"')).toBe(2);
    expect(count(html, 'data-mark="area"')).toBe(2);
    expect(count(html, 'tabindex="0"')).toBe(1);
    noBad(html);
  });

  it("DonutChart: výřezy, legenda s podílem, Ostatní, střed s celkem", () => {
    const slices = Array.from({ length: 10 }, (_, i) => ({
      key: `k${i}`,
      label: `Klient ${i}`,
      value: 1000 - i * 90,
    }));
    const html = renderToStaticMarkup(
      h(DonutChart, { slices, format: "number", ariaLabel: "Podíl klientů" }),
    );
    expect(count(html, 'data-mark="slice"')).toBe(9);
    expect(html).toContain("Ostatní");
    expect(html).toContain("Celkem");
    expect(html).toContain("%");
    expect(html).toContain('role="img"');
    expect(html).toContain('<table class="sr-only">');
    noBad(html);
  });

  it("DonutChart: jediný výřez je celý kruh, vlastní střed, plný koláč bez středu", () => {
    const one = renderToStaticMarkup(
      h(DonutChart, {
        slices: [{ key: "a", label: "A", value: 5 }],
        format: "money",
        ariaLabel: "Jedna",
        centerLabel: "Zakázky",
        centerValue: "1",
      }),
    );
    expect(one).toContain("Zakázky");
    noBad(one);
    const pie = renderToStaticMarkup(
      h(DonutChart, {
        slices: [
          { key: "a", label: "A", value: 5 },
          { key: "b", label: "B", value: 5 },
        ],
        format: "number",
        donut: false,
        ariaLabel: "Koláč",
      }),
    );
    expect(pie).not.toContain("Celkem");
    noBad(pie);
  });

  it("Gauge: meter s aria hodnotami, text „X z Y (Z %)“, přesah", () => {
    const html = renderToStaticMarkup(
      h(Gauge, { value: 750_000, target: 1_000_000, format: "money", label: "Tržby" }),
    );
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="750000"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="1000000"');
    expect(html).toMatch(/ z .* \(75\u00a0%\)/);
    noBad(html);
    const over = renderToStaticMarkup(h(Gauge, { value: 12, target: 10, format: "hours" }));
    expect(over).toContain("120");
    expect(over).toContain("Překročeno o 20");
    expect(over).toContain('aria-valuemax="12"');
    noBad(over);
    noBad(renderToStaticMarkup(h(Gauge, { value: 5, target: 0, format: "number" })));
  });

  it("Sparkline: role img, čára a koncový bod, přerušení u null", () => {
    const html = renderToStaticMarkup(
      h(Sparkline, { values: [1, 3, null, 2, 5], ariaLabel: "Trend" }),
    );
    expect(html).toContain('aria-label="Trend"');
    expect(count(html, "M")).toBeGreaterThan(1);
    expect(html).toContain('data-mark="spark-end"');
    noBad(html);
    noBad(renderToStaticMarkup(h(Sparkline, { values: [4, 4, 4], ariaLabel: "Plochá" })));
    noBad(renderToStaticMarkup(h(Sparkline, { values: [], ariaLabel: "Prázdná" })));
    noBad(renderToStaticMarkup(h(Sparkline, { values: [null, null], ariaLabel: "Null" })));
  });

  it("žádné inline barvy mimo tokeny", () => {
    const html = [
      renderToStaticMarkup(
        h(BarChart, { categories, series, stacked: true, format: "money", ariaLabel: "A" }),
      ),
      renderToStaticMarkup(h(LineChart, { categories, series, format: "money", ariaLabel: "B" })),
      renderToStaticMarkup(h(Gauge, { value: 1, target: 2, format: "number" })),
    ].join("");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/rgb\(|hsl\(/);
  });
});
