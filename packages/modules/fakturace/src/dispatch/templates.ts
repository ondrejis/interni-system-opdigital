import { formatDate, formatMinor } from "@rebar/core/shared";

/**
 * Šablony e-mailů s fakturou a upomínkou: text s proměnnými `{cislo}`… Čisté funkce bez databáze.
 * Hodnoty se dosazují jako text (nikdy jako HTML), neznámá proměnná zůstane v textu beze změny.
 */
export const MAIL_VARIABLES = [
  { key: "cislo", label: "Číslo dokladu", example: "FV-2026-0012" },
  { key: "druh", label: "Druh dokladu (faktura, zálohová faktura, dobropis…)", example: "Faktura" },
  { key: "castka", label: "Celková částka dokladu", example: "125 400 Kč" },
  { key: "zbyva", label: "Zbývá uhradit", example: "125 400 Kč" },
  { key: "splatnost", label: "Datum splatnosti", example: "23. 10. 2026" },
  { key: "dnu_po_splatnosti", label: "Počet dní po splatnosti", example: "5" },
  { key: "variabilni_symbol", label: "Variabilní symbol", example: "20260012" },
  { key: "ucet", label: "Číslo účtu dodavatele", example: "19-2000145399/0800" },
  { key: "nazev_firmy", label: "Název firmy odběratele", example: "Stavby Novák s.r.o." },
  { key: "dodavatel", label: "Název firmy dodavatele (vaše firma)", example: "Vaše firma s.r.o." },
  { key: "zakazka", label: "Číslo zakázky", example: "Z-2026-014" },
] as const;

export type MailVariable = (typeof MAIL_VARIABLES)[number]["key"];
const KNOWN = new Set<string>(MAIL_VARIABLES.map((v) => v.key));

export const DEFAULT_MAIL_TEMPLATES = {
  invoiceSubject: "{druh} {cislo} od {dodavatel}",
  invoiceBody: `Dobrý den,

v příloze zasíláme doklad {cislo} na částku {castka} se splatností {splatnost}.
Platbu prosím proveďte převodem s variabilním symbolem {variabilni_symbol}.

Děkujeme a v případě dotazů se na nás neváhejte obrátit.

S pozdravem
{dodavatel}`,
  reminderSubject: "Upomínka: {druh} {cislo} po splatnosti",
  reminderBody: `Dobrý den,

dovolujeme si Vás upozornit, že doklad {cislo} na částku {castka} (zbývá uhradit {zbyva}) byl splatný {splatnost} a dosud jsme neobdrželi platbu. Doklad je po splatnosti {dnu_po_splatnosti} dní.
Prosíme o úhradu převodem na účet {ucet} s variabilním symbolem {variabilni_symbol}. Kopii dokladu přikládáme.

Pokud jste již platbu provedli, považujte prosím tuto zprávu za bezpředmětnou.

S pozdravem
{dodavatel}`,
} as const;

const VAR = /\{([a-z_]+)\}/g;

/** Dosadí proměnné; neznámé a nevyplněné proměnné nechá (prázdná hodnota se dosadí jako prázdný text). */
export function renderTemplate(text: string, vars: Partial<Record<string, string>>): string {
  return text.replace(VAR, (m, key: string) => (key in vars ? (vars[key] ?? "") : m));
}

/** Proměnné v textu, které systém nezná (překlep: `{castak}`); pro kontrolu při ukládání šablony. */
export function unknownVariables(text: string): string[] {
  return [...new Set([...text.matchAll(VAR)].map((m) => m[1]!).filter((k) => !KNOWN.has(k)))];
}

const KIND_LABEL: Record<string, string> = {
  proforma: "Zálohová faktura",
  partial: "Faktura",
  final: "Faktura",
  credit_note: "Dobropis",
  retention: "Faktura",
};

export type MailInvoice = {
  number: string | null;
  kind: string;
  currency: string;
  grossMinor: number;
  paidMinor: number;
  dueDate: string | null;
  variableSymbol: string | null;
  customerName: string;
  jobNumber: string | null;
  bankAccount: string | null;
};

/** Hodnoty proměnných pro jeden doklad. `today` je `YYYY-MM-DD` (kvůli testům se nebere z hodin). */
export function mailVariables(
  inv: MailInvoice,
  supplierName: string,
  today: string,
): Record<MailVariable, string> {
  const remaining = Math.max(0, inv.grossMinor - inv.paidMinor);
  const late = inv.dueDate
    ? Math.max(
        0,
        Math.round(
          (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${inv.dueDate}T12:00:00Z`)) / 86_400_000,
        ),
      )
    : 0;
  return {
    cislo: inv.number ?? "",
    druh: KIND_LABEL[inv.kind] ?? "Faktura",
    castka: formatMinor(inv.grossMinor, inv.currency),
    zbyva: formatMinor(remaining, inv.currency),
    splatnost: inv.dueDate ? formatDate(inv.dueDate) : "",
    dnu_po_splatnosti: String(late),
    variabilni_symbol: inv.variableSymbol ?? "",
    ucet: inv.bankAccount ?? "",
    nazev_firmy: inv.customerName,
    dodavatel: supplierName,
    zakazka: inv.jobNumber ?? "",
  };
}

/** Ukázkové hodnoty pro náhled šablony v Nastavení. */
export const EXAMPLE_VARIABLES = Object.fromEntries(
  MAIL_VARIABLES.map((v) => [v.key, v.example]),
) as Record<MailVariable, string>;

/** Předmět a text zprávy z šablony. Předmět je jednořádkový. */
export function renderMailText(
  tpl: { subject: string; body: string },
  vars: Partial<Record<string, string>>,
): { subject: string; body: string } {
  return {
    subject: renderTemplate(tpl.subject, vars)
      .replace(/\s*[\r\n]+\s*/g, " ")
      .trim(),
    body: renderTemplate(tpl.body, vars).replace(/\r\n/g, "\n").trim(),
  };
}

/** Lze doklad odeslat (a jako upomínku)? Vrací důvod odmítnutí, nebo `null`. */
export function dispatchBlocker(
  kind: "invoice" | "reminder",
  inv: { state: string; kind: string; dueDate: string | null },
  today: string,
): string | null {
  if (inv.state === "draft")
    return "Koncept ještě není vystavený. E-mailem jde odeslat až vystavený doklad.";
  if (kind === "invoice") return null;
  if (inv.kind === "credit_note") return "K dobropisu se upomínka neposílá.";
  if (inv.state === "paid") return "Doklad je už uhrazený, upomínku není třeba posílat.";
  if (inv.state === "credited") return "Doklad je stornovaný dobropisem, upomínku neposílejte.";
  if (!inv.dueDate || inv.dueDate >= today) return "Upomínku jde poslat až po splatnosti dokladu.";
  return null;
}
