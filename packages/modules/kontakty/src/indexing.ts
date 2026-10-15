import type { EntityDef } from "@rebar/core/entities";
import { phoneSearchKeys } from "@rebar/core/contracts";

/*
  Co se o organizaci a osobě indexuje pro hledání (Cmd+K). Odděleno od `entities.ts`, aby služby mohly zaindexovat
  záznam, který založily mimo engine, bez kruhového importu.
*/

type Row = Record<string, unknown>;
const text = (...parts: unknown[]) => parts.filter(Boolean).join(" ");
const phoneKeys = (v: unknown) => (typeof v === "string" ? phoneSearchKeys(v).join(" ") : "");

/** Dokument hledání organizace: název, město a IČO v podtitulku, ostatní údaje jen k hledání. */
export function companySearchDoc(r: Row) {
  return {
    title: String(r.name),
    ...(r.city || r.ico ? { subtitle: [r.city, r.ico].filter(Boolean).join(" · ") } : {}),
    extra: text(r.officialName, r.ico, r.dic, r.email, r.phone, phoneKeys(r.phone), r.webDomain),
  };
}

/** Dokument hledání osoby: jméno, pozice; hlavní e-mail a telefon (včetně klíčů pro hledání podčástí čísla). */
export function personSearchDoc(r: Row) {
  return {
    title: String(r.fullName ?? r.lastName),
    ...(r.position ? { subtitle: String(r.position) } : {}),
    extra: text(r.primaryEmail, r.primaryPhone, phoneKeys(r.primaryPhone), r.linkedin),
  };
}

/** Minimální popis entity pro `indexRecord` (jen klíč a hledání; bez vlastních polí). */
export const companyIndex = {
  def: { key: "company", search: companySearchDoc } as unknown as EntityDef,
};
/** Minimální popis entity pro `indexRecord` (jen klíč a hledání; bez vlastních polí). */
export const personIndex = {
  def: { key: "person", search: personSearchDoc } as unknown as EntityDef,
};
