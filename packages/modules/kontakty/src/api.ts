import type { Ctx } from "@rebar/core/rbac";
import { inTx, UserError } from "@rebar/core/rbac";
import { createCompany } from "./companies";
import { findPersonDuplicates } from "./duplicates";
import { createPerson, type PersonInput } from "./persons";

/*
  Veřejné API modulu „kontakty“ pro jiné moduly (D §2.4, `@rebar/kontakty/api`). Smí ho importovat jen modul, který
  má `kontakty` v `dependsOn` (obchody, zakázky, klienti, reklama, šablony e-mailů, Můj prostor). Funkce neověřují
  oprávnění `kontakty.*` (to je na příkazu volajícího modulu), ale **respektují soukromé záznamy**: soukromá osoba
  nebo organizace se aktérovi bez `private.read` nenajde. Mock v testech: `vi.mock("@rebar/kontakty/api")`.
*/

export {
  normalizeEmail,
  normalizeIco,
  normalizePhone,
  normalizePhoneE164,
  isValidIco,
  isValidPhone,
  formatPhone,
  webDomainOf,
  splitFullName,
} from "./normalize";
export type { ContactQuery, MatchedBy } from "./normalize";
export { findCompanyByIco, findCompanyByName, companyUrl, icoDuplicateMessage } from "./companies";
export { getPrimaryContact, listCompanyContacts, countCompanyContacts, personUrl } from "./persons";
export type { CompanyContact } from "./persons";
export { upsertContactFromLead } from "./leads";
export type { LeadContactInput, LeadContactResult } from "./leads";
export { matchContactDuplicates, checkCompanyDuplicates, findPersonDuplicates } from "./duplicates";
export type {
  CompanyDuplicate,
  CompanyDuplicateCheck,
  CompanyMatch,
  PersonDuplicate,
  PersonMatch,
} from "./duplicates";
export { searchContacts } from "./search";
export type { CompanyHit, PersonHit } from "./search";
export { listPoints } from "./points";
export type { PointRow } from "./points";
export { lookupAres, setAresClient, createDbAresCache } from "./ares";

/**
 * Osoby, které se shodují v e-mailu nebo telefonu (E.164, bez ohledu na mezery a předvolbu) s některým ze zadaných,
 * bez osoby `excludeId`. Shoduje se i podle jiných než hlavních údajů osoby.
 */
export async function findContactDuplicates(
  ctx: Ctx,
  input: { emails?: string[]; phones?: string[]; excludeId?: string },
): Promise<{ personId: string; name: string; match: "email" | "phone" }[]> {
  const found = await findPersonDuplicates(ctx, input);
  return found.map((f) => ({ personId: f.personId, name: f.name, match: f.match }));
}

/**
 * Rychle založí organizaci jen s názvem (a volitelně IČO a vlastníkem). Stejné IČO nedovolí (vyhodí `UserError`
 * s odkazem na existující organizaci, použijte nejdřív `findCompanyByIco`). `client_status` nenastavuje.
 */
export async function createCompanyQuick(
  ctx: Ctx,
  input: { name: string; ico?: string; ownerId?: string },
): Promise<{ id: string }> {
  const { id } = await createCompany(ctx, {
    name: input.name,
    ico: input.ico ?? null,
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
  });
  return { id };
}

/**
 * Rychle založí kontaktní osobu (jméno, volitelně hlavní organizace, e-mail a telefon). Duplicity nehlídá: volající
 * si je předtím zjistí přes `findContactDuplicates` a rozhodne se (použít existující, nebo založit).
 */
export async function createPersonQuick(
  ctx: Ctx,
  input: {
    firstName?: string;
    lastName: string;
    companyId?: string;
    position?: string;
    email?: string;
    phone?: string;
    ownerId?: string;
  },
): Promise<{ id: string; name: string }> {
  const points: PersonInput["points"] = [
    ...(input.email?.trim() ? [{ kind: "email" as const, value: input.email }] : []),
    ...(input.phone?.trim() ? [{ kind: "phone" as const, value: input.phone }] : []),
  ];
  if (!input.lastName.trim()) throw new UserError("Příjmení je povinné.");
  return inTx(ctx, (c) =>
    createPerson(c, {
      firstName: input.firstName,
      lastName: input.lastName,
      companyId: input.companyId ?? null,
      position: input.position,
      ownerId: input.ownerId,
      points,
    }),
  );
}
