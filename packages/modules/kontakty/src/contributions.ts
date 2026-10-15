import { and, eq, isNull } from "drizzle-orm";
import type { ClientTabProvider, EmailVarsProvider } from "@rebar/core/contracts";
import type { PrivatePathDef } from "@rebar/core/module-server";
import { scopeOf } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatPhone } from "./normalize";
import { countCompanyContacts, getPrimaryContact } from "./persons";
import { privateScope } from "./private";
import { company, person } from "./schema";

/*
  Příspěvky modulu „kontakty“ pro ostatní moduly (D §2.5): karta klienta (počet kontaktů, hlavní kontakt) a proměnné
  šablon e-mailů (`{jmeno}`, `{firma}`…). Obojí čte jen záznamy, které aktér smí vidět (soukromé se nezapočítají).
*/

/** Karta klienta: záložka „Kontakty“ a souhrn kontaktů na Přehledu. */
export const clientCardProvider: ClientTabProvider = {
  async tabCounts(ctx, companyId) {
    if (!scopeOf(ctx, "kontakty.read")) return {};
    return { kontakty: await countCompanyContacts(ctx, companyId) };
  },
  async summary(ctx, companyId) {
    if (!scopeOf(ctx, "kontakty.read")) return {};
    const [count, primary] = await Promise.all([
      countCompanyContacts(ctx, companyId),
      getPrimaryContact(ctx, companyId),
    ]);
    return { contacts: { count, primary } };
  },
};

const VARS = [
  { key: "jmeno", label: "Jméno (oslovení)" },
  { key: "prijmeni", label: "Příjmení" },
  { key: "firma", label: "Firma" },
  { key: "email", label: "E-mail" },
  { key: "telefon", label: "Telefon" },
] as const;

/** Proměnné pro e-mail osobě: křestní jméno (jinak příjmení), příjmení, její hlavní organizace, e-mail a telefon. */
export const personEmailVars: EmailVarsProvider = {
  entityType: "person",
  vars: VARS,
  async resolve(ctx, id): Promise<Record<string, string>> {
    const [p] = await ctx.db
      .select({
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.primaryEmail,
        phone: person.primaryPhone,
        companyName: company.name,
      })
      .from(person)
      .leftJoin(company, and(eq(company.id, person.primaryCompanyId), isNull(company.deletedAt)))
      .where(and(eq(person.id, id), isNull(person.deletedAt), privateScope(ctx, person)));
    if (!p) return {};
    return {
      jmeno: p.firstName || p.lastName,
      prijmeni: p.lastName,
      firma: p.companyName ?? "",
      email: p.email ?? "",
      telefon: formatPhone(p.phone),
    };
  },
};

/**
 * Proměnné pro e-mail organizaci: její název, oslovení hlavního kontaktu (rozhodující, jinak první s e-mailem) a jeho
 * údaje. Bez kontaktu zůstanou osobní proměnné prázdné.
 */
export const companyEmailVars: EmailVarsProvider = {
  entityType: "company",
  vars: VARS,
  async resolve(ctx, id): Promise<Record<string, string>> {
    const [c] = await ctx.db
      .select({ name: company.name, email: company.email, phone: company.phone })
      .from(company)
      .where(and(eq(company.id, id), isNull(company.deletedAt), privateScope(ctx, company)));
    if (!c) return {};
    const primary = await getPrimaryContact(ctx, id);
    let first = "";
    let last = "";
    if (primary) {
      const [p] = await ctx.db
        .select({ firstName: person.firstName, lastName: person.lastName })
        .from(person)
        .where(eq(person.id, primary.personId));
      first = p?.firstName || p?.lastName || "";
      last = p?.lastName ?? "";
    }
    return {
      jmeno: first,
      prijmeni: last,
      firma: c.name,
      email: primary?.email ?? c.email ?? "",
      telefon: formatPhone(primary?.phone ?? c.phone),
    };
  },
};

/** Posledních N viditelných ID z tabulky: vstup pro canary test soukromí (cesta se projde nad skutečnými daty). */
async function someIds(ctx: Ctx, kind: "company" | "person"): Promise<string[]> {
  const t = kind === "company" ? company : person;
  const rows = await ctx.db
    .select({ id: t.id })
    .from(t)
    .where(and(isNull(t.deletedAt), privateScope(ctx, t)))
    .limit(50);
  return rows.map((r) => r.id);
}

/**
 * Ruční čtecí cesty modulu pro test soukromí (D §5.4): příspěvky karty klienta a proměnné e-mailů. Test je spustí
 * jako Partner i jako vlastník nad sestavou se soukromými záznamy a hledá v odpovědi canary řetězec.
 */
export const privatePaths: readonly PrivatePathDef[] = [
  {
    name: "kontakty.clientCard.tabCounts",
    run: async (ctx) => {
      const ids = await someIds(ctx, "company");
      return Promise.all(ids.map((id) => clientCardProvider.tabCounts!(ctx, id)));
    },
  },
  {
    name: "kontakty.clientCard.summary",
    run: async (ctx) => {
      const ids = await someIds(ctx, "company");
      return Promise.all(ids.map((id) => clientCardProvider.summary!(ctx, id)));
    },
  },
  {
    name: "kontakty.emailVars.company",
    run: async (ctx) => {
      const ids = await someIds(ctx, "company");
      return Promise.all(ids.map((id) => companyEmailVars.resolve(ctx, id)));
    },
  },
  {
    name: "kontakty.emailVars.person",
    run: async (ctx) => {
      const ids = await someIds(ctx, "person");
      return Promise.all(ids.map((id) => personEmailVars.resolve(ctx, id)));
    },
  },
  {
    // soukromá osoba (i když se jí nepřipíše do e-mailu) se nesmí objevit v kontaktech cizí organizace
    name: "kontakty.api.getPrimaryContact",
    run: async (ctx) => {
      const ids = await someIds(ctx, "company");
      return Promise.all(ids.map((id) => getPrimaryContact(ctx, id)));
    },
  },
];

