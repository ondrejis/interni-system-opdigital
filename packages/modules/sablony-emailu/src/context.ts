import { eq } from "drizzle-orm";
import { NotImplementedError, type EmailVarsProvider } from "@rebar/core/contracts";
import { schema } from "@rebar/core/db";
import { getRecord, resolveEntity } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { getPrimaryContact } from "@rebar/kontakty/api";
import type { EmailContext, EmailEntityType, PreviewLabels, TemplateVariable } from "./contract";
import { isEmailAddress } from "./logic";

/*
  Dosazovací data šablon e-mailů (SAB-02): katalog proměnných z příspěvků `emailVars` zapnutých modulů a hodnoty
  proměnných pro vybrané záznamy (kontakt, organizace, obchod, zakázka). Záznamy se čtou přes entity (`getRecord`),
  takže soukromé a cizí záznamy aktér nikdy neuvidí; sama šablona o obchodech a zakázkách nic neví (soft odkazy).
*/

/**
 * Proměnné, které mají šablony mít (D §2.5), i když je zatím žádný modul nepřispívá (modul není zapnutý): šablonu jde
 * psát předem, v katalogu jsou označené jako nedostupné a v náhledu zůstanou prázdné.
 */
export const DEFAULT_VARIABLES: readonly TemplateVariable[] = [
  { key: "jmeno", label: "Křestní jméno kontaktu", source: "person", available: false },
  { key: "prijmeni", label: "Příjmení kontaktu", source: "person", available: false },
  { key: "firma", label: "Název organizace", source: "company", available: false },
  { key: "obchod", label: "Název obchodu", source: "deal", available: false },
  { key: "zakazka", label: "Název zakázky", source: "job", available: false },
  { key: "odesilatel", label: "Jméno odesílatele (vy)", source: "sender", available: true },
];

/** Proměnné, které dodává víc zdrojů (kontakt i organizace): v katalogu patří tam, kam je čeká uživatel. */
const PREFERRED_SOURCE: Record<string, TemplateVariable["source"]> = { firma: "company" };

/** Zdroj proměnné, který poskytuje jádro (jméno přihlášeného), ne modul. */
export const SENDER_KEY = "odesilatel";

const KIND_LABEL: Record<EmailEntityType, string> = {
  company: "Organizace",
  person: "Kontakt",
  deal: "Obchod",
  job: "Zakázka",
};

/** Katalog proměnných: příspěvky modulů (`emailVars`) doplněné výchozími; odesílatele vyplňuje šablona sama. */
export function buildCatalog(deps: Pick<ModuleDeps, "services">): TemplateVariable[] {
  const byKey = new Map<string, TemplateVariable>();
  for (const p of deps.services.all("emailVars"))
    for (const v of p.vars)
      if (!byKey.has(v.key))
        byKey.set(v.key, {
          key: v.key,
          label: v.label,
          source: PREFERRED_SOURCE[v.key] ?? p.entityType,
          available: true,
        });
  for (const d of DEFAULT_VARIABLES) if (!byKey.has(d.key)) byKey.set(d.key, d);
  const sender = byKey.get(SENDER_KEY);
  byKey.set(SENDER_KEY, {
    key: SENDER_KEY,
    label: sender?.label ?? "Jméno odesílatele (vy)",
    source: "sender",
    available: true,
  });
  return [...byKey.values()];
}

const nonEmpty = (v: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string" && x.trim() !== ""));

/** Zavolá poskytovatele proměnných; nehotový (stub) poskytovatel nic nedodá, ale náhled nerozbije. */
async function resolveWith(
  ctx: Ctx,
  providers: readonly EmailVarsProvider[],
  type: EmailEntityType,
  id: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of providers) {
    if (p.entityType !== type) continue;
    try {
      for (const [k, v] of Object.entries(nonEmpty(await p.resolve(ctx, id))))
        if (!(k in out)) out[k] = v;
    } catch (e) {
      if (!(e instanceof NotImplementedError)) throw e;
    }
  }
  return out;
}

type Loaded = { title: string; row: Record<string, unknown> };

/** Záznam, který aktér smí číst (entita nezapnutého modulu, cizí soukromý i smazaný záznam = „nenalezeno“). */
async function load(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry">,
  type: EmailEntityType,
  id: string,
): Promise<Loaded> {
  const def = deps.registry.get(type);
  if (!def) throw new NotFoundError(`${KIND_LABEL[type]}: modul není zapnutý.`);
  const entity = await resolveEntity(ctx.db, def);
  const { row } = await getRecord(ctx, deps.registry, entity, id);
  return { title: String(row[def.titleKey] ?? ""), row };
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Jméno přihlášeného uživatele (proměnná `odesilatel`). */
export async function senderName(ctx: Ctx): Promise<string> {
  if (!ctx.actor.userId) return "";
  const [u] = await ctx.db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, ctx.actor.userId));
  return u?.name ?? "";
}

/** Vybrané záznamy z cílového záznamu (`entityType` + `id`): obchod nese organizaci a kontakt, zakázka organizaci. */
export async function contextFromTarget(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry">,
  entityType: EmailEntityType,
  id: string,
): Promise<EmailContext> {
  const t = await load(ctx, deps, entityType, id);
  if (entityType === "company") return { companyId: id };
  if (entityType === "person") return { personId: id, companyId: str(t.row.company) };
  return {
    [entityType === "deal" ? "dealId" : "jobId"]: id,
    companyId: str(t.row.company),
    personId: str(t.row.person),
  };
}

/** Hodnoty proměnných z vybraných záznamů, adresát a jména záznamů pro náhled. */
export async function resolveContext(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry" | "services">,
  context: EmailContext,
): Promise<{
  filled: boolean;
  values: Record<string, string>;
  to: string | null;
  labels: PreviewLabels;
}> {
  const providers = deps.services.all("emailVars");
  const labels: PreviewLabels = {};
  let personId = context.personId ?? null;
  let companyId = context.companyId ?? null;
  let to: string | null = null;

  if (personId) {
    const p = await load(ctx, deps, "person", personId);
    labels.person = p.title;
    to = str(p.row.email);
    companyId ??= str(p.row.company);
  }
  if (companyId) {
    const c = await load(ctx, deps, "company", companyId);
    labels.company = c.title;
    if (!personId) {
      // jen organizace: za kontakt se vezme její hlavní kontakt (je vidět v popisku náhledu)
      const main = await getPrimaryContact(ctx, companyId);
      if (main) {
        personId = main.personId;
        labels.person = main.name;
        to = main.email ?? null;
      }
    }
    to ??= str(c.row.email);
  }
  if (context.dealId) labels.deal = (await load(ctx, deps, "deal", context.dealId)).title;
  if (context.jobId) labels.job = (await load(ctx, deps, "job", context.jobId)).title;

  const chosen: [EmailEntityType, string | null][] = [
    ["person", personId],
    ["company", companyId],
    ["deal", context.dealId ?? null],
    ["job", context.jobId ?? null],
  ];
  const filled = chosen.some(([, id]) => !!id);
  const values: Record<string, string> = {};
  for (const [type, id] of chosen) {
    if (!id) continue;
    for (const [k, v] of Object.entries(await resolveWith(ctx, providers, type, id)))
      if (!(k in values)) values[k] = v;
  }
  if (filled && !values[SENDER_KEY]) {
    const me = await senderName(ctx);
    if (me) values[SENDER_KEY] = me;
  }
  return { filled, values, to: isEmailAddress(to) ? to.trim() : null, labels };
}
