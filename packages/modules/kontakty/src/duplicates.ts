import { and, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { scopeOf, scopedWhere } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import {
  isGenericDomain,
  normalizeEmail,
  normalizeIco,
  normalizePhoneE164,
  webDomainOf,
} from "./normalize";
import type { ContactQuery, MatchedBy } from "./normalize";
import { canSeePrivate, privateScope } from "./private";
import { company, person, personContactPoint } from "./schema";

export { normalizeEmail, normalizeIco, normalizePhone } from "./normalize";
export type { ContactQuery, MatchedBy } from "./normalize";

/*
  Hledání duplicit v databázi (ORG-05, ORG-06, KON-03): stejné IČO se nedovolí, podobný název (trigram > 0,6) nebo
  stejná doména webu je varování „Možná duplicita“; osoby se shodují v e-mailu a telefonu (E.164) bez ohledu na
  mezery a předvolbu. Čisté normalizace jsou v `normalize.ts`.
*/

/** Podobnost názvů, od které se organizace hlásí jako možná duplicita (ORG-06). */
export const NAME_SIMILARITY_THRESHOLD = 0.6;

/**
 * Klíč názvu pro porovnání: bez diakritiky, velikosti písmen, teček a čárek a bez právních přípon (`s.r.o.`, `a.s.`,
 * `spol. s r.o.`…), takže „Novák Stavby, spol. s r.o.“ a „NOVAK STAVBY“ se shodují.
 */
export const nameKey = (expr: SQL | AnyPgColumn) =>
  sql`btrim(regexp_replace(regexp_replace(regexp_replace(lower(f_unaccent(${expr})), '[.,]', '', 'g'), '\\m(spol|sro|as|zs|vos|ks|sp|ops|se|druzstvo|s|ro)\\M', ' ', 'g'), '\\s+', ' ', 'g'))`;

/** Může aktér vidět řádek (soukromý záznam, rozsah „jen moje“ u `kontakty.read`)? */
export function canSeeRow(ctx: Ctx, row: { isPrivate: boolean; ownerId: string | null }): boolean {
  if (row.isPrivate && !canSeePrivate(ctx)) return false;
  const scope = scopeOf(ctx, "kontakty.read");
  if (scope === "all") return true;
  return scope === "own" && !!ctx.actor.userId && row.ownerId === ctx.actor.userId;
}

/** Nalezená organizace, která se shoduje s hledanou. */
export type CompanyDuplicate = {
  id: string;
  name: string;
  ico: string | null;
  city: string | null;
  reason: "ico" | "name" | "domain";
  /** Podobnost názvu 0–1 (jen `name`). */
  similarity?: number;
  /** Aktér záznam smí otevřít; jinak jsou údaje skryté a zbývá obecná věta. */
  visible: boolean;
};

/** Výsledek kontroly duplicit organizace. */
export type CompanyDuplicateCheck = {
  /** Stejné IČO už existuje: ukládání se zakáže a odkáže na tento záznam. */
  icoMatch: CompanyDuplicate | null;
  /** Podobný název nebo stejná doména webu: varování, jde pokračovat. */
  similar: CompanyDuplicate[];
};

/**
 * Zkontroluje, zda organizace s tímto IČO, podobným názvem nebo stejnou doménou webu už existuje. `excludeId` je
 * upravovaná organizace (sama sebe nehlásí). Přes soukromé záznamy se nevidí: shoda v IČO u soukromé organizace
 * vrátí `visible: false` bez názvu (uložit nejde, ale nic se neprozradí), ostatní shody se u skrytých záznamů vynechají.
 */
export async function checkCompanyDuplicates(
  ctx: Ctx,
  q: { name?: string | null; ico?: string | null; web?: string | null; excludeId?: string | null },
): Promise<CompanyDuplicateCheck> {
  const notSelf = q.excludeId ? ne(company.id, q.excludeId) : undefined;
  const alive = isNull(company.deletedAt);
  const cols = {
    id: company.id,
    name: company.name,
    ico: company.ico,
    city: company.city,
    isPrivate: company.isPrivate,
    ownerId: company.ownerId,
  };
  const hide = (r: { id: string; name: string; ico: string | null; city: string | null }) => ({
    id: "",
    name: "",
    ico: r.ico,
    city: null,
  });

  let icoMatch: CompanyDuplicate | null = null;
  const ico = normalizeIco(q.ico);
  if (ico) {
    const [r] = await ctx.db
      .select(cols)
      .from(company)
      .where(and(alive, notSelf, eq(company.ico, ico)))
      .limit(1);
    if (r) {
      const visible = canSeeRow(ctx, r);
      icoMatch = { ...(visible ? r : hide(r)), reason: "ico", visible };
    }
  }

  const similar: CompanyDuplicate[] = [];
  const seen = new Set<string>(icoMatch?.id ? [icoMatch.id] : []);
  // bez oprávnění ke čtení organizací se podobné nehledají (a nic se neprozradí); stejné IČO se hlásí vždy
  if (!scopeOf(ctx, "kontakty.read")) return { icoMatch, similar };
  const scope = and(privateScope(ctx, company), scopedWhere(ctx, "kontakty.read", [company.ownerId]));
  const name = (q.name ?? "").trim();
  if (name) {
    const key = nameKey(sql`${name}`);
    const sim = sql<number>`greatest(similarity(${nameKey(company.name)}, ${key}), coalesce(similarity(${nameKey(company.officialName)}, ${key}), 0))`;
    const rows = await ctx.db
      .select({ ...cols, sim })
      .from(company)
      .where(and(alive, notSelf, scope, sql`${sim} > ${NAME_SIMILARITY_THRESHOLD}`))
      .orderBy(sql`${sim} desc`)
      .limit(5);
    for (const { sim: s, ...r } of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      similar.push({ ...r, reason: "name", similarity: Math.round(s * 100) / 100, visible: true });
    }
  }
  const domain = webDomainOf(q.web);
  if (domain && !isGenericDomain(domain)) {
    const rows = await ctx.db
      .select(cols)
      .from(company)
      .where(and(alive, notSelf, scope, eq(company.webDomain, domain)))
      .limit(5);
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      similar.push({ ...r, reason: "domain", visible: true });
    }
  }
  return { icoMatch, similar };
}

