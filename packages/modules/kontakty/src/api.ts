import { NotImplementedError } from "@rebar/core/contracts";
import type { Ctx } from "@rebar/core/rbac";

export { normalizeEmail, normalizeIco, normalizePhone } from "./duplicates";
export type { ContactQuery, MatchedBy } from "./duplicates";
export { aresLookup, isValidIco, normalizeIcoInput, mapAres } from "./ares";
export type { AresCompany, AresResult } from "./ares";

/*
  Veřejné API pro jiné moduly podle D §2.4 (`@rebar/kontakty/api`). Těla doplní KON; dokud neexistují, vyhazují
  `NotImplementedError`.
*/

/** Živá firma podle IČO (bez ohledu na formát zápisu), nebo `null`. */
export async function findCompanyByIco(
  _ctx: Ctx,
  _ico: string,
): Promise<{ id: string; name: string } | null> {
  throw new NotImplementedError("kontakty.api.findCompanyByIco");
}

/** Hlavní kontaktní osoba firmy s primárním telefonem a e-mailem, nebo `null`. */
export async function getPrimaryContact(
  _ctx: Ctx,
  _companyId: string,
): Promise<{ personId: string; name: string; phone?: string; email?: string } | null> {
  throw new NotImplementedError("kontakty.api.getPrimaryContact");
}

/** Osoby, které se shodují v e-mailu nebo telefonu (E.164), bez osoby `excludeId`. */
export async function findContactDuplicates(
  _ctx: Ctx,
  _input: { emails?: string[]; phones?: string[]; excludeId?: string },
): Promise<{ personId: string; name: string; match: "email" | "phone" }[]> {
  throw new NotImplementedError("kontakty.api.findContactDuplicates");
}

/** Najde nebo založí kontakt a firmu z leadu (e-mail a telefon, firma podle IČO nebo názvu); firmě nenastaví `client_status`. */
export async function upsertContactFromLead(
  _ctx: Ctx,
  _input: { name: string; email?: string; phone?: string; companyName?: string; ico?: string },
): Promise<{
  personId: string;
  companyId: string | null;
  created: { person: boolean; company: boolean };
}> {
  throw new NotImplementedError("kontakty.api.upsertContactFromLead");
}

/** Rychle založí organizaci jen s názvem (a volitelně IČO a vlastníkem). */
export async function createCompanyQuick(
  _ctx: Ctx,
  _input: { name: string; ico?: string; ownerId?: string },
): Promise<{ id: string }> {
  throw new NotImplementedError("kontakty.api.createCompanyQuick");
}
