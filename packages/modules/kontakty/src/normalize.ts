import { toE164 } from "@rebar/core/contracts";

/*
  Čistá normalizace údajů pro kontrolu duplicit a ukládání (IČO, e-mail, telefon, doména webu). Bez databáze a bez sítě,
  takže jde testovat jednotkově a použít i v prohlížeči.
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

/** Kontrolní součet IČO (modulo 11 podle váh 8–2); chybně opsané IČO se pozná, aniž by se volala síť. */
export function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  const sum = [...ico.slice(0, 7)].reduce((acc, d, i) => acc + Number(d) * (8 - i), 0);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(ico[7]);
}

/** E-mail pro porovnání: bez mezer, malými písmeny; bez zavináče je neplatný (`null`). */
export function normalizeEmail(v: string | null | undefined): string | null {
  const e = (v ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/**
 * Telefon ve starém tvaru: devět koncových číslic (bez předvolby +420 / 00420); kratší než devět číslic se
 * neporovnává. Nové kontaktní údaje se porovnávají v E.164 (`normalizePhoneE164`); tohle zůstává pro volající,
 * kteří mají jen volný text.
 */
export function normalizePhone(v: string | null | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/**
 * Telefon v E.164 (`+420777123456`) nezávisle na mezerách, pomlčkách a předvolbě: `777 123 456`, `+420 777 123 456`
 * i `00420777123456` dají totéž. Číslo bez předvolby se čte jako české. Neplatné číslo (třeba nesmyslný prefix)
 * se nezahodí, ale zapíše se co nejvěrněji (`+420…` u devíti číslic, jinak číslice), aby šlo kontrolovat duplicity
 * i u lead formulářů s překlepem. Méně než pět číslic nebo prázdný text = `null`.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const valid = toE164(text);
  if (valid) return valid;
  const digits = text.replace(/\D/g, "");
  if (digits.length < 5) return null;
  if (/^(\+|00)/.test(text)) return `+${digits.replace(/^00/, "")}`;
  if (digits.length === 9) return `+420${digits}`;
  return digits;
}

/** Je to platné telefonní číslo (podle pravidel číslovacího plánu), ne jen něco, co se dá porovnat? */
export function isValidPhone(raw: string | null | undefined): boolean {
  return !!raw && toE164(raw) !== null;
}

/** Telefon k zobrazení: platné číslo v mezinárodním tvaru se skupinami (`+420 777 123 456`), jinak beze změny. */
export function formatPhone(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  const e164 = text ? toE164(text) : null;
  if (!e164) return text;
  const m = /^\+(\d{1,3})(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

/** Domény, které nic neříkají o firmě (sdílené profily a katalogy); shoda v nich se za duplicitu nepovažuje. */
export const GENERIC_DOMAINS: ReadonlySet<string> = new Set([
  "facebook.com",
  "fb.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "google.com",
  "google.cz",
  "firmy.cz",
  "seznam.cz",
  "wixsite.com",
  "webnode.cz",
  "webnode.com",
  "business.site",
  "estranky.cz",
  "mapy.cz",
  "zivefirmy.cz",
]);

/**
 * Doména z adresy webu: bez protokolu, `www.`, cesty, portu a přihlašovacích údajů, malými písmeny.
 * Nesmysl nebo prázdný text = `null`.
 */
export function webDomainOf(web: string | null | undefined): string | null {
  const raw = (web ?? "").trim().toLowerCase();
  if (!raw) return null;
  const host = raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#]/)[0]!
    .split("@")
    .pop()!
    .split(":")[0]!
    .replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** Je doména jen sdílený profil nebo katalog (a tedy nehodí se na hledání duplicit)? */
export function isGenericDomain(domain: string | null | undefined): boolean {
  if (!domain) return true;
  for (const g of GENERIC_DOMAINS) if (domain === g || domain.endsWith(`.${g}`)) return true;
  return false;
}

/** Rozdělí jméno `Jan Novák` na křestní jméno a příjmení (poslední slovo je příjmení). Jedno slovo je příjmení. */
export function splitFullName(full: string): { firstName: string | null; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: null, lastName: parts[0] ?? "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1]! };
}