/** Nalezená osoba, která se shoduje v e-mailu nebo telefonu. */
export type PersonDuplicate = {
  personId: string;
  name: string;
  /** Hlavní organizace osoby (pro rozlišení jmenovců). */
  companyName: string | null;
  match: "email" | "phone";
  /** Hodnota, ve které se shodují (zapsaná u nalezené osoby). */
  value: string;
};

/**
 * Osoby, které se shodují v některém z e-mailů (malá písmena) nebo telefonů (E.164: `777 123 456`, `+420777123456`
 * a `00420 777 123 456` jsou totéž). Bez osoby `excludeId`, bez soukromých osob (pro toho, kdo je nevidí). Osoba se
 * shoduje i podle jiného než hlavního údaje. Jedna osoba může být v obou druzích (e-mail dřív).
 */
export async function findPersonDuplicates(
  ctx: Ctx,
  q: { emails?: readonly string[] | undefined; phones?: readonly string[] | undefined; excludeId?: string | null | undefined },
): Promise<PersonDuplicate[]> {
  const emails = [...new Set((q.emails ?? []).map(normalizeEmail).filter((x): x is string => !!x))];
  const phones = [...new Set((q.phones ?? []).map(normalizePhoneE164).filter((x): x is string => !!x))];
  if (!emails.length && !phones.length) return [];
  const conds: SQL[] = [];
  if (emails.length)
    conds.push(and(eq(personContactPoint.kind, "email"), inArray(personContactPoint.valueNorm, emails))!);
  if (phones.length)
    conds.push(and(eq(personContactPoint.kind, "phone"), inArray(personContactPoint.valueNorm, phones))!);
  const rows = await ctx.db
    .select({
      personId: person.id,
      name: person.fullName,
      companyName: company.name,
      kind: personContactPoint.kind,
      value: personContactPoint.value,
    })
    .from(personContactPoint)
    .innerJoin(person, eq(person.id, personContactPoint.personId))
    .leftJoin(company, and(eq(company.id, person.primaryCompanyId), isNull(company.deletedAt)))
    .where(
      and(
        isNull(personContactPoint.deletedAt),
        isNull(person.deletedAt),
        or(...conds),
        q.excludeId ? ne(person.id, q.excludeId) : undefined,
        privateScope(ctx, person),
      ),
    )
    .orderBy(sql`${personContactPoint.kind} asc`, person.createdAt)
    .limit(20);
  const out: PersonDuplicate[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.personId}:${r.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      personId: r.personId,
      name: r.name ?? "",
      companyName: r.companyName ?? null,
      match: r.kind,
      value: r.value,
    });
  }
  return out;
}

