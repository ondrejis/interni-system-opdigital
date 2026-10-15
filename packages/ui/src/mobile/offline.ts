/*
  Offline čtení (MOB-10, v2): poslední načtená data se ukládají do mezipaměti prohlížeče a po otevření bez signálu
  se vrátí jen ke čtení. Zápisy se NIKDY neukládají do fronty — bez spojení se prostě nepovedou. Tento soubor je
  čistá logika (co se ukládá, jak se to serializuje a kdy je záznam příliš starý); Reactová část je `offline-bridge.tsx`.
*/

/** Název mezipaměti (`caches`) s daty; service worker ji maže při odhlášení. */
export const OFFLINE_DATA_CACHE = "opsys-data-v1";
/** Adresa „souboru“ v mezipaměti, pod kterou leží uložený JSON. */
export const OFFLINE_DATA_KEY = "/__opsys-offline-data";
/** Záznam starší než tohle se po otevření bez spojení nepoužije (data by mátla). */
export const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const OFFLINE_MAX_QUERIES = 150;
export const OFFLINE_MAX_BYTES = 2_000_000;
const VERSION = 1;

/** Skupiny dotazů, které se ukládají (seznamy, záznamy, příkazy typu „Moje úkoly“, historie). */
const PERSISTED_ROOTS = new Set(["entity", "command", "history", "trash"]);

/** Uložený výsledek jednoho dotazu (klíč, data a čas načtení). */
export type SavedQuery = { key: readonly unknown[]; data: unknown; updatedAt: number };
/** Celý uložený obraz dat pro čtení bez spojení (verze, uživatel, čas uložení a dotazy). */
export type OfflineSnapshot = { v: number; user: string; savedAt: number; queries: SavedQuery[] };

/** Ukládá se jen to, co je čtení záznamů; hledání v paletě, náhledy a vše ostatní ne. */
export function isPersistableKey(key: readonly unknown[]): boolean {
  return typeof key[0] === "string" && PERSISTED_ROOTS.has(key[0]);
}

/** JSON s Date a bigint (běžný JSON je neumí): `{"$d": ISO}` a `{"$n": "123"}`. */
function replacer(this: Record<string, unknown>, key: string, value: unknown): unknown {
  const raw = this[key];
  if (raw instanceof Date) return { $d: Number.isNaN(raw.getTime()) ? null : raw.toISOString() };
  if (typeof raw === "bigint") return { $n: raw.toString() };
  return value;
}
function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === "$d") return o.$d ? new Date(String(o.$d)) : null;
    if (keys.length === 1 && keys[0] === "$n") return BigInt(String(o.$n));
  }
  return value;
}

/**
 * Vybere nejnovější úspěšné dotazy a zabalí je do JSON. Dotaz, který nejde serializovat (cyklus, funkce), se
 * přeskočí; po překročení velikosti se zahodí nejstarší.
 */
export function serializeSnapshot(
  user: string,
  queries: SavedQuery[],
  now: number,
  limits: { maxQueries?: number; maxBytes?: number } = {},
): string {
  const maxQueries = limits.maxQueries ?? OFFLINE_MAX_QUERIES;
  const maxBytes = limits.maxBytes ?? OFFLINE_MAX_BYTES;
  const picked = queries
    .filter((q) => isPersistableKey(q.key) && q.data !== undefined)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, maxQueries);
  const kept: { json: string; query: SavedQuery }[] = [];
  let bytes = 0;
  for (const q of picked) {
    let json: string;
    try {
      json = JSON.stringify(q, replacer);
    } catch {
      continue;
    }
    if (bytes + json.length > maxBytes) continue;
    bytes += json.length;
    kept.push({ json, query: q });
  }
  return `{"v":${VERSION},"user":${JSON.stringify(user)},"savedAt":${now},"queries":[${kept
    .map((k) => k.json)
    .join(",")}]}`;
}

/** Přečte uložený JSON; cizí uživatel, jiná verze, starý nebo poškozený záznam = prázdný výsledek. */
export function parseSnapshot(
  raw: string | null | undefined,
  user: string,
  now: number,
  maxAgeMs = OFFLINE_MAX_AGE_MS,
): SavedQuery[] {
  if (!raw) return [];
  try {
    const s = JSON.parse(raw, reviver) as OfflineSnapshot;
    if (!s || s.v !== VERSION || s.user !== user || !Array.isArray(s.queries)) return [];
    if (typeof s.savedAt !== "number" || now - s.savedAt > maxAgeMs) return [];
    return s.queries.filter(
      (q) => Array.isArray(q.key) && isPersistableKey(q.key) && typeof q.updatedAt === "number",
    );
  } catch {
    return [];
  }
}

/** Je chyba „bez spojení“ (a ne chyba serveru)? Slouží k rozhodnutí, zda ukázat uložená data. */
export function isNetworkFailure(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg);
}
