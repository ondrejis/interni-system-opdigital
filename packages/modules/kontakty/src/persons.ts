import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { indexRecord } from "@rebar/core/entities";
import { inTx, NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { personIndex } from "./indexing";
import { listPointsFor, primaryOf, setPersonPoints, type PointInput } from "./points";
import { privateScope } from "./private";
import { company, person, personCompany } from "./schema";

/** Adresa detailu osoby (stejná jako `EntityDef.url`). */
export const personUrl = (id: string) => `/kontakty/osoby/${id}`;

/** Vstup založení osoby mimo engine (rychlé založení, API, leady). */
export type PersonInput = {
  firstName?: string | null | undefined;
  lastName: string;
  /** Hlavní organizace. */
  companyId?: string | null | undefined;
  position?: string | null | undefined;
  linkedin?: string | null | undefined;
  isDecisionMaker?: boolean | undefined;
  ownerId?: string | null | undefined;
  points?: readonly PointInput[] | undefined;
};

/**
 * Založí osobu přímo (bez enginu) včetně kontaktních údajů: hlavní e-mail a telefon se zapíšou i na osobu. Vlastník
 * je výchozí aktér. Zapíše historii a zaindexuje. Oprávnění k vytvoření ověřuje volající (příkaz). Duplicity
 * nehlídá (to je na volajícím: `findPersonDuplicates`, protože o nich rozhoduje člověk).
 */
export async function createPerson(ctx: Ctx, input: PersonInput): Promise<{ id: string; name: string }> {
  const lastName = input.lastName.trim();
  if (!lastName) throw new UserError("Příjmení je povinné.");
  return inTx(ctx, async (c) => {
    if (input.companyId) {
      const [co] = await c.db
        .select({ id: company.id })
        .from(company)
        .where(and(eq(company.id, input.companyId), isNull(company.deletedAt)));
      if (!co) throw new UserError("Vybraná organizace neexistuje.");
    }
    const [row] = await c.db
      .insert(person)
      .values({
        firstName: input.firstName?.trim() || null,
        lastName,
        primaryCompanyId: input.companyId ?? null,
        position: input.position?.trim() || null,
        linkedin: input.linkedin?.trim() || null,
        isDecisionMaker: !!input.isDecisionMaker,
        ownerId: input.ownerId === undefined ? c.actor.userId : input.ownerId,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    const id = row!.id;
    const name = row!.fullName ?? lastName;
    const points = input.points?.length ? await setPersonPoints(c, id, input.points, { audit: false }) : [];
    const main = primaryOf(points);
    await recordAudit(c, {
      action: "create",
      entityType: "person",
      entityId: id,
      summary: name,
      changes: [
        { field: "Jméno", old: null, new: name },
        ...(main.email ? [{ field: "E-mail", old: null, new: main.email }] : []),
        ...(main.phone ? [{ field: "Telefon", old: null, new: main.phone }] : []),
      ],
    });
    if (!points.length) await indexRecord(c.db, personIndex, row as unknown as Record<string, unknown>);
    return { id, name };
  });
}

/** Kontakt organizace pro seznam v kartě: osoba s rolí v této organizaci a hlavními údaji. */
export type CompanyContact = {
  id: string;
  name: string;
  /** Pozice u hlavní organizace, u další organizace pozice v ní. */
  position: string | null;
  /** Role v další organizaci (u hlavní organizace prázdná). */
  role: string | null;
  isDecisionMaker: boolean;
  /** Organizace je hlavní organizací osoby. */
  isPrimaryCompany: boolean;
  email: string | null;
  phone: string | null;
};

/**
 * Kontakty organizace: osoby, které mají organizaci jako hlavní, i ty, které ji mají mezi dalšími. Nejdřív ti, kdo
 * rozhodují, potom hlavní organizace, pak podle příjmení. Soukromé osoby se vynechají, kdo je nevidí.
 */
export async function listCompanyContacts(
  ctx: Ctx,
  companyId: string,
  opts: { limit?: number } = {},
): Promise<CompanyContact[]> {
  const rows = await ctx.db
    .select({
      id: person.id,
      name: person.fullName,
      position: person.position,
      isDecisionMaker: person.isDecisionMaker,
      primaryCompanyId: person.primaryCompanyId,
      email: person.primaryEmail,
      phone: person.primaryPhone,
      memberRole: personCompany.role,
      memberPosition: personCompany.position,
    })
    .from(person)
    .leftJoin(
      personCompany,
      and(
        eq(personCompany.personId, person.id),
        eq(personCompany.companyId, companyId),
        isNull(personCompany.deletedAt),
      ),
    )
    .where(
      and(
        isNull(person.deletedAt),
        or(eq(person.primaryCompanyId, companyId), sql`${personCompany.id} is not null`),
        privateScope(ctx, person),
      ),
    )
    .orderBy(
      sql`${person.isDecisionMaker} desc`,
      sql`(${person.primaryCompanyId} = ${companyId}) desc`,
      asc(person.lastName),
      asc(person.firstName),
    )
    .limit(opts.limit ?? 200);
  // osoby založené bez hlavních sloupců (přímý zápis) doplnit z kontaktních údajů
  const missing = rows.filter((r) => !r.email && !r.phone).map((r) => r.id);
  const points = await listPointsFor(ctx.db, missing);
  return rows.map((r) => {
    const own = r.primaryCompanyId === companyId;
    const fromPoints = primaryOf(points.get(r.id) ?? []);
    return {
      id: r.id,
      name: r.name ?? "",
      position: own ? r.position : (r.memberPosition ?? r.position),
      role: own ? null : r.memberRole,
      isDecisionMaker: r.isDecisionMaker,
      isPrimaryCompany: own,
      email: r.email ?? fromPoints.email,
      phone: r.phone ?? fromPoints.phone,
    };
  });
}

/**
 * Hlavní kontaktní osoba organizace s primárním telefonem a e-mailem: ten, kdo rozhoduje; jinak osoba s hlavní
 * organizací touto organizací, která má telefon nebo e-mail; jinak první. `null`, když organizace nemá žádný kontakt.
 */
export async function getPrimaryContact(
  ctx: Ctx,
  companyId: string,
): Promise<{ personId: string; name: string; phone?: string; email?: string } | null> {
  const contacts = await listCompanyContacts(ctx, companyId, { limit: 50 });
  if (!contacts.length) return null;
  const best =
    contacts.find((c) => c.isDecisionMaker && (c.phone || c.email)) ??
    contacts.find((c) => c.isPrimaryCompany && (c.phone || c.email)) ??
    contacts.find((c) => c.phone || c.email) ??
    contacts[0]!;
  return {
    personId: best.id,
    name: best.name,
    ...(best.phone ? { phone: best.phone } : {}),
    ...(best.email ? { email: best.email } : {}),
  };
}

/** Počet kontaktů organizace (hlavních i dalších), bez soukromých osob pro toho, kdo je nevidí. */
export async function countCompanyContacts(ctx: Ctx, companyId: string): Promise<number> {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(distinct ${person.id})::int` })
    .from(person)
    .leftJoin(
      personCompany,
      and(
        eq(personCompany.personId, person.id),
        eq(personCompany.companyId, companyId),
        isNull(personCompany.deletedAt),
      ),
    )
    .where(
      and(
        isNull(person.deletedAt),
        or(eq(person.primaryCompanyId, companyId), sql`${personCompany.id} is not null`),
        privateScope(ctx, person),
      ),
    );
  return r?.n ?? 0;
}

/** Organizace osoby: hlavní a další s rolí. */
export type PersonCompanies = {
  primary: { companyId: string; name: string; position: string | null } | null;
  others: { id: string; companyId: string; name: string; role: string | null; position: string | null }[];
};

/** Organizace osoby (hlavní a další s rolí); smazané organizace se vynechají. */
export async function listPersonCompanies(ctx: Ctx, personId: string): Promise<PersonCompanies> {
  const [p] = await ctx.db
    .select({ primaryCompanyId: person.primaryCompanyId, position: person.position })
    .from(person)
    .where(and(eq(person.id, personId), isNull(person.deletedAt)));
  if (!p) throw new NotFoundError();
  let primary: PersonCompanies["primary"] = null;
  if (p.primaryCompanyId) {
    const [co] = await ctx.db
      .select({ id: company.id, name: company.name })
      .from(company)
      .where(and(eq(company.id, p.primaryCompanyId), isNull(company.deletedAt)));
    if (co) primary = { companyId: co.id, name: co.name, position: p.position };
  }
  const others = await ctx.db
    .select({
      id: personCompany.id,
      companyId: company.id,
      name: company.name,
      role: personCompany.role,
      position: personCompany.position,
    })
    .from(personCompany)
    .innerJoin(company, and(eq(company.id, personCompany.companyId), isNull(company.deletedAt)))
    .where(and(eq(personCompany.personId, personId), isNull(personCompany.deletedAt)))
    .orderBy(asc(personCompany.createdAt));
  return { primary, others: others.filter((o) => o.companyId !== p.primaryCompanyId) };
}

/** Další organizace osoby při úpravě. */
export type OtherCompanyInput = {
  companyId: string;
  role?: string | null | undefined;
  position?: string | null | undefined;
};

/**
 * Nastaví hlavní organizaci osoby (když je `primaryCompanyId` uvedeno) a nahradí seznam dalších organizací s rolí.
 * Hlavní organizace se mezi dalšími neopakuje; stejná organizace dvakrát je jedna. Zapíše historii a zaindexuje.
 * Přístup k zápisu osoby ověřuje volající. Vrací výslednou podobu.
 */
export async function setPersonCompanies(
  ctx: Ctx,
  personId: string,
  input: { primaryCompanyId?: string | null | undefined; others: readonly OtherCompanyInput[] },
): Promise<PersonCompanies> {
  return inTx(ctx, async (c) => {
    const before = await listPersonCompanies(c, personId);
    const wanted = new Map<string, OtherCompanyInput>();
    for (const o of input.others) if (!wanted.has(o.companyId)) wanted.set(o.companyId, o);
    const primaryId =
      input.primaryCompanyId === undefined
        ? (before.primary?.companyId ?? null)
        : input.primaryCompanyId;
    if (primaryId) wanted.delete(primaryId);
    const ids = [...wanted.keys(), ...(primaryId ? [primaryId] : [])];
    if (ids.length) {
      const found = await c.db
        .select({ id: company.id })
        .from(company)
        .where(and(inArray(company.id, ids), isNull(company.deletedAt)));
      if (found.length !== new Set(ids).size) throw new UserError("Vybraná organizace neexistuje.");
    }
    if (input.primaryCompanyId !== undefined)
      await c.db
        .update(person)
        .set({ primaryCompanyId: primaryId, updatedBy: c.actor.userId })
        .where(eq(person.id, personId));
    const existing = await c.db
      .select()
      .from(personCompany)
      .where(and(eq(personCompany.personId, personId), isNull(personCompany.deletedAt)));
    const seen = new Set<string>();
    for (const row of existing) {
      const w = wanted.get(row.companyId);
      if (!w || seen.has(row.companyId)) {
        await c.db
          .update(personCompany)
          .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
          .where(eq(personCompany.id, row.id));
      } else {
        seen.add(row.companyId);
        await c.db
          .update(personCompany)
          .set({
            role: w.role?.trim() || null,
            position: w.position?.trim() || null,
            updatedBy: c.actor.userId,
          })
          .where(eq(personCompany.id, row.id));
      }
    }
    for (const [companyId, w] of wanted)
      if (!seen.has(companyId))
        await c.db.insert(personCompany).values({
          personId,
          companyId,
          role: w.role?.trim() || null,
          position: w.position?.trim() || null,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        });
    const after = await listPersonCompanies(c, personId);
    const fmt = (x: PersonCompanies) =>
      [
        x.primary ? `${x.primary.name} (hlavní)` : null,
        ...x.others.map((o) => `${o.name}${o.role ? ` – ${o.role}` : ""}`),
      ]
        .filter(Boolean)
        .join(", ") || null;
    if (fmt(before) !== fmt(after))
      await recordAudit(c, {
        action: "update",
        entityType: "person",
        entityId: personId,
        summary: "Změněny organizace osoby",
        changes: [{ field: "Organizace", old: fmt(before), new: fmt(after) }],
      });
    return after;
  });
}

/** Osoby z `ids` s hlavními údaji pro výběry a karty (jen živé a viditelné). */
export async function personBriefs(
  ctx: Ctx,
  ids: readonly string[],
): Promise<{ id: string; name: string; email: string | null; phone: string | null }[]> {
  if (!ids.length) return [];
  const rows = await ctx.db
    .select({
      id: person.id,
      name: person.fullName,
      email: person.primaryEmail,
      phone: person.primaryPhone,
    })
    .from(person)
    .where(and(inArray(person.id, [...ids]), isNull(person.deletedAt), privateScope(ctx, person)));
  return rows.map((r) => ({ ...r, name: r.name ?? "" }));
}

