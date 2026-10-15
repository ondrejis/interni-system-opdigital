/*
  Odkazy pro rychlé akce na telefonu (MOB-02…04): zavolat, SMS, WhatsApp, e-mail, navigovat. Čisté funkce bez Reactu;
  sdílí je karta klienta, karta kontaktu a výsledky hledání. Telefon se bere tak, jak je v databázi (E.164 nebo
  „777 123 456“), a připraví se pro `tel:`, `sms:` a `wa.me`.
*/

/** Výchozí předvolba pro číslo bez předvolby (Česko). */
export const DEFAULT_DIAL_PREFIX = "420";

/** Číslice a vedoucí `+`; vrací null, když z textu nezbyde žádné číslo. */
export function dialDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 5) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** Číslo v mezinárodním tvaru bez `+` (pro `wa.me`): `00420…` → `420…`, 9 číslic bez předvolby dostane `420`. */
export function internationalDigits(
  phone: string | null | undefined,
  prefix = DEFAULT_DIAL_PREFIX,
): string | null {
  const d = dialDigits(phone);
  if (!d) return null;
  if (d.startsWith("+")) return d.slice(1);
  if (d.startsWith("00")) return d.slice(2);
  if (d.length === 9) return `${prefix}${d}`;
  return d;
}

/** Odkaz `tel:` pro zavolání; null, když číslo není použitelné. */
export function telHref(phone: string | null | undefined): string | null {
  const d = dialDigits(phone);
  return d ? `tel:${d}` : null;
}

/** Odkaz `sms:` pro napsání zprávy; null, když číslo není použitelné. */
export function smsHref(phone: string | null | undefined): string | null {
  const d = dialDigits(phone);
  return d ? `sms:${d}` : null;
}

/** Odkaz `wa.me` pro WhatsApp (číslo v mezinárodním tvaru); null, když číslo není použitelné. */
export function whatsappHref(phone: string | null | undefined): string | null {
  const d = internationalDigits(phone);
  return d ? `https://wa.me/${d}` : null;
}

/** Odkaz `mailto:` pro napsání e-mailu; null u neplatné adresy. */
export function mailHref(email: string | null | undefined): string | null {
  const e = email?.trim();
  return e && e.includes("@") ? `mailto:${e}` : null;
}

/** Adresa jedním řádkem (prázdné části se vynechají); null, když není z čeho skládat. */
export function addressText(parts: {
  street?: unknown;
  city?: unknown;
  zip?: unknown;
  country?: unknown;
}): string | null {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const cityLine = [s(parts.zip), s(parts.city)].filter(Boolean).join(" ");
  const country =
    s(parts.country) && s(parts.country).toUpperCase() !== "CZ" ? s(parts.country) : "";
  const line = [s(parts.street), cityLine, country].filter(Boolean).join(", ");
  return line || null;
}

/** Adresa v mapách: univerzální odkaz Google Maps, který telefon nabídne otevřít v aplikaci map. */
export function mapsLink(address: string | null | undefined): string | null {
  const a = address?.trim();
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : null;
}

/** Druh rychlé akce na kartě kontaktu nebo klienta. */
export type ContactActionKind = "call" | "sms" | "whatsapp" | "mail" | "navigate" | "drive";
/** Jedna rychlá akce: popisek, ikona a odkaz. */
export type ContactAction = {
  kind: ContactActionKind;
  label: string;
  icon: string;
  href: string;
  /** Odkaz se otevírá mimo aplikaci (mapy, Disk, WhatsApp). */
  external: boolean;
};

/**
 * Sada akcí pro kartu: pořadí Zavolat, SMS, WhatsApp, E-mail, Navigovat, Disk. Akce bez údaje se vynechá, `only`
 * omezí výběr (karta kontaktu: telefon + e-mail; karta klienta: Zavolat, E-mail, Navigovat, Disk).
 */
export function contactActions(
  data: {
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    driveUrl?: string | null;
  },
  only?: readonly ContactActionKind[],
): ContactAction[] {
  const all: (ContactAction | null)[] = [
    mk("call", "Zavolat", "phone", telHref(data.phone), false),
    mk("sms", "SMS", "message-square", smsHref(data.phone), false),
    mk("whatsapp", "WhatsApp", "message-circle", whatsappHref(data.phone), true),
    mk("mail", "E-mail", "mail", mailHref(data.email), false),
    mk("navigate", "Navigovat", "map-pin", mapsLink(data.address), true),
    mk("drive", "Disk", "folder", safeHttp(data.driveUrl), true),
  ];
  return all.filter((a): a is ContactAction => !!a && (!only || only.includes(a.kind)));
}

function mk(
  kind: ContactActionKind,
  label: string,
  icon: string,
  href: string | null,
  external: boolean,
): ContactAction | null {
  return href ? { kind, label, icon, href, external } : null;
}

function safeHttp(url: string | null | undefined): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}
