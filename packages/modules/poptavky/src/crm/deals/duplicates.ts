import { and, isNull, or, sql, type SQL } from "drizzle-orm";
import { scopedWhere } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { company, person } from "@rebar/kontakty/schema";

/** Údaje, podle kterých se hledá existující firma nebo osoba. */
export type ContactQuery = {
  ico?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
};

/** V čem se nalezený záznam shoduje s hledaným: IČO, e-mail, telefon. */
export type MatchedBy = "ico" | "email" | "phone";

/** Existující firma, která se shoduje s hledanými údaji. */
export type CompanyMatch = {
  id: string;
  name: string;
  ico: string | null;
  email: string | null;
  phone: string | null;
  matchedBy: MatchedBy[];
};
/** Existující osoba, která se shoduje s hledanými údaji. */
export type PersonMatch = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  matchedBy: MatchedBy[];
};

/** IČO: jen číslice (mezery a pomlčky pryč), kratší se doplní zleva nulami na osm. Prázdné nebo nesmyslné = `null`. */
export function normalizeIco(v: string | null | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  if (!digits || digits.length > 8) return null;
  return digits.padStart(8, "0");
}

/** E-mail pro porovnání: bez mezer, malými písmeny; bez zavináče je neplatný (`null`). */
export function normalizeEmail(v: string | null | undefined): string | null {
  const e = (v ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

/** Telefon: devět koncových číslic (bez předvolby +420 / 00420); kratší než devět číslic se neporovnává. */
export function normalizePhone(v: string | null | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

const digitsOf = (col: SQL | unknown) => sql`regexp_replace(coalesce(${col}, ''), '\\D', '', 'g')`;

type Norm = { ico: string | null; email: string | null; phone: string | null };
const normalize = (q: ContactQuery): Norm => ({
  ico: normalizeIco(q.ico),
  email: normalizeEmail(q.email),
  phone: normalizePhone(q.phone),
});

/**
 * Najde existující firmy a osoby, které se shodují v IČO (jen firmy), e-mailu nebo telefonu (shoda bez ohledu na velikost
 * písmen, mezery a předvolbu). Respektuje rozsah oprávnění ke kontaktům aktéra (`kontakty.read`). Slouží kontrole duplicit
 * při kvalifikaci poptávky i rychlému zadání.
 */
export async function findContactDuplicates(
  ctx: Ctx,
  query: ContactQuery,
): Promise<{ companies: CompanyMatch[]; persons: PersonMatch[] }> {
  const n = normalize(query);
  if (!n.ico && !n.email && !n.phone) return { companies: [], persons: [] };

  const companyConds: SQL[] = [];
  if (n.ico) companyConds.push(sql`lpad(${digitsOf(company.ico)}, 8, '0') = ${n.ico}`);
  if (n.email) companyConds.push(sql`lower(trim(${company.email})) = ${n.email}`);
  if (n.phone) companyConds.push(sql`right(${digitsOf(company.phone)}, 9) = ${n.phone}`);
  const companies = await ctx.db
    .select({
      id: company.id,
      name: company.name,
      ico: company.ico,
      email: company.email,
      phone: company.phone,
    })
    .from(company)
    .where(
      and(
        isNull(company.deletedAt),
        or(...companyConds),
        scopedWhere(ctx, "kontakty.read", [company.ownerId]),
      ),
    )
    .limit(10);

  const personConds: SQL[] = [];
  if (n.email) personConds.push(sql`lower(trim(${person.email})) = ${n.email}`);
  if (n.phone) personConds.push(sql`right(${digitsOf(person.phone)}, 9) = ${n.phone}`);
  const persons = personConds.length
    ? await ctx.db
        .select({
          id: person.id,
          name: person.name,
          email: person.email,
          phone: person.phone,
          companyId: person.companyId,
        })
        .from(person)
        .where(
          and(
            isNull(person.deletedAt),
            or(...personConds),
            scopedWhere(ctx, "kontakty.read", [person.ownerId]),
          ),
        )
        .limit(10)
    : [];

  const by = (r: {
    ico?: string | null;
    email: string | null;
    phone: string | null;
  }): MatchedBy[] => {
    const out: MatchedBy[] = [];
    if (n.ico && normalizeIco(r.ico) === n.ico) out.push("ico");
    if (n.email && normalizeEmail(r.email) === n.email) out.push("email");
    if (n.phone && normalizePhone(r.phone) === n.phone) out.push("phone");
    return out;
  };
  return {
    companies: companies.map((c) => ({ ...c, matchedBy: by(c) })),
    persons: persons.map((p) => ({ ...p, matchedBy: by(p) })),
  };
}
