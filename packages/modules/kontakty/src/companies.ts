import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { indexRecord } from "@rebar/core/entities";
import { inTx, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { checkCompanyDuplicates, type CompanyDuplicate } from "./duplicates";
import { companyIndex } from "./indexing";
import { normalizeIco, webDomainOf } from "./normalize";
import { privateScope } from "./private";
import { company } from "./schema";

/** Adresa detailu organizace (stejná jako `EntityDef.url`). */
export const companyUrl = (id: string) => `/kontakty/firmy/${id}`;

/** Věta pro uživatele, když IČO už v evidenci je; bez práva na záznam se neprozradí název. */
export function icoDuplicateMessage(ico: string, match: CompanyDuplicate): string {
  return match.visible
    ? `Organizace s IČO ${ico} už existuje: „${match.name}“ (${companyUrl(match.id)}). Otevřete ji místo zakládání nové.`
    : `Organizace s IČO ${ico} už v evidenci je (nemáte k ní přístup).`;
}

/**
 * IČO ve tvaru k uložení: osm číslic (kratší se doplní nulami), prázdné = `null`. Nesmysl (písmena, víc než osm číslic)
 * je chyba pro uživatele. Kontrolní součet se nevynucuje (zahraniční a historická IČO); hlídá ho jen náhled ARES.
 */
export function icoForStorage(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const ico = /^[\d\s-]+$/.test(text) ? normalizeIco(text) : null;
  if (!ico) throw new UserError("IČO má mít nejvýše osm číslic.");
  return ico;
}

/**
 * Stejné IČO nedovolí (ORG-05): vyhodí větu s odkazem na existující organizaci. `excludeId` je upravovaná
 * organizace. Volá háček entity i služby, které organizaci zakládají mimo engine.
 */
export async function assertIcoFree(
  ctx: Ctx,
  ico: string | null,
  excludeId?: string,
): Promise<void> {
  if (!ico) return;
  const { icoMatch } = await checkCompanyDuplicates(ctx, { ico, excludeId: excludeId ?? null });
  if (icoMatch) throw new UserError(icoDuplicateMessage(ico, icoMatch));
}

/** Živá organizace podle IČO (v jakémkoli zápisu), nebo `null`; soukromé záznamy se aktérovi bez práva neukážou. */
export async function findCompanyByIco(
  ctx: Ctx,
  icoInput: string,
): Promise<{ id: string; name: string } | null> {
  const ico = normalizeIco(icoInput);
  if (!ico) return null;
  const [row] = await ctx.db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(and(isNull(company.deletedAt), eq(company.ico, ico), privateScope(ctx, company)))
    .limit(1);
  return row ?? null;
}

/** Živá organizace podle přesného názvu (bez ohledu na velikost písmen a diakritiku), nebo `null`. */
export async function findCompanyByName(
  ctx: Ctx,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const text = name.trim();
  if (!text) return null;
  const [row] = await ctx.db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(
      and(
        isNull(company.deletedAt),
        privateScope(ctx, company),
        sql`lower(f_unaccent(${company.name})) = lower(f_unaccent(${text}))`,
      ),
    )
    .orderBy(company.createdAt)
    .limit(1);
  return row ?? null;
}

/** Vstup založení organizace mimo engine (API a příkazy jiných modulů). */
export type CompanyInput = {
  name: string;
  ico?: string | null | undefined;
  officialName?: string | null | undefined;
  dic?: string | null | undefined;
  legalForm?: string | null | undefined;
  street?: string | null | undefined;
  city?: string | null | undefined;
  zip?: string | null | undefined;
  web?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  ownerId?: string | null | undefined;
  /** Doplněno z ARES: nastaví čas synchronizace. */
  aresSyncedAt?: Date | null | undefined;
};

/**
 * Založí organizaci přímo (bez enginu): IČO se normalizuje a musí být volné, doména webu se odvodí, vlastník je
 * výchozí aktér. Zapíše historii a zaindexuje. Oprávnění ke kontaktům nekontroluje (volající už ho ověřil svým
 * příkazem); `client_status` nenastavuje (R-15). Vrací id nové organizace.
 */
export async function createCompany(
  ctx: Ctx,
  input: CompanyInput,
): Promise<{ id: string; name: string }> {
  const name = input.name.trim();
  if (!name) throw new UserError("Název organizace je povinný.");
  const ico = icoForStorage(input.ico);
  return inTx(ctx, async (c) => {
    await assertIcoFree(c, ico);
    const values = {
      name,
      officialName: input.officialName?.trim() || null,
      ico,
      dic: input.dic?.trim() || null,
      legalForm: input.legalForm?.trim() || null,
      street: input.street?.trim() || null,
      city: input.city?.trim() || null,
      zip: input.zip?.trim() || null,
      web: input.web?.trim() || null,
      webDomain: webDomainOf(input.web),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      ownerId: input.ownerId === undefined ? c.actor.userId : input.ownerId,
      aresSyncedAt: input.aresSyncedAt ?? null,
      createdBy: c.actor.userId,
      updatedBy: c.actor.userId,
    };
    const [row] = await c.db.insert(company).values(values).returning();
    await recordAudit(c, {
      action: "create",
      entityType: "company",
      entityId: row!.id,
      summary: name,
      changes: [
        { field: "Název", old: null, new: name },
        ...(ico ? [{ field: "IČO", old: null, new: ico }] : []),
      ],
    });
    await indexRecord(c.db, companyIndex, row as unknown as Record<string, unknown>);
    return { id: row!.id, name };
  });
}
