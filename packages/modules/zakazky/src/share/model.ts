// Odkaz pro investora: rozsah sdílení a stav odkazu (čisté funkce, klientsky bezpečné).

export type DiaryShare = "none" | "flagged" | "all";

/** Co investor vidí. Ceny, náklady a marže mezi tím nejsou nikdy. */
export type ShareScope = {
  /** Fáze a postup (harmonogram). */
  schedule: boolean;
  /** `flagged` = jen zápisy označené „pro investora“, `all` = všechny (bez interních událostí). */
  diary: DiaryShare;
  /** Fotky zakázky. */
  photos: boolean;
  /** Vybrané dokumenty (id souborů připojených k zakázce). */
  documentIds: string[];
};

export const DEFAULT_SCOPE: ShareScope = {
  schedule: true,
  diary: "flagged",
  photos: false,
  documentIds: [],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rozsah z databáze nebo ze vstupu: neznámé a chybné hodnoty se zahodí, nikdy nevznikne širší přístup. */
export function normalizeScope(raw: unknown): ShareScope {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const diary: DiaryShare = r.diary === "all" || r.diary === "flagged" ? r.diary : "none";
  return {
    schedule: r.schedule === true,
    diary,
    photos: r.photos === true,
    documentIds: Array.isArray(r.documentIds)
      ? [
          ...new Set(
            r.documentIds.filter((x): x is string => typeof x === "string" && UUID.test(x)),
          ),
        ].slice(0, 100)
      : [],
  };
}

export type ShareStatus = "active" | "expired" | "revoked";

export function shareStatus(
  s: { revokedAt: Date | string | null; expiresAt: Date | string | null },
  now = new Date(),
): ShareStatus {
  if (s.revokedAt) return "revoked";
  if (s.expiresAt && new Date(s.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}

/** Popis rozsahu jednou větou (seznam odkazů). */
export function describeScope(s: ShareScope): string {
  const parts: string[] = [];
  if (s.schedule) parts.push("fáze a postup");
  if (s.diary === "all") parts.push("celý deník");
  if (s.diary === "flagged") parts.push("vybrané zápisy deníku");
  if (s.photos) parts.push("fotky");
  if (s.documentIds.length)
    parts.push(
      `${s.documentIds.length} ${s.documentIds.length === 1 ? "dokument" : s.documentIds.length < 5 ? "dokumenty" : "dokumentů"}`,
    );
  return parts.length ? parts.join(", ") : "jen název zakázky";
}
