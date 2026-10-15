import { and, eq, isNull } from "drizzle-orm";
import { NotImplementedError, type EmailVarsProvider } from "@rebar/core/contracts";
import { schema } from "@rebar/core/db";
import { queryRecords, resolveEntity, visibleRecordTitles } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, UserError, canSeePrivate, scopedWhere } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { getPrimaryContact, searchContacts } from "@rebar/kontakty/api";
import { company, person } from "@rebar/kontakty/schema";
import { sql } from "drizzle-orm";
import { loadLibraryItem } from "./data";
import { buildPreview, composeLinks } from "./logic";
import type {
  LibraryPreview,
  LibraryVariable,
  LibraryVariables,
  PickOption,
  VariableSource,
} from "./types";

/*
  Náhled textu knihovny s daty vybraného kontaktu (KNI-01): katalog proměnných je týž jako u šablon e-mailů (příspěvky
  `emailVars` zapnutých modulů), hodnoty se doplní z vybraných záznamů a vyrenderuje je `renderEmailTemplate` z jádra.
*/

/** Vybrané záznamy, kterými se náhled vyplní. */
export type LibraryContext = {
  personId?: string | null | undefined;
  companyId?: string | null | undefined;
  dealId?: string | null | undefined;
  jobId?: string | null | undefined;
};

/**
 * Proměnné, které šablony e-mailů mají mít (D §2.5), i když je zatím žádný modul nepřispívá (modul není zapnutý nebo ještě
 * není hotový): text je jde psát předem, v katalogu jsou označené jako nedostupné.
 */
export const DEFAULT_VARIABLES: readonly LibraryVariable[] = [
  { key: "jmeno", label: "Křestní jméno kontaktu", source: "person", available: false },
  { key: "firma", label: "Název organizace", source: "company", available: false },
  { key: "obchod", label: "Název obchodu", source: "deal", available: false },
  { key: "zakazka", label: "Název zakázky", source: "job", available: false },
  { key: "odesilatel", label: "Jméno odesílatele (vy)", source: "sender", available: true },
];

const KINDS = ["person", "company", "deal", "job"] as const;

/** Katalog proměnných: příspěvky modulů (`emailVars`) doplněné výchozími; odesílatele umí vyplnit knihovna sama. */
export function buildCatalog(deps: Pick<ModuleDeps, "services">): LibraryVariables {
  const providers = deps.services.all("emailVars");
  const byKey = new Map<string, LibraryVariable>();
  for (const p of providers)
    for (const v of p.vars)
      if (!byKey.has(v.key))
        byKey.set(v.key, { key: v.key, label: v.label, source: p.entityType, available: true });
  for (const d of DEFAULT_VARIABLES) {
    const hit = byKey.get(d.key);
    if (!hit) byKey.set(d.key, d);
    else if (d.source === "sender") byKey.set(d.key, { ...hit, available: true });
  }
  const has = (t: EmailVarsProvider["entityType"]) => providers.some((p) => p.entityType === t);
  return {
    variables: [...byKey.values()],
    pickers: ["person", "company", ...(has("deal") ? (["deal"] as const) : []), ...(has("job") ? (["job"] as const) : [])],
    templatesAvailable: !!emailTemplatesPort(deps),
  };
}

type Port = {
  importText(
    ctx: Ctx,
    input: {
      name: string;
      category: string | null;
      language: "cs" | "sk" | "en";
      subject: string;
      bodyText: string;
      bodyJson: Record<string, unknown>;
      tags: string[];
    },
  ): Promise<{ id: string; href: string }>;
  exportText(
    ctx: Ctx,
    id: string,
  ): Promise<{
    name: string;
    category: string | null;
    subject: string;
    bodyText: string;
    bodyJson: Record<string, unknown> | null;
    tags: string[];
  } | null>;
  remove(ctx: Ctx, id: string): Promise<void>;
};
/** Služba sdílených šablon, kterou nabízí modul `sablony-emailu` (klíč `emailTemplates`; viz ZADOSTI MPR-2). */
export type EmailTemplatesPort = Port;

/**
 * Služba modulu `sablony-emailu` pro přesun textů (`emailTemplates`), nebo `undefined`, dokud ji modul nenabízí. Klíč zatím
 * není v `ServiceMap` (kontrakty jsou zmrazené), proto se bere bez typové kontroly; až ho architekt doplní, zmizí přetypování.
 */
export function emailTemplatesPort(deps: Pick<ModuleDeps, "services">): EmailTemplatesPort | undefined {
  const optional = deps.services.optional as unknown as (key: string) => unknown;
  return optional.call(deps.services, "emailTemplates") as EmailTemplatesPort | undefined;
}

const nonEmpty = (v: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string" && x.trim() !== ""));

/** Zavolá poskytovatele proměnných; nehotový (stub) poskytovatel nic nedodá, ale náhled nerozbije. */
async function resolveWith(
  ctx: Ctx,
  providers: readonly EmailVarsProvider[],
  type: EmailVarsProvider["entityType"],
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

/** Hlavní e-mail a organizace kontaktu; kontakt, který aktér nesmí vidět (rozsah, zámek), se bere jako neexistující. */
async function loadPerson(ctx: Ctx, deps: Pick<ModuleDeps, "registry">, id: string) {
  const titles = await visibleRecordTitles(ctx, deps.registry, "person", [id]);
  if (!titles[id]) throw new NotFoundError("Kontakt nenalezen.");
  const [row] = await ctx.db
    .select({ email: person.primaryEmail, companyId: person.primaryCompanyId })
    .from(person)
    .where(and(eq(person.id, id), isNull(person.deletedAt)));
  return { name: titles[id]!, email: row?.email ?? null, companyId: row?.companyId ?? null };
}

async function loadCompany(ctx: Ctx, deps: Pick<ModuleDeps, "registry">, id: string) {
  const titles = await visibleRecordTitles(ctx, deps.registry, "company", [id]);
  if (!titles[id]) throw new NotFoundError("Organizace nenalezena.");
  const [row] = await ctx.db
    .select({ email: company.email })
    .from(company)
    .where(and(eq(company.id, id), isNull(company.deletedAt)));
  return { name: titles[id]!, email: row?.email ?? null };
}

/** Jméno přihlášeného uživatele (proměnná `odesilatel`). */
async function senderName(ctx: Ctx): Promise<string> {
  if (!ctx.actor.userId) return "";
  const [u] = await ctx.db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, ctx.actor.userId));
  return u?.name ?? "";
}

