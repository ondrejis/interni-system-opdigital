/*
  Typy doplnění firmy z ARES (ORG-03, ORG-04). Bez databáze a bez sítě, takže se dostanou i do testů a prohlížeče.
*/

/** Co ARES o firmě ví a co z toho se hodí do karty organizace. */
export type AresCompany = {
  ico: string;
  /** Obchodní jméno z ARES (v organizaci jde do `officialName`, případně i do `name`). */
  name: string;
  dic: string | null;
  /** Právní forma slovy (`Společnost s ručením omezeným`); neznámý kód = `null`. */
  legalForm: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
};

/** Surový výsledek dotazu na ARES (bez cache a kontroly IČO). */
export type AresFetchResult =
  | { ok: true; company: AresCompany }
  | { ok: false; reason: "not_found" | "unavailable"; message: string };

/**
 * Adaptér ARES: jediné místo, které mluví se sítí. Reálná implementace je `createFetchAresClient` (přes `fetch`
 * s časovým limitem), pro testy `createFakeAres`. Nikdy nevyhazuje výjimku: chyba je výsledek `ok: false`.
 */
export interface AresClient {
  lookup(ico: string): Promise<AresFetchResult>;
}

/** Výsledek dotazu na ARES pro uživatele: nalezená firma (z paměti, nebo z ARES), nebo důvod a věta. */
export type AresResult =
  | {
      ok: true;
      company: AresCompany;
      /** Odpověď přišla z cache (do 24 h), ne ze sítě. */
      cached: boolean;
      /** ARES neodpovídal a údaje jsou starší než 24 h (lepší než nic; UI na to upozorní). */
      stale: boolean;
      /** Kdy se údaje z ARES naposledy stáhly (ISO). */
      fetchedAt: string;
    }
  | { ok: false; reason: "invalid" | "not_found" | "unavailable"; message: string };

/** Cache odpovědí ARES podle IČO (v DB tabulka `ares_cache`, v testech paměť). */
export interface AresCache {
  get(ico: string): Promise<{ company: AresCompany; fetchedAt: Date } | null>;
  set(ico: string, company: AresCompany, at: Date): Promise<void>;
}

/** Pole organizace, která jde doplnit z ARES. */
export const ARES_FIELDS = [
  "name",
  "officialName",
  "ico",
  "dic",
  "legalForm",
  "street",
  "city",
  "zip",
] as const;
export type AresField = (typeof ARES_FIELDS)[number];

/** Popisky polí v náhledu změn. */
export const ARES_FIELD_LABELS: Record<AresField, string> = {
  name: "Název",
  officialName: "Oficiální název",
  ico: "IČO",
  dic: "DIČ",
  legalForm: "Právní forma",
  street: "Ulice",
  city: "Město",
  zip: "PSČ",
};

/** Jedna změna v náhledu: co je teď, co přináší ARES a zda je výchozí zaškrtnutá. */
export type AresChange = {
  field: AresField;
  label: string;
  current: string | null;
  incoming: string | null;
  /** `fill` = pole je prázdné, `change` = přepíše se jiná hodnota. */
  kind: "fill" | "change";
  /** Výchozí volba v náhledu (název se přepisuje jen tam, kde zrcadlí oficiální název). */
  selected: boolean;
};
