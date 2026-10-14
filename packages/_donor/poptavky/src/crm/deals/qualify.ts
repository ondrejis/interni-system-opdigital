import { z } from "zod";
import { createRecord, resolveEntity } from "@rebar/core/entities";
import type { EntityRegistry } from "@rebar/core/entities";
import { can, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { findContactDuplicates, type MatchedBy } from "./duplicates";

/** Jak naložit s nalezenými duplicitami: zeptat se (chyba s návodem), použít nalezenou, nebo založit novou. */
export type DuplicatePolicy = "ask" | "use" | "create";

/** Údaje nové firmy při kvalifikaci a rychlém zadání (doplněné z ARES nebo ručně); použijí se jen při zakládání firmy. */
export const newCompanyData = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  dic: z.string().trim().max(20).optional(),
  street: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  zip: z.string().trim().max(12).optional(),
  web: z.string().trim().max(200).optional(),
  /** Typ kontaktu (klíč číselníku `company.type`). */
  type: z.string().trim().max(40).optional(),
});
/** Údaje nové firmy po průchodu schématem. */
export type NewCompanyData = z.output<typeof newCompanyData>;

/** Vstup určení firmy a osoby při kvalifikaci: vybrané záznamy, IČO a volba naložení s duplicitami. */
export type QualifyContacts = {
  companyId?: string | undefined;
  personId?: string | undefined;
  ico?: string | undefined;
  duplicates: DuplicatePolicy;
  /** Údaje nové firmy (ARES, ruční zadání). */
  companyData?: NewCompanyData | undefined;
};

const WHAT: Record<MatchedBy, string> = { ico: "IČO", email: "e-mailem", phone: "telefonem" };
const matchText = (by: readonly MatchedBy[]) =>
  by.map((b) => (b === "ico" ? "IČO" : WHAT[b])).join(" a ");

/**
 * Určí firmu a kontaktní osobu pro kvalifikaci poptávky: vybranou, jinak existující (kontrola duplicit podle IČO, e-mailu
 * a telefonu), jinak novou. Shoda v IČO je jednoznačná (IČO je unikátní), takže se existující firma použije vždy.
 * Shoda v e-mailu nebo telefonu se řídí volbou `duplicates`: `ask` odmítne větou, která duplicitu pojmenuje, `use` použije
 * nalezený záznam, `create` založí nový.
 */
export async function resolveQualifyContacts(
  c: Ctx,
  registry: EntityRegistry,
  row: Record<string, unknown>,
  input: QualifyContacts,
): Promise<{
  companyId: string;
  personId: string | null;
  createdCompany: boolean;
  createdPerson: boolean;
}> {
  const companyDef = registry.get("company");
  if (!companyDef) throw new UserError("Modul Kontakty není zapnutý.");
  const personDef = registry.get("person");

  let companyId = input.companyId ?? (row.company as string | null) ?? null;
  let personId = input.personId ?? (row.person as string | null) ?? null;
  const email = (row.contactEmail as string | null) ?? null;
  const phone = (row.contactPhone as string | null) ?? null;
  const contactName = String(row.contactName ?? "").trim();
  const companyText = String(row.companyName ?? "").trim();
  const needCompany = !companyId;
  let createdCompany = false;
  let createdPerson = false;
  const needPerson = !personId && !!contactName && !!personDef && contactName !== companyText;

  const found =
    (needCompany || needPerson) && can(c, "kontakty.read")
      ? await findContactDuplicates(c, { ico: input.ico, email, phone })
      : { companies: [], persons: [] };

  if (needCompany) {
    const byIco = found.companies.find((m) => m.matchedBy.includes("ico"));
    const other = found.companies[0];
    if (byIco) companyId = byIco.id;
    else if (other && input.duplicates === "ask")
      throw new UserError(
        `Firma „${other.name}“ se stejným ${matchText(other.matchedBy)} už existuje. Vyberte ji, nebo potvrďte založení nové firmy.`,
      );
    else if (other && input.duplicates === "use") companyId = other.id;
    else {
      const extra = input.companyData ?? {};
      const name = extra.name || companyText || contactName;
      if (!name)
        throw new UserError("Doplňte firmu nebo jméno kontaktu, ať je komu zakázku založit.");
      const created = await createRecord(c, registry, await resolveEntity(c.db, companyDef), {
        name,
        ...(input.ico ? { ico: input.ico } : {}),
        ...(extra.dic ? { dic: extra.dic } : {}),
        ...(extra.street ? { street: extra.street } : {}),
        ...(extra.city ? { city: extra.city } : {}),
        ...(extra.zip ? { zip: extra.zip } : {}),
        ...(extra.web ? { web: extra.web } : {}),
        ...(extra.type ? { type: extra.type } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      });
      companyId = created.row.id;
      createdCompany = true;
    }
  }

  if (needPerson && personDef) {
    const other = found.persons[0];
    if (other && input.duplicates === "ask")
      throw new UserError(
        `Osoba „${other.name}“ se stejným ${matchText(other.matchedBy)} už existuje. Vyberte ji, nebo potvrďte založení nové osoby.`,
      );
    if (other && input.duplicates === "use") personId = other.id;
    else {
      const created = await createRecord(c, registry, await resolveEntity(c.db, personDef), {
        name: contactName,
        company: companyId,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      });
      personId = created.row.id;
      createdPerson = true;
    }
  }
  return { companyId: companyId!, personId, createdCompany, createdPerson };
}
