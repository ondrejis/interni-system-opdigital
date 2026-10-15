import { mapAres } from "./parse";
import type { AresClient, AresFetchResult } from "./types";

/**
 * Doplnění firmy z ARES (veřejné API Ministerstva financí, bez klíče; respektovat limity).
 *
 * Bezpečnost: volá se vždy jen pevná adresa ARES a do ní se vkládá pouze osmimístné IČO (žádná adresa od uživatele,
 * takže nejde o SSRF); bez přesměrování, s časovým limitem a stropem velikosti odpovědi. Každá chyba (bez sítě, limit,
 * neznámé IČO, jiný tvar odpovědi) se vrací jako výsledek `ok: false` s českou větou, nikdy jako výjimka: ruční
 * vyplnění organizace proto funguje i bez sítě.
 */
export const ARES_BASE = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/";
/** Časový limit dotazu: ARES má doplnit údaje do 2 s (NFR-04), jinak se pokračuje ručně. */
export const ARES_TIMEOUT_MS = 2000;
const MAX_BYTES = 256 * 1024;

const UNAVAILABLE =
  "ARES teď neodpovídá. Organizaci vyplňte ručně, nebo to zkuste za chvíli. Uložení tím není dotčeno.";

/** Reálný adaptér ARES přes `fetch` s časovým limitem. `fetchImpl` a `timeoutMs` jsou pro testy. */
export function createFetchAresClient(
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): AresClient {
  const fetchImpl = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? ARES_TIMEOUT_MS;
  return {
    async lookup(ico: string): Promise<AresFetchResult> {
      // do adresy smí jen osm číslic; cokoli jiného je chyba volajícího, ne důvod sahat do sítě
      if (!/^\d{8}$/.test(ico)) return { ok: false, reason: "not_found", message: "IČO není platné." };
      try {
        const res = await fetchImpl(`${ARES_BASE}${ico}`, {
          method: "GET",
          headers: { accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status === 404 || res.status === 400)
          return { ok: false, reason: "not_found", message: "Organizaci s tímto IČO ARES nezná." };
        if (!res.ok) return { ok: false, reason: "unavailable", message: UNAVAILABLE };
        const declared = Number(res.headers.get("content-length") ?? 0);
        if (declared > MAX_BYTES) throw new Error("příliš velká odpověď");
        const text = await res.text();
        if (text.length > MAX_BYTES) throw new Error("příliš velká odpověď");
        const company = mapAres(JSON.parse(text));
        if (!company)
          return {
            ok: false,
            reason: "unavailable",
            message: "ARES vrátil neočekávanou odpověď. Organizaci vyplňte ručně.",
          };
        return { ok: true, company };
      } catch {
        return { ok: false, reason: "unavailable", message: UNAVAILABLE };
      }
    },
  };
}
