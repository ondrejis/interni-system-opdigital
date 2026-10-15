import { and, asc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { scopedWhere } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { phoneSearchKeys } from "@rebar/core/contracts";
import { normalizeEmail } from "./normalize";
import { privateScope } from "./private";
import { company, person, personContactPoint } from "./schema";

/** Výsledek hledání organizace pro výběr (rychlé zadání, účastníci zakázky, sloučení). */
export type CompanyHit = {
  id: string;
  name: string;
  ico: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  clientStatus: string | null;
};
/** Osoba nalezená hledáním (jméno, kontakt a organizace pro výběr). */
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
const digitsCol = (col: SQL | unknown) => sql`regexp_replace(coalesce(${col}, ''), '\\D', '', 'g')`;

/**
 * Hledání organizací a osob podle jména (bez diakritiky a velikosti písmen), IČO, e-mailu a telefonu (podčástí čísla
 * bez předvolby: „777 12“ najde „+420 777 123 456“, i podle dalších než hlavních údajů). Respektuje rozsah
 * `kontakty.read` a soukromé záznamy. Prázdný dotaz vrátí naposledy upravené záznamy.
 */
export async function searchContacts(
  ctx: Ctx,
  input: {
    q?: string | undefined;
    limit?: number | undefined;
    kinds?: ("company" | "person")[] | undefined;
  },
): Promise<{ companies: CompanyHit[]; persons: PersonHit[] }> {
  const q = (input.q ?? "").trim();
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 25);
  const kinds = input.kinds ?? ["company", "person"];
  const phoneKey = phoneSearchKeys(q)[0] ?? null;
  const email = normalizeEmail(q);

  const companies: CompanyHit[] = kinds.includes("company")
    ? await ctx.db
        .select({
          id: company.id,
          name: company.name,
          ico: company.ico,
          city: company.city,
          email: company.email,
          phone: company.phone,
          clientStatus: company.clientStatus,
        })
        .from(company)
        .where(
          and(
            isNull(company.deletedAt),
            scopedWhere(ctx, "kontakty.read", [company.ownerId]),
            privateScope(ctx, company),
            q
              ? or(
                  like(company.name, q),
                  like(company.officialName, q),
                  like(company.ico, q),
                  like(company.email, q),
                  like(company.city, q),
                  phoneKey ? sql`${digitsCol(company.phone)} like ${`%${phoneKey}%`}` : undefined,
                )
              : undefined,
          ),
        )
        .orderBy(q ? asc(company.name) : sql`${company.updatedAt} desc`)
        .limit(limit)
    : [];

  const persons = kinds.includes("person")
    ? await ctx.db
        .select({
          id: person.id,
          name: person.fullName,
          email: person.primaryEmail,
          phone: person.primaryPhone,
          position: person.position,
          companyId: person.primaryCompanyId,
          companyName: company.name,
        })
        .from(person)
        .leftJoin(company, and(eq(company.id, person.primaryCompanyId), isNull(company.deletedAt)))
        .where(
          and(
            isNull(person.deletedAt),
            scopedWhere(ctx, "kontakty.read", [person.ownerId]),
            privateScope(ctx, person),
            q
              ? or(
                  like(person.fullName, q),
                  like(person.primaryEmail, q),
                  like(company.name, q),
                  phoneKey
                    ? sql`${digitsCol(person.primaryPhone)} like ${`%${phoneKey}%`}`
                    : undefined,
                  sql`exists (select 1 from ${personContactPoint} p where p.person_id = ${person.id} and p.deleted_at is null and (${email ? sql`p.value_norm = ${email}` : sql`false`} or ${like(sql`p.value_norm`, q)}${phoneKey ? sql` or ${digitsCol(sql`p.value_norm`)} like ${`%${phoneKey}%`}` : sql``}))`,
                )
              : undefined,
          ),
        )
        .orderBy(q ? asc(person.fullName) : sql`${person.updatedAt} desc`)
        .limit(limit)
    : [];

  return {
    companies,
    persons: persons.map((p): PersonHit => ({ ...p, name: p.name ?? "" })),
  };
}
