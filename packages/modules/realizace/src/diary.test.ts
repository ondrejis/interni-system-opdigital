import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dayStrip,
  materialAmountMinor,
  mergeMaterialRows,
  qtyThousandths,
  stripMaterialPrices,
  summarizeMaterials,
  summarizeWorkers,
  weatherSummary,
  weekdayShort,
  type DiaryMaterial,
} from "./diary-shared";
import {
  fetchWeather,
  geocodeAddress,
  parseDaily,
  weatherLabel,
  weatherUrl,
  type FetchLike,
} from "./weather";

const mat = (p: Partial<DiaryMaterial> = {}): DiaryMaterial => ({
  id: "row-00000001",
  name: "Cement",
  qty: "2,5",
  unit: "pytel",
  supplier: null,
  unitPriceMinor: 15_000,
  source: "manual",
  costRef: null,
  ...p,
});

describe("deník: materiál a ceny", () => {
  it("množství a částka řádku bez chyby desetinných čísel", () => {
    expect(qtyThousandths("2,5")).toBe(2500);
    expect(qtyThousandths("0")).toBe(0);
    expect(qtyThousandths("abc")).toBe(0);
    expect(materialAmountMinor(mat())).toBe(37_500);
    expect(materialAmountMinor(mat({ qty: "0,333", unitPriceMinor: 100 }))).toBe(33);
    expect(materialAmountMinor(mat({ unitPriceMinor: null }))).toBe(0);
  });

  it("bez oprávnění k ekonomice se ceny odstraní", () => {
    const [m] = stripMaterialPrices([mat({ costRef: "c1" })]);
    expect(m).toMatchObject({ unitPriceMinor: null, costRef: null, name: "Cement" });
  });

  it("kdo ceny nezapisuje, neprepíše ani nesmaže uložené; nový řádek je bez ceny", () => {
    const prev = [mat({ costRef: "c1" })];
    const incoming = [
      mat({ unitPriceMinor: null, qty: "3" }),
      mat({ id: "row-00000002", unitPriceMinor: 999 }),
    ];
    const merged = mergeMaterialRows(incoming, prev, false);
    expect(merged[0]).toMatchObject({ unitPriceMinor: 15_000, costRef: "c1", qty: "3" });
    expect(merged[1]).toMatchObject({ unitPriceMinor: null, costRef: null });
    expect(mergeMaterialRows(incoming, prev, true)[1]!.unitPriceMinor).toBe(999);
  });

  it("souhrny pro textové sloupce a tisk", () => {
    expect(
      summarizeWorkers([
        { userId: null, name: "Jan", hours: 8, source: "manual" },
        { userId: null, name: "Eva", hours: 7.5, source: "attendance" },
      ]),
    ).toBe("Jan (8 h), Eva (7,5 h)");
    expect(summarizeMaterials([mat({ supplier: "Stavmat" })])).toBe("Cement (2,5 pytel) — Stavmat");
    expect(weatherSummary({ label: "Déšť", tempMin: 4, tempMax: 9 })).toBe("Déšť, 4 až 9 °C");
    expect(weatherSummary({ label: "Jasno", tempMin: 7.7, tempMax: 13.9 })).toBe(
      "Jasno, 7,7 až 13,9 °C",
    );
    expect(weatherSummary(null)).toBe("");
  });

  it("pás dní", () => {
    const days = dayStrip("2026-10-09", 3);
    expect(days).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(weekdayShort("2026-10-09")).toBe("pá");
  });
});

const sample = {
  daily: {
    weather_code: [61],
    temperature_2m_max: [9.4],
    temperature_2m_min: [3.1],
    precipitation_sum: [4.2],
    wind_speed_10m_max: [18.3],
  },
};
const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

describe("počasí z Open-Meteo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("kódy WMO česky a odpověď služby", () => {
    expect(weatherLabel(0)).toBe("Jasno");
    expect(weatherLabel(63)).toBe("Déšť");
    expect(weatherLabel(95)).toBe("Bouřka");
    expect(parseDaily(sample)).toMatchObject({
      code: 61,
      label: "Déšť",
      tempMin: 3.1,
      tempMax: 9.4,
      precipMm: 4.2,
      windKmh: 18.3,
      source: "open-meteo",
    });
    expect(parseDaily({ daily: {} })).toBeNull();
    expect(parseDaily(null)).toBeNull();
  });

  it("nedávný den jde z prognózní služby, starý z archivu; do adresy jen čísla a datum", () => {
    expect(weatherUrl(49.7384, 13.3736, "2026-10-09", "2026-10-09").hostname).toBe(
      "api.open-meteo.com",
    );
    const old = weatherUrl(49.7384, 13.3736, "2025-01-02", "2026-10-09");
    expect(old.hostname).toBe("archive-api.open-meteo.com");
    expect(old.searchParams.get("start_date")).toBe("2025-01-02");
    expect(old.searchParams.get("latitude")).toBe("49.7384");
  });

  it("volá jen povolené hostitele, bez přesměrování a s časovým limitem; selhání = null", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f: FetchLike = async (url, init) => {
      calls.push({ url, ...(init ? { init } : {}) });
      return ok(sample);
    };
    const w = await fetchWeather(49.7, 13.4, "2026-10-09", "2026-10-09", f);
    expect(w?.label).toBe("Déšť");
    expect(new URL(calls[0]!.url).hostname).toBe("api.open-meteo.com");
    expect(calls[0]!.init?.redirect).toBe("error");
    expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);

    expect(
      await fetchWeather(49.7, 13.4, "2026-10-09", "2026-10-09", async () => {
        throw new Error("síť");
      }),
    ).toBeNull();
    expect(
      await fetchWeather(
        49.7,
        13.4,
        "2026-10-09",
        "2026-10-09",
        async () => new Response("x", { status: 500 }),
      ),
    ).toBeNull();
    expect(await fetchWeather(999, 13.4, "2026-10-09", "2026-10-09", f)).toBeNull();
    expect(await fetchWeather(49.7, 13.4, "dnes", "2026-10-09", f)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("souřadnice z adresy podle obce", async () => {
    let asked = "";
    const f: FetchLike = async (url) => {
      asked = url;
      return ok({ results: [{ latitude: 49.74, longitude: 13.37 }] });
    };
    expect(await geocodeAddress("Americká 12, 301 00 Plzeň", f)).toEqual({
      lat: 49.74,
      lng: 13.37,
    });
    expect(new URL(asked).hostname).toBe("geocoding-api.open-meteo.com");
    expect(new URL(asked).searchParams.get("name")).toBe("Plzeň");
    expect(await geocodeAddress("   ", f)).toBeNull();
  });
});
