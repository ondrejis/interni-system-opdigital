import { eq } from "drizzle-orm";
import type { Executor } from "@rebar/core/db";
import { isValidIco, normalizeIco } from "../normalize";
import { aresCache } from "../schema";
import { createFetchAresClient } from "./client";
import type { AresCache, AresClient, AresCompany, AresResult } from "./types";

/** Jak dlouho se odpověď ARES drží v cache (ORG-04). */
export const ARES_CACHE_MS = 24 * 60 * 60 * 1000;

/** Cache v paměti pro testy a výchozí použití bez databáze. */
export function createMemoryAresCache(): AresCache & { clear(): void } {
  const map = new Map<string, { company: AresCompany; fetchedAt: Date }>();
  return {
    async get(ico) {
      return map.get(ico) ?? null;
    },
    async set(ico, company, at) {
      map.set(ico, { company, fetchedAt: at });
    },
    clear: () => map.clear(),
  };
}

/** Cache v tabulce `ares_cache` (přežije restart, sdílí ji aplikace i worker). Chyba cache nikdy nerozbije dotaz. */
export function createDbAresCache(db: Executor): AresCache {
  return {
    async get(ico) {
      try {
        const [row] = await db.select().from(aresCache).where(eq(aresCache.ico, ico)).limit(1);
        if (!row) return null;
        return { company: row.payload as unknown as AresCompany, fetchedAt: row.fetchedAt };
      } catch {
        return null;
      }
    },
    async set(ico, company, at) {
      try {
        await db
          .insert(aresCache)
          .values({ ico, payload: company as unknown as Record<string, unknown>, fetchedAt: at })
          .onConflictDoUpdate({
            target: aresCache.ico,
            set: { payload: company as unknown as Record<string, unknown>, fetchedAt: at },
          });
      } catch {
        // cache je jen zrychlení; selhání zápisu se ignoruje
      }
    },
  };
}

let client: AresClient = createFetchAresClient();

/** Adaptér ARES, který používají příkazy modulu. V testech se nahradí fake (`createFakeAres`); `null` vrátí reálný. */
export function setAresClient(next: AresClient | null): void {
  client = next ?? createFetchAresClient();
}

/** Aktuálně nastavený adaptér ARES. */
export function getAresClient(): AresClient {
  return client;
}

/**
 * Vyhledá organizaci v ARES podle IČO s cache 24 h. Nejdřív kontrola tvaru a kontrolního součtu (chybně opsané IČO
 * se do sítě neposílá), pak cache, pak ARES. Když ARES neodpovídá a v cache je starší odpověď, vrátí ji s `stale`.
 * Nikdy nevyhodí výjimku kvůli síti: `ok: false` nese větu pro uživatele.
 */
export async function lookupAres(
  icoInput: string,
  opts: { cache: AresCache; client?: AresClient; now?: Date; fresh?: boolean },
): Promise<AresResult> {
  const ico = normalizeIco(icoInput);
  if (!ico || !isValidIco(ico))
    return {
      ok: false,
      reason: "invalid",
      message: "IČO není platné (má mít osm číslic a správný kontrolní součet).",
    };
  const now = opts.now ?? new Date();
  const cached = await opts.cache.get(ico);
  if (cached && !opts.fresh && now.getTime() - cached.fetchedAt.getTime() < ARES_CACHE_MS)
    return {
      ok: true,
      company: cached.company,
      cached: true,
      stale: false,
      fetchedAt: cached.fetchedAt.toISOString(),
    };
  const res = await (opts.client ?? client).lookup(ico);
  if (res.ok) {
    await opts.cache.set(ico, res.company, now);
    return {
      ok: true,
      company: res.company,
      cached: false,
      stale: false,
      fetchedAt: now.toISOString(),
    };
  }
  if (res.reason === "unavailable" && cached)
    return {
      ok: true,
      company: cached.company,
      cached: true,
      stale: true,
      fetchedAt: cached.fetchedAt.toISOString(),
    };
  return { ok: false, reason: res.reason, message: res.message };
}
