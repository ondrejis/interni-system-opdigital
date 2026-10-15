import { createHash } from "node:crypto";
import { UserError } from "../rbac/errors";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password";

/*
  Pravidla pro nová hesla (AUT-03): délka ≥ 12 znaků, kontrola uniklých a běžných hesel.

  Dvě vrstvy, žádná z nich nepošle plné heslo mimo server:
  1. offline: vestavěný seznam běžných základů, klávesnicové a číselné řady, opakování, osobní údaje (e-mail, jméno);
  2. k-anonymní kontrola uniklých hesel (Pwned Passwords „range“): ven jde jen prvních 5 znaků SHA-1 otisku, odpověď
     obsahuje všechny zbytky otisků s touto předponou a porovnání proběhlo u nás. Nedostupná služba heslo nezablokuje
     (kontrola je doplněk, ne brána), jen se zaloguje.
*/

/** Důvod, proč se heslo nepřijme. */
export type PasswordIssue =
  "too_short" | "too_long" | "common" | "personal" | "repetitive" | "breached";

const MESSAGES: Record<PasswordIssue, string> = {
  too_short: `Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`,
  too_long: `Heslo smí mít nejvýš ${MAX_PASSWORD_LENGTH} znaků.`,
  common:
    "Heslo je příliš běžné nebo snadno uhádnutelné. Zvolte delší heslo, třeba větu z několika slov.",
  personal:
    "Heslo obsahuje vaše jméno, e-mail nebo název systému. Zvolte něco, co se nedá odvodit.",
  repetitive: "Heslo je jen opakování znaků nebo řada (123456…, abcdef…). Zvolte jiné.",
  breached:
    "Toto heslo se objevilo v uniklých databázích hesel, proto ho nelze použít. Zvolte jiné, ideálně nové a jedinečné.",
};

/** Údaje o uživateli, které heslo nesmí obsahovat. */
export type PasswordSubject = { email?: string | null; name?: string | null };

/** Zjednodušení pro porovnání: malá písmena, bez diakritiky, jen písmena a číslice. */
export function normalizeForCompare(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Základy nejběžnějších hesel (česky i anglicky); heslo „základ + číslice a znaky“ se zamítne. */
const COMMON_BASES: ReadonlySet<string> = new Set([
  "password",
  "passw0rd",
  "passwd",
  "pass",
  "heslo",
  "mojeheslo",
  "tajneheslo",
  "mojetajneheslo",
  "noveheslo",
  "qwerty",
  "qwertz",
  "qwertyuiop",
  "qwertzuiop",
  "asdfgh",
  "asdfghjkl",
  "zxcvbnm",
  "azerty",
  "admin",
  "administrator",
  "root",
  "user",
  "uzivatel",
  "test",
  "testing",
  "guest",
  "login",
  "welcome",
  "vitejte",
  "letmein",
  "iloveyou",
  "milujitebe",
  "monkey",
  "dragon",
  "master",
  "shadow",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "superman",
  "batman",
  "trustno1",
  "changeme",
  "secret",
  "default",
  "abc",
  "abcdef",
  "abcd",
  "opsys",
  "opdigital",
  "digital",
  "agentura",
  "firma",
  "praha",
  "plzen",
  "brno",
  "ostrava",
  "cesko",
  "cechy",
  "ondrej",
  "patrik",
  "dvorak",
  "silhanek",
  "zima",
  "leto",
  "jaro",
  "podzim",
  "slunce",
  "mesic",
  "lopata",
  "kocicka",
  "pejsek",
  "fotbal",
  "hokej",
  "sparta",
  "slavia",
  "viktoria",
]);

/** Řady, jejichž libovolný souvislý úsek je slabé heslo (číslice, abeceda, řady klávesnice včetně české a zpět). */
const SEQUENCES: readonly string[] = [
  "01234567890123456789",
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiopasdfghjklzxcvbnm",
  "qwertzuiopasdfghjklyxcvbnm",
  "1qaz2wsx3edc4rfv5tgb6zhn7ujm8ik9ol",
].flatMap((s) => [s, [...s].reverse().join("")]);

function isSequence(normalized: string): boolean {
  return normalized.length >= 8 && SEQUENCES.some((s) => s.includes(normalized));
}

/** Heslo je (základ)(číslice a znaky) nebo (číslice a znaky)(základ) nebo jen základ opakovaný. */
function isCommon(normalized: string): boolean {
  if (COMMON_BASES.has(normalized)) return true;
  const stripped = normalized.replace(/^\d+|\d+$/g, "");
  if (stripped !== normalized && COMMON_BASES.has(stripped)) return true;
  // základ opakovaný („heslo“ ×3) nebo dva základy za sebou bez dalšího obsahu
  for (const base of COMMON_BASES) {
    if (base.length < 4 || !stripped.startsWith(base)) continue;
    let rest = stripped;
    while (rest.startsWith(base)) rest = rest.slice(base.length);
    if (rest === "" || /^\d+$/.test(rest)) return true;
  }
  return false;
}

function personalTokens(subject: PasswordSubject): string[] {
  const tokens = new Set<string>();
  const email = subject.email?.trim().toLowerCase();
  if (email) {
    const [local = "", domain = ""] = email.split("@");
    for (const part of [local, domain.split(".")[0] ?? ""]) {
      const n = normalizeForCompare(part);
      if (n.length >= 4) tokens.add(n);
    }
  }
  for (const word of (subject.name ?? "").split(/\s+/)) {
    const n = normalizeForCompare(word);
    if (n.length >= 4) tokens.add(n);
  }
  return [...tokens];
}

/**
 * Offline kontrola hesla (bez sítě): délka, běžné základy, řady a opakování, osobní údaje.
 * Vrací první nalezený problém, nebo `null`, když je heslo v pořádku.
 */
export function checkPasswordOffline(
  password: string,
  subject: PasswordSubject = {},
): PasswordIssue | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "too_short";
  if (password.length > MAX_PASSWORD_LENGTH) return "too_long";
  const normalized = normalizeForCompare(password);
  const distinct = new Set(password).size;
  if (distinct < 5 || isSequence(normalized)) return "repetitive";
  if (isCommon(normalized)) return "common";
  for (const token of personalTokens(subject)) if (normalized.includes(token)) return "personal";
  return null;
}

