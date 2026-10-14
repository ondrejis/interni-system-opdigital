import { z } from "zod";

/**
 * Doplnění firmy z ARES (veřejné API Ministerstva financí, bez klíče; ADR/Q16: veřejné API, respektovat limity).
 *
 * Bezpečnost: volá se vždy jen pevná adresa ARES a do ní se vkládá pouze osmimístné IČO (žádná adresa od uživatele,
 * takže nejde o SSRF); bez přesměrování, s časovým limitem a stropem velikosti odpovědi. Každá chyba (bez sítě, limit,
 * neznámé IČO, jiný tvar odpovědi) se vrací jako výsledek `ok: false` s českou větou, nikdy jako výjimka: ruční
 * vyplnění firmy proto funguje i bez sítě.
 */
export const ARES_BASE = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/";
const TIMEOUT_MS = 5000;
const MAX_BYTES = 256 * 1024;

/** Co ARES o firmě ví a co z toho se hodí do karty firmy. */
export type AresCompany = {
  ico: string;
  name: string;
  dic: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
};

/** Výsledek dotazu na ARES: nalezená firma, nebo důvod a věta pro uživatele. */
export type AresResult =
  | { ok: true; company: AresCompany; cached: boolean }
  | { ok: false; reason: "invalid" | "not_found" | "unavailable"; message: string };

/** Kontrolní součet IČO (modulo 11 podle váh 8–2); chybně opsané IČO se pozná, aniž by se volala síť. */
export function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  const sum = [...ico.slice(0, 7)].reduce((acc, d, i) => acc + Number(d) * (8 - i), 0);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(ico[7]);
}

/** IČO jen z číslic, kratší doplněné nulami zleva na osm; nesmysl vrátí `null`. */
export function normalizeIcoInput(v: string | null | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  if (!digits || digits.length > 8) return null;
  return digits.padStart(8, "0");
}

const sidloSchema = z
  .object({
    nazevObce: z.string().optional(),
    nazevCastiObce: z.string().optional(),
    nazevUlice: z.string().optional(),
    cisloDomovni: z.number().optional(),
    cisloOrientacni: z.number().optional(),
    cisloOrientacniPismeno: z.string().optional(),
    psc: z.number().optional(),
  })
  .partial();

const responseSchema = z.object({
  ico: z.string(),
  obchodniJmeno: z.string().min(1),
  dic: z.string().optional(),
  sidlo: sidloSchema.optional(),
});

/** Převede odpověď ARES na pole firmy (ulice s číslem popisným a orientačním, město, PSČ s mezerou). */
export function mapAres(raw: unknown): AresCompany | null {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  const s = r.sidlo ?? {};
  const number = s.cisloDomovni
    ? `${s.cisloDomovni}${s.cisloOrientacni ? `/${s.cisloOrientacni}${s.cisloOrientacniPismeno ?? ""}` : ""}`
    : null;
  // obec bez ulic: adresa je „část obce + číslo popisné“
  const streetName = s.nazevUlice ?? (number ? s.nazevCastiObce : undefined);
  const street = [streetName, number].filter(Boolean).join(" ") || null;
  const zip = s.psc
    ? String(s.psc)
        .padStart(5, "0")
        .replace(/^(\d{3})(\d{2})$/, "$1 $2")
    : null;
  return {
    ico: r.ico.padStart(8, "0"),
    name: r.obchodniJmeno.trim(),
    dic: r.dic?.trim() || null,
    street,
    city: s.nazevObce?.trim() || null,
    zip,
  };
}

const cache = new Map<string, { at: number; company: AresCompany }>();
const CACHE_MS = 10 * 60_000;

/** Vyhledá firmu v ARES podle IČO. `fetchImpl` je pro testy. */
export async function aresLookup(
  icoInput: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AresResult> {
  const ico = normalizeIcoInput(icoInput);
  if (!ico || !isValidIco(ico))
    return { ok: false, reason: "invalid", message: "IČO není platné (má mít osm číslic)." };
  const hit = cache.get(ico);
  if (hit && Date.now() - hit.at < CACHE_MS)
    return { ok: true, company: hit.company, cached: true };
  try {
    const res = await fetchImpl(`${ARES_BASE}${ico}`, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404 || res.status === 400)
      return { ok: false, reason: "not_found", message: "Firmu s tímto IČO ARES nezná." };
    if (!res.ok)
      return {
        ok: false,
        reason: "unavailable",
        message: "ARES teď neodpovídá. Firmu vyplňte ručně, nebo to zkuste za chvíli.",
      };
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new Error("příliš velká odpověď");
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error("příliš velká odpověď");
    const company = mapAres(JSON.parse(text));
    if (!company)
      return {
        ok: false,
        reason: "unavailable",
        message: "ARES vrátil neočekávanou odpověď. Firmu vyplňte ručně.",
      };
    cache.set(ico, { at: Date.now(), company });
    return { ok: true, company, cached: false };
  } catch {
    return {
      ok: false,
      reason: "unavailable",
      message: "ARES teď neodpovídá. Firmu vyplňte ručně, nebo to zkuste za chvíli.",
    };
  }
}

/** Jen pro testy: vyprázdní paměť mezi voláními. */
export function clearAresCache() {
  cache.clear();
}
