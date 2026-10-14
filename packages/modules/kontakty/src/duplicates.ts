/*
  Normalizace údajů pro kontrolu duplicit (IČO, e-mail, telefon). Hledání duplicit v databázi (`checkDuplicates`,
  E.164 přes `toE164` z `@rebar/core/contracts`) doplní KON; předchozí verze je v `packages/_donor/kontakty`.
*/

/** Údaje, podle kterých se hledá existující firma nebo osoba. */
export type ContactQuery = {
  ico?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
};

/** V čem se nalezený záznam shoduje s hledaným: IČO, e-mail, telefon. */
export type MatchedBy = "ico" | "email" | "phone";

/** IČO: jen číslice (mezery a pomlčky pryč), kratší se doplní zleva nulami na osm. Prázdné nebo nesmyslné = `null`. */
export function normalizeIco(v: string | null | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  if (!digits || digits.length > 8) return null;
  return digits.padStart(8, "0");
}

/** E-mail pro porovnání: bez mezer, malými písmeny; bez zavináče je neplatný (`null`). */
export function normalizeEmail(v: string | null | undefined): string | null {
  const e = (v ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

/** Telefon: devět koncových číslic (bez předvolby +420 / 00420); kratší než devět číslic se neporovnává. */
export function normalizePhone(v: string | null | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}
