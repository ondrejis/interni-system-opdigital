import type { DiaryWeather } from "./diary-shared";

/*
  Počasí pro stavební deník z veřejné služby Open-Meteo (bez klíče). Hostitel je napevno povolený seznam,
  do adresy jdou jen čísla (souřadnice, datum), volání má časový limit a přesměrování se nesleduje.
  Selhání není chyba: deník se uloží a počasí se doplní ručně.
*/

export const WEATHER_HOSTS = [
  "api.open-meteo.com",
  "archive-api.open-meteo.com",
  "geocoding-api.open-meteo.com",
] as const;

const TIMEOUT_MS = 4000;
/** Prognózní služba drží historii zhruba 3 měsíce; starší dny jdou z archivu. */
const FORECAST_WINDOW_DAYS = 80;

/** Česky podle kódu WMO (https://open-meteo.com/en/docs). */
export function weatherLabel(code: number | null): string {
  if (code === null) return "Neurčeno";
  if (code === 0) return "Jasno";
  if (code === 1) return "Převážně jasno";
  if (code === 2) return "Polojasno";
  if (code === 3) return "Zataženo";
  if (code === 45 || code === 48) return "Mlha";
  if (code >= 51 && code <= 57) return "Mrholení";
  if (code === 61 || code === 63 || code === 80 || code === 81) return "Déšť";
  if (code === 65 || code === 82) return "Silný déšť";
  if (code === 66 || code === 67) return "Mrznoucí déšť";
  if (code >= 71 && code <= 77) return "Sníh";
  if (code === 85 || code === 86) return "Sněhové přeháňky";
  if (code === 95) return "Bouřka";
  if (code === 96 || code === 99) return "Bouřka s kroupami";
  return "Proměnlivo";
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;

const validCoord = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Adresa dotazu na denní počasí (pro test i pro volání). */
export function weatherUrl(lat: number, lng: number, date: string, today: string): URL {
  const archive = daysBetween(date, today) > FORECAST_WINDOW_DAYS;
  const url = new URL(
    archive
      ? "https://archive-api.open-meteo.com/v1/archive"
      : "https://api.open-meteo.com/v1/forecast",
  );
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
  );
  url.searchParams.set("timezone", "Europe/Prague");
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  return url;
}

/** Vytáhne den z odpovědi služby; neúplná odpověď = `null`. */
export function parseDaily(json: unknown): DiaryWeather | null {
  const d = (json as { daily?: Record<string, unknown[]> } | null)?.daily;
  if (!d) return null;
  const first = (k: string) => (Array.isArray(d[k]) ? d[k]![0] : undefined);
  const code = first("weather_code");
  if (typeof code !== "number") return null;
  return {
    code,
    label: weatherLabel(code),
    tempMin: num(first("temperature_2m_min")),
    tempMax: num(first("temperature_2m_max")),
    precipMm: num(first("precipitation_sum")),
    windKmh: num(first("wind_speed_10m_max")),
    source: "open-meteo",
  };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(url: URL, fetchImpl: FetchLike): Promise<unknown | null> {
  if (url.protocol !== "https:" || !(WEATHER_HOSTS as readonly string[]).includes(url.hostname))
    return null;
  try {
    const res = await fetchImpl(url.toString(), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Počasí za den na souřadnicích, nebo `null` (služba nedostupná, neplatné souřadnice). */
export async function fetchWeather(
  lat: number,
  lng: number,
  date: string,
  today: string,
  fetchImpl: FetchLike = fetch,
): Promise<DiaryWeather | null> {
  if (!validCoord(lat, lng) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const json = await getJson(weatherUrl(lat, lng, date, today), fetchImpl);
  const w = parseDaily(json);
  return w ? { ...w, fetchedAt: new Date().toISOString() } : null;
}

/**
 * Souřadnice z adresy stavby: obec bývá za čárkou („Ulice 5, 301 00 Plzeň“), nebo na začátku („Praha 4, Ulice 5“),
 * proto se zkusí poslední a pak první část. Nejlepší pokus: bez výsledku `null`.
 */
export async function geocodeAddress(
  address: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ lat: number; lng: number } | null> {
  const parts = address
    .split(",")
    .map((p) =>
      p
        .replace(/\b\d{3}\s?\d{2}\b/g, "")
        .replace(/\d+(\/\d+)?[a-z]?\b/gi, "")
        .trim(),
    )
    .filter((p) => p.length >= 2);
  const candidates = [...new Set([parts.at(-1), parts[0]].filter((c): c is string => !!c))];
  for (const city of candidates) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", city.slice(0, 80));
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "cs");
    url.searchParams.set("countryCode", "CZ");
    const json = (await getJson(url, fetchImpl)) as {
      results?: { latitude?: number; longitude?: number }[];
    } | null;
    const r = json?.results?.[0];
    if (r && typeof r.latitude === "number" && typeof r.longitude === "number")
      return { lat: r.latitude, lng: r.longitude };
  }
  return null;
}