/** Hodnoty proměnných z vybraných záznamů, adresát a jména záznamů pro náhled. */
export async function resolveContext(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry" | "services">,
  context: LibraryContext,
): Promise<{
  filled: boolean;
  values: Record<string, string>;
  to: string | null;
  labels: LibraryPreview["labels"];
}> {
  const providers = deps.services.all("emailVars");
  const labels: LibraryPreview["labels"] = {};
  let personId = context.personId ?? null;
  let companyId = context.companyId ?? null;
  let to: string | null = null;

  if (personId) {
    const p = await loadPerson(ctx, deps, personId);
    labels.person = p.name;
    to = p.email;
    companyId ??= p.companyId;
  }
  if (companyId) {
    const c = await loadCompany(ctx, deps, companyId);
    labels.company = c.name;
    if (!personId) {
      // jen organizace: za kontakt se vezme její hlavní kontakt (je vidět v popisku náhledu)
      const main = await getPrimaryContact(ctx, companyId);
      if (main) {
        personId = main.personId;
        labels.person = main.name;
        to = main.email ?? null;
      }
    }
    to ??= c.email;
  }
  if (context.dealId) {
    const t = await visibleRecordTitles(ctx, deps.registry, "deal", [context.dealId]);
    if (!t[context.dealId]) throw new NotFoundError("Obchod nenalezen.");
    labels.deal = t[context.dealId]!;
  }
  if (context.jobId) {
    const t = await visibleRecordTitles(ctx, deps.registry, "job", [context.jobId]);
    if (!t[context.jobId]) throw new NotFoundError("Zakázka nenalezena.");
    labels.job = t[context.jobId]!;
  }

  const chosen: [VariableSource, string | null][] = [
    ["person", personId],
    ["company", companyId],
    ["deal", context.dealId ?? null],
    ["job", context.jobId ?? null],
  ];
  const filled = chosen.some(([, id]) => !!id);
  const values: Record<string, string> = {};
  for (const [type, id] of chosen) {
    if (!id || type === "sender") continue;
    for (const [k, v] of Object.entries(await resolveWith(ctx, providers, type, id)))
      if (!(k in values)) values[k] = v;
  }
  if (filled && !values.odesilatel) {
    const me = await senderName(ctx);
    if (me) values.odesilatel = me;
  }
  return { filled, values, to, labels };
}

/** Náhled položky knihovny: předmět a text vyplněné daty vybraných záznamů, odkazy do Gmailu a upozornění na chybějící proměnné. */
export async function previewLibraryItem(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry" | "services">,
  input: { id: string; context?: LibraryContext | undefined },
): Promise<LibraryPreview> {
  const item = await loadLibraryItem(ctx, input.id);
  const known = new Set(buildCatalog(deps).variables.map((v) => v.key));
  const resolved = await resolveContext(ctx, deps, input.context ?? {});
  const view = buildPreview(
    { subject: item.subject, body: item.bodyText },
    resolved.filled ? resolved.values : null,
    known,
  );
  const links = composeLinks({ to: resolved.to, subject: view.subject, body: view.body });
  return {
    subject: view.subject,
    body: view.body,
    subjectParts: view.subjectParts,
    bodyParts: view.bodyParts,
    missing: view.missing,
    unknown: view.unknown,
    to: resolved.to,
    gmailUrl: links.gmailUrl,
    mailtoUrl: links.mailtoUrl,
    tooLong: links.tooLong,
    labels: resolved.labels,
    filled: resolved.filled,
  };
}

/** Hledání záznamů pro výběr v náhledu: kontakty a organizace přes API kontaktů, obchody a zakázky přes entity. */
export async function pickRecords(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry">,
  input: { kind: (typeof KINDS)[number]; q?: string | undefined },
): Promise<PickOption[]> {
  if (input.kind === "person" || input.kind === "company") {
    const found = await searchContacts(ctx, { q: input.q, limit: 8, kinds: [input.kind] });
    if (input.kind === "person")
      return found.persons.map((p) => ({
        id: p.id,
        label: p.name,
        hint: p.email ?? p.companyName ?? null,
        companyId: p.companyId,
        companyName: p.companyName,
      }));
    return found.companies.map((c) => ({
      id: c.id,
      label: c.name,
      hint: c.email ?? c.city ?? null,
    }));
  }
  const def = deps.registry.get(input.kind);
  if (!def) return [];
  const entity = await resolveEntity(ctx.db, def);
  const page = await queryRecords(ctx, deps.registry as never, entity, {
    ...(input.q ? { q: input.q } : {}),
    limit: 8,
  });
  return page.rows.map((r) => ({ id: r.id, label: String(r[def.titleKey] ?? ""), hint: null }));
}

export { UserError, canSeePrivate, scopedWhere, sql };