/** Existující organizace, která se shoduje s hledanými údaji. */
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

const digitsOf = (col: SQL | AnyPgColumn) => sql`regexp_replace(coalesce(${col}, ''), '\\D', '', 'g')`;

/**
 * Najde existující organizace a osoby, které se shodují v IČO (jen organizace), e-mailu nebo telefonu (bez ohledu
 * na velikost písmen, mezery a předvolbu; osoby podle všech jejich údajů, ne jen hlavních). Respektuje rozsah
 * `kontakty.read` aktéra a soukromé záznamy. Slouží kontrole duplicit při zakládání obchodů a rychlém zadání a při
 * sloučení kontaktů.
 */
export async function matchContactDuplicates(
  ctx: Ctx,
  query: ContactQuery,
): Promise<{ companies: CompanyMatch[]; persons: PersonMatch[] }> {
  const ico = normalizeIco(query.ico);
  const email = normalizeEmail(query.email);
  const phone = normalizePhoneE164(query.phone);
  if (!ico && !email && !phone) return { companies: [], persons: [] };

  const companyConds: SQL[] = [];
  if (ico) companyConds.push(eq(company.ico, ico));
  if (email) companyConds.push(sql`lower(trim(${company.email})) = ${email}`);
  if (phone) {
    const nine = phone.replace(/\D/g, "").slice(-9);
    companyConds.push(sql`right(${digitsOf(company.phone)}, 9) = ${nine}`);
  }
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
        privateScope(ctx, company),
      ),
    )
    .limit(10);

  const persons: PersonMatch[] = [];
  if (email || phone) {
    const found = await findPersonDuplicates(ctx, {
      emails: email ? [email] : [],
      phones: phone ? [phone] : [],
    });
    const ids = [...new Set(found.map((f) => f.personId))];
    const rows = ids.length
      ? await ctx.db
          .select({
            id: person.id,
            name: person.fullName,
            email: person.primaryEmail,
            phone: person.primaryPhone,
            companyId: person.primaryCompanyId,
          })
          .from(person)
          .where(and(inArray(person.id, ids), scopedWhere(ctx, "kontakty.read", [person.ownerId])))
      : [];
    for (const r of rows)
      persons.push({
        id: r.id,
        name: r.name ?? "",
        email: r.email,
        phone: r.phone,
        companyId: r.companyId,
        matchedBy: [
          ...new Set(found.filter((f) => f.personId === r.id).map((f) => f.match as MatchedBy)),
        ],
      });
  }

  const by = (r: { ico?: string | null; email: string | null; phone: string | null }): MatchedBy[] => {
    const out: MatchedBy[] = [];
    if (ico && normalizeIco(r.ico) === ico) out.push("ico");
    if (email && normalizeEmail(r.email) === email) out.push("email");
    if (phone && normalizePhoneE164(r.phone) === phone) out.push("phone");
    return out;
  };
  return {
    companies: companies.map((c) => ({ ...c, matchedBy: by(c) })),
    persons,
  };
}