/** Vrátí tělo odpovědi služby „range“ pro 5znakovou předponu SHA-1 otisku (řádky `ZBYTEK:POČET`). */
export type RangeFetcher = (prefix: string) => Promise<string>;

/** Adresa služby uniklých hesel (Pwned Passwords); dostupná jen s předponou otisku, nikdy s heslem. */
export const BREACH_RANGE_URL = "https://api.pwnedpasswords.com/range/";

/** Výchozí dotaz na službu: 3 s limit, `Add-Padding` skryje i počet shod, bez cookies a bez odkazující adresy. */
export const fetchBreachRange: RangeFetcher = async (prefix) => {
  if (!/^[0-9A-F]{5}$/.test(prefix)) throw new Error("Neplatná předpona otisku.");
  const res = await fetch(`${BREACH_RANGE_URL}${prefix}`, {
    headers: { "Add-Padding": "true", "User-Agent": "OPSYS-password-check" },
    signal: AbortSignal.timeout(3000),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) throw new Error(`Služba uniklých hesel vrátila ${res.status}.`);
  return res.text();
};

/**
 * Je heslo mezi uniklými? K-anonymně: do `fetchRange` jde jen prvních 5 znaků SHA-1 (velkými písmeny), zbytek otisku se
 * porovná tady. Vrací `null`, když se to nepodařilo zjistit (síť, služba); volající rozhodne, co s tím (my heslo
 * nezablokujeme). Řádky s nulovým počtem jsou výplň služby a nepočítají se.
 */
export async function isPasswordBreached(
  password: string,
  fetchRange: RangeFetcher = fetchBreachRange,
): Promise<boolean | null> {
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const body = await fetchRange(prefix);
    for (const line of body.split(/\r?\n/)) {
      const [candidate, count] = line.trim().split(":");
      if (candidate?.toUpperCase() === suffix) return Number(count ?? "1") > 0;
    }
    return false;
  } catch {
    return null;
  }
}

/** Jak se kontroluje únik hesla: vypnuto, výchozí služba, nebo vlastní zdroj (testy, vlastní zrcadlo). */
export type BreachCheck = "off" | "auto" | RangeFetcher;

/** Volby kontroly nového hesla: údaje o uživateli, které heslo nesmí obsahovat, a zdroj uniklých hesel. */
export type PasswordCheckOptions = PasswordSubject & {
  /**
   * Kontrola uniklých hesel. `auto` (výchozí) je zapnutá, kromě testů (`NODE_ENV=test`) a instance s
   * `PASSWORD_BREACH_CHECK=off` (provoz bez přístupu ven; offline kontrola běží vždy).
   */
  breachCheck?: BreachCheck;
};

function resolveBreachCheck(option: BreachCheck | undefined): RangeFetcher | null {
  const v = option ?? "auto";
  if (typeof v === "function") return v;
  if (v === "off") return null;
  if (process.env.NODE_ENV === "test" || process.env.PASSWORD_BREACH_CHECK === "off") return null;
  return fetchBreachRange;
}

/** Čitelná hláška k důvodu zamítnutí. */
export const passwordIssueMessage = (issue: PasswordIssue): string => MESSAGES[issue];

/**
 * Ověří nové heslo: offline pravidla a (je-li zapnutá) k-anonymní kontrola uniklých hesel. Při problému vyhodí
 * `UserError` s českou hláškou, kterou lze ukázat uživateli. Heslo se nikam nelogguje.
 */
export async function assertPasswordAcceptable(
  password: string,
  options: PasswordCheckOptions = {},
): Promise<void> {
  const offline = checkPasswordOffline(password, options);
  if (offline) throw new UserError(MESSAGES[offline]);
  const range = resolveBreachCheck(options.breachCheck);
  if (!range) return;
  if ((await isPasswordBreached(password, range)) === true) throw new UserError(MESSAGES.breached);
}
