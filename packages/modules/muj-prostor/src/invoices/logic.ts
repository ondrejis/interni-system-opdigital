import { addDaysIso } from "@rebar/core/time";
import { shiftRenewal } from "../hosting/logic";
import type { RecurringPeriod } from "../labels";

/*
  Čistá pravidla opakovaných faktur (FAK-01 až FAK-03, MPR-3): období faktury, termín přípravy návrhu, text řádku
  faktury, převod haléřů na koruny a identifikátory pro Fakturoid. Bez databáze, sítě a Reactu.
*/

/** Výchozí počet dní před obnovou, kdy se připraví návrh (`recurring_service.invoice_lead_days`). */
export const DEFAULT_INVOICE_LEAD_DAYS = 14;

/**
 * Období, které faktura pokrývá: od data obnovy do dne před další obnovou o období (ročně 12 měsíců, měsíčně 1).
 * Obnova 15. 3. 2027 ročně = 15. 3. 2027 až 14. 3. 2028. Měsíční zkrácení dne řeší `shiftRenewal`.
 */
export function invoicePeriod(
  nextRenewal: string,
  period: RecurringPeriod,
  since?: string | null,
): { from: string; to: string; next: string } {
  const from = nextRenewal.slice(0, 10);
  const next = shiftRenewal(from, period, since);
  return { from, to: addDaysIso(next, -1), next };
}

/** Den, od kterého se má návrh připravit (obnova − `leadDays`). */
export const prepareDateOf = (nextRenewal: string, leadDays: number): string =>
  addDaysIso(nextRenewal.slice(0, 10), -Math.max(0, leadDays));

/** Je čas připravit návrh? Platí i po termínu obnovy (dohnání, když úloha nebo aplikace nějaký den neběžela). */
export const isDueForPreparation = (
  nextRenewal: string | null | undefined,
  leadDays: number,
  today: string,
): boolean => !!nextRenewal && today >= prepareDateOf(nextRenewal, leadDays);

/** Datum v českém zápisu (`15. 3. 2027`). */
export const czDate = (date: string): string => {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return `${d}. ${m}. ${y}`;
};

/** Text řádku faktury: služba, web a období. */
export function invoiceLineName(input: {
  name: string;
  web?: string | null;
  from: string;
  to: string;
}): string {
  const web = input.web?.trim();
  return `${input.name}${web ? ` (${web})` : ""}, ${czDate(input.from)} až ${czDate(input.to)}`;
}

/** Haléře na koruny pro Fakturoid (na dvě desetinná místa, bez chyb plovoucí čárky). */
export const minorToMajor = (minor: number): number => Math.round(minor) / 100;

/**
 * Klíč idempotence faktury ve Fakturoidu: `custom_id` nese id návrhu. Před vytvořením se podle něj hledá, takže po
 * ztracené odpovědi (časový limit, pád) se faktura nevytvoří podruhé, ale převezme.
 */
export const invoiceCustomId = (invoiceId: string): string => `opsys-ri-${invoiceId}`;

/** `custom_id` odběratele ve Fakturoidu (jeden odběratel na klienta). */
export const subjectCustomId = (companyId: string): string => `opsys-co-${companyId}`;

/** Normalizace IČO na osm číslic (doplní úvodní nuly, odstraní mezery); neplatné vrátí `null`. */
export function normalizeIco(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\s+/g, "");
  if (!/^\d{1,8}$/.test(digits)) return null;
  return digits.padStart(8, "0");
}
