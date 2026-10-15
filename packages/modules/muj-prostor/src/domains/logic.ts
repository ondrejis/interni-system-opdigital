import { diffDaysIso } from "@rebar/core/time";

/*
  Čistá pravidla domén (DOM-02, DOM-04, R-19): stav expirace a barva, souhrn a hromadné vložení.
  Bez databáze a bez Reactu, aby je používal server (příkazy, odznak v menu, metriky) i prohlížeč (barvy v seznamu).
*/

/** Výchozí hranice „kritická“ ve dnech (`web_domain.warn_days`). */
export const DEFAULT_WARN_DAYS = 30;

/** Úroveň expirace: normální, upozornění, kritická; `unknown` = doména nemá vyplněnou expiraci. */
export type ExpiryLevel = "normal" | "warning" | "critical" | "unknown";

/** Stav expirace domény k danému dni. */
export type ExpiryState = {
  level: ExpiryLevel;
  /** Dnů do expirace (záporné po expiraci, 0 = vyprší dnes); `null` bez data expirace. */
  daysLeft: number | null;
  /** Doména už vypršela (expirace před dneškem). */
  expired: boolean;
};

/** Barvy štítku podle úrovně (`Chip`): normální bez zvýraznění, upozornění oranžová, kritická červená. */
export const EXPIRY_COLORS: Record<ExpiryLevel, string> = {
  normal: "gray",
  warning: "orange",
  critical: "red",
  unknown: "gray",
};

/** Česky pojmenované úrovně expirace. */
export const EXPIRY_LEVEL_LABELS: Record<ExpiryLevel, string> = {
  normal: "V pořádku",
  warning: "Upozornění",
  critical: "Kritická",
  unknown: "Bez expirace",
};

/** Hranice „kritická“ po úpravě: celé číslo alespoň 1, jinak výchozí 30 dní. */
export function sanitizeWarnDays(warnDays: number | null | undefined): number {
  return typeof warnDays === "number" && Number.isFinite(warnDays) && warnDays >= 1
    ? Math.floor(warnDays)
    : DEFAULT_WARN_DAYS;
}

/**
 * Stav expirace domény (R-19): kritická je od `warn_days` dní do expirace (výchozí 30) a po expiraci, upozornění je
 * v pásmu do dvojnásobku (výchozí 60–30 dní), dál je normální. Hranice patří do vyššího pásma: přesně 60 dní je
 * upozornění, přesně 30 dní je upozornění (kritická je až „méně než 30“). `today` je `YYYY-MM-DD` v české zóně.
 */
export function expiryState(
  expiresOn: string | null | undefined,
  warnDays: number | null | undefined,
  today: string,
): ExpiryState {
  if (!expiresOn) return { level: "unknown", daysLeft: null, expired: false };
  const warn = sanitizeWarnDays(warnDays);
  const daysLeft = diffDaysIso(today, expiresOn.slice(0, 10));
  const level: ExpiryLevel =
    daysLeft < warn ? "critical" : daysLeft <= warn * 2 ? "warning" : "normal";
  return { level, daysLeft, expired: daysLeft < 0 };
}

/** Skloňování „den“: 1 den, 2–4 dny, 0 a 5 a více dní. */
export function daysCs(n: number): string {
  const abs = Math.abs(n);
  return `${abs} ${abs === 1 ? "den" : abs >= 2 && abs <= 4 ? "dny" : "dní"}`;
}

/** Slovní popis zbývající doby („Vypršela před 5 dny“, „Vyprší dnes“, „Za 23 dní“). */
export function expiryText(state: ExpiryState): string {
  const d = state.daysLeft;
  if (d === null) return "Bez expirace";
  if (d < 0) return `Vypršela před ${Math.abs(d)} ${Math.abs(d) === 1 ? "dnem" : "dny"}`;
  if (d === 0) return "Vyprší dnes";
  if (d === 1) return "Vyprší zítra";
  return `Za ${daysCs(d)}`;
}

/** Vstup souhrnu domén. */
export type DomainLike = {
  expiresOn: string | null;
  warnDays: number | null;
  companyId?: string | null;
};

/** Souhrn domén k danému dni (karty nad seznamem, odznak v menu). */
export type DomainSummary = {
  total: number;
  critical: number;
  warning: number;
  normal: number;
  unknown: number;
  /** Domény bez přiřazeného klienta (po hromadném vložení se klienti doplňují). */
  withoutClient: number;
};

/** Spočítá domény podle úrovně expirace. Počet kritických je číslo u položky Domény v menu (DOM-03). */
export function summarizeDomains(rows: readonly DomainLike[], today: string): DomainSummary {
  const out: DomainSummary = {
    total: rows.length,
    critical: 0,
    warning: 0,
    normal: 0,
    unknown: 0,
    withoutClient: 0,
  };
  for (const r of rows) {
    out[expiryState(r.expiresOn, r.warnDays, today).level] += 1;
    if (!r.companyId) out.withoutClient += 1;
  }
  return out;
}

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const DOMAIN_RE = new RegExp(`^(?:${LABEL}\\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$`);

/**
 * Doménové jméno z libovolného zápisu: odstraní protokol, přihlašovací údaje, cestu, port, koncovou tečku a úvodní
 * `www.`, převede na malá písmena a diakritické domény na punycode. Neplatný zápis vrátí `null`.
 */
export function normalizeDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/[/?#].*$/, "");
  s = s.replace(/^[^@]*@/, "");
  s = s.replace(/:\d+$/, "");
  s = s.replace(/\.+$/, "");
  s = s.replace(/^www\./, "");
  if (!s) return null;
  if (/\P{ASCII}/u.test(s)) {
    try {
      s = new URL(`http://${s}`).hostname;
    } catch {
      return null;
    }
  }
  return s.length <= 253 && DOMAIN_RE.test(s) ? s : null;
}

/** Nejvíc domén v jednom hromadném vložení. */
export const BULK_DOMAIN_LIMIT = 500;

/** Rozebraný text hromadného vložení domén. */
export type ParsedDomainList = {
  /** Platné domény v pořadí zadání, bez opakování. */
  valid: string[];
  /** Domény, které se v zadání opakují (druhý a další výskyt). */
  duplicates: string[];
  /** Zápisy, které nejsou doménou. */
  invalid: string[];
  /** Zadání mělo víc než `BULK_DOMAIN_LIMIT` zápisů, zbytek se ignoroval. */
  truncated: boolean;
};

/**
 * Rozebere seznam domén (DOM-04): každá na řádek, oddělovačem smí být i čárka, středník a mezera. Prázdné řádky a
 * komentáře (`# …`) se přeskočí.
 */
export function parseDomainList(text: string, limit = BULK_DOMAIN_LIMIT): ParsedDomainList {
  const out: ParsedDomainList = { valid: [], duplicates: [], invalid: [], truncated: false };
  const seen = new Set<string>();
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, "").trim();
    if (!clean) continue;
    for (const token of clean.split(/[\s,;]+/)) {
      if (!token) continue;
      if (count >= limit) {
        out.truncated = true;
        return out;
      }
      count += 1;
      const domain = normalizeDomain(token);
      if (!domain) out.invalid.push(token);
      else if (seen.has(domain)) out.duplicates.push(domain);
      else {
        seen.add(domain);
        out.valid.push(domain);
      }
    }
  }
  return out;
}
