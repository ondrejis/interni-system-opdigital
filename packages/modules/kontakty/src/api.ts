import { and, asc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { scopedWhere } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { company, person, personContactPoint } from "./schema";

/** Výsledek hledání kontaktu pro výběr (rychlé zadání, účastníci zakázky, sloučení). */
export type CompanyHit = {
  id: string;
  name: string;
  ico: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  type: string | null;
};
/** Osoba nalezená hledáním (jméno, kontakt a firma pro výběr). */
export type PersonHit = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  companyId: string | null;
  companyName: string | null;
};

const like = (col: SQL | unknown, q: string) =>
  sql`lower(f_unaccent(coalesce(${col}, ''))) like lower(f_unaccent(${`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`}))`;

/** Číslice z hledaného textu, když to vypadá na telefon nebo IČO (tři a více číslic). */
const digitsOf = (q: string) => {
  const d = q.replace(/\D/g, "");
  return d.length >= 3 ? d : null;
};
const digitsCol = (col: SQL | unknown) => sql`regexp_replace(coalesce(${col}, ''), '\\D', '', 'g')`;

/**
 * Hledání firem a osob podle jména (bez diakritiky a velikosti písmen), IČO, e-mailu a telefonu. Respektuje rozsah
 * oprávnění ke kontaktům (`kontakty.read`). Prázdný dotaz vrátí posledně upravené záznamy.
 */
export async function searchContacts(
  ctx: Ctx,
  input: { q?: string | undefined; limit?: number | undefined; kinds?: ("company" | "person")[] },
): Promise<{ companies: CompanyHit[]; persons: PersonHit[] }> {
  const q = (input.q ?? "").trim();
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 25);
  const kinds = input.kinds ?? ["company", "person"];
  const digits = digitsOf(q);

  const companies: CompanyHit[] = kinds.includes("company")
    ? await ctx.db
        .select({
          id: company.id,
          name: company.name,
          ico: company.ico,
          city: company.city,
          email: company.email,
          phone: company.phone,
          type: company.type,
        })
        .from(company)
        .where(
          and(
            isNull(company.deletedAt),
            scopedWhere(ctx, "kontakty.read", [company.ownerId]),
            q
              ? or(
                  like(company.name, q),
                  like(company.ico, q),
                  like(company.email, q),
                  like(company.city, q),
                  digits ? sql`${digitsCol(company.phone)} like ${`%${digits}%`}` : undefined,
                )
              : undefined,
          ),
        )
        .orderBy(q ? asc(company.name) : sql`${company.updatedAt} desc`)
        .limit(limit)
    : [];

  const persons: PersonHit[] = kinds.includes("person")
    ? await ctx.db
        .select({
          id: person.id,
          name: person.name,
          email: person.email,
          phone: person.phone,
          position: person.position,
          companyId: person.companyId,
          companyName: company.name,
        })
        .from(person)
        .leftJoin(company, eq(company.id, person.companyId))
        .where(
          and(
            isNull(person.deletedAt),
            scopedWhere(ctx, "kontakty.read", [person.ownerId]),
            q
              ? or(
                  like(person.name, q),
                  like(person.email, q),
                  like(company.name, q),
                  digits ? sql`${digitsCol(person.phone)} like ${`%${digits}%`}` : undefined,
                  sql`exists (select 1 from ${personContactPoint} p where p.person_id = ${person.id} and p.deleted_at is null and (${like(sql`p.value`, q)}${digits ? sql` or ${digitsCol(sql`p.value`)} like ${`%${digits}%`}` : sql``}))`,
                )
              : undefined,
          ),
        )
        .orderBy(q ? asc(person.name) : sql`${person.updatedAt} desc`)
        .limit(limit)
    : [];

  return { companies, persons };
}

/** Další e-maily a telefony osoby s typem (hlavní údaje jsou ve sloupcích osoby). */
export async function listContactPoints(ctx: Ctx, personId: string) {
  return ctx.db
    .select({
      id: personContactPoint.id,
      kind: personContactPoint.kind,
      value: personContactPoint.value,
      label: personContactPoint.label,
    })
    .from(personContactPoint)
    .where(and(eq(personContactPoint.personId, personId), isNull(personContactPoint.deletedAt)))
    .orderBy(asc(personContactPoint.position), asc(personContactPoint.createdAt));
}

export { findContactDuplicates, normalizeEmail, normalizeIco, normalizePhone } from "./duplicates";
export type { CompanyMatch, ContactQuery, MatchedBy, PersonMatch } from "./duplicates";
export { aresLookup, isValidIco, normalizeIcoInput, mapAres } from "./ares";
export type { AresCompany, AresResult } from "./ares";
export { previewMerge, mergeContacts, discoverReferences } from "./merge";
export type { MergePreview, MergeEntity, MergeRefs } from "./merge";
