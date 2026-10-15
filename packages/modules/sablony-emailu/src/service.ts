import { eq, sql } from "drizzle-orm";
import { NotImplementedError } from "@rebar/core/contracts";
import {
  createRecord,
  deleteRecord,
  getRecord,
  queryRecords,
  resolveEntity,
  updateRecord,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { searchContacts } from "@rebar/kontakty/api";
import { buildCatalog, contextFromTarget, resolveContext } from "./context";
import type {
  EmailContext,
  EmailEntityType,
  LogActivityResult,
  MarkUsedResult,
  PickOption,
  PreviewResult,
  RenderResult,
  TemplateOption,
  TemplateVariable,
} from "./contract";
import { buildPreview, composeLinks, docToText, snippet, textToDoc } from "./logic";
import { emailTemplate, type EMAIL_LANGUAGES } from "./schema";

type Deps = Pick<ModuleDeps, "registry" | "services">;
type Language = (typeof EMAIL_LANGUAGES)[number];

/** Entita šablon (klíč `email_template`) pro volání enginu. */
async function templateEntity(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry">,
): Promise<ResolvedEntity> {
  const def = deps.registry.get("email_template");
  if (!def) throw new NotFoundError("Šablony e-mailů nejsou zapnuté.");
  return resolveEntity(ctx.db, def);
}

type TemplateRow = {
  id: string;
  name: string;
  category: string | null;
  language: Language;
  subject: string;
  bodyText: string;
  usageCount: number;
  updatedAt: string;
};

/** Šablona, kterou aktér smí číst (cizí soukromá šablona je „nenalezená“). */
export async function loadTemplate(ctx: Ctx, deps: Deps, id: string): Promise<TemplateRow> {
  const entity = await templateEntity(ctx, deps);
  const { row } = await getRecord(ctx, deps.registry, entity, id);
  return {
    id: row.id,
    name: String(row.name ?? ""),
    category: (row.category as string | null) ?? null,
    language: ((row.language as Language | null) ?? "cs") as Language,
    subject: String(row.subject ?? ""),
    bodyText: String(row.bodyText ?? ""),
    usageCount: Number(row.usageCount ?? 0),
    updatedAt: row.updatedAt,
  };
}

/** Katalog proměnných pro editor a dialog. */
export function variables(deps: Pick<ModuleDeps, "services">): { variables: TemplateVariable[] } {
  return { variables: buildCatalog(deps) };
}

/** Náhled předmětu a textu s daty vybraných záznamů, adresát a odkazy (společné pro `render` a `preview`). */
async function previewOf(
  ctx: Ctx,
  deps: Deps,
  tpl: { subject: string; body: string },
  context: EmailContext,
): Promise<PreviewResult> {
  const known = new Set(buildCatalog(deps).map((v) => v.key));
  const resolved = await resolveContext(ctx, deps, context);
  const view = buildPreview(tpl, resolved.filled ? resolved.values : null, known);
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

/**
 * E-mail ze šablony pro kontakt, organizaci, obchod nebo zakázku (SAB-03): předmět a text s dosazenými proměnnými,
 * adresát (e-mail kontaktu) a adresa pro Gmail (`gmailUrl`, `null` při překročení limitu délky, R-46). Nic se neodesílá.
 */
export async function renderTemplate(
  ctx: Ctx,
  deps: Deps,
  input: { entityType: EmailEntityType; id: string; templateId: string },
): Promise<RenderResult> {
  const tpl = await loadTemplate(ctx, deps, input.templateId);
  const context = await contextFromTarget(ctx, deps, input.entityType, input.id);
  const view = await previewOf(ctx, deps, { subject: tpl.subject, body: tpl.bodyText }, context);
  return {
    ...view,
    template: { id: tpl.id, name: tpl.name, category: tpl.category, language: tpl.language },
  };
}

/** Náhled rozepsané šablony (editor): předmět a text z formuláře, hodnoty z vybraných záznamů. */
export async function previewDraft(
  ctx: Ctx,
  deps: Deps,
  input: { subject: string; body: string; context: EmailContext },
): Promise<PreviewResult> {
  return previewOf(ctx, deps, { subject: input.subject, body: input.body }, input.context);
}

/** Šablony pro výběr v dialogu „E-mail ze šablony“: nejpoužívanější první, pak podle názvu. */
export async function listTemplates(
  ctx: Ctx,
  deps: Deps,
  input: { q?: string | undefined; language?: Language | undefined; category?: string | undefined },
): Promise<TemplateOption[]> {
  const entity = await templateEntity(ctx, deps);
  const page = await queryRecords(ctx, deps.registry, entity, {
    ...(input.q ? { q: input.q } : {}),
    sort: [
      { attr: "usageCount", dir: "desc" },
      { attr: "name", dir: "asc" },
    ],
    limit: 200,
  });
  return page.rows
    .filter((r) => !input.language || r.language === input.language)
    .filter((r) => !input.category || r.category === input.category)
    .map((r) => ({
      id: r.id,
      name: String(r.name ?? ""),
      category: (r.category as string | null) ?? null,
      language: ((r.language as Language | null) ?? "cs") as Language,
      subject: String(r.subject ?? ""),
      snippet: snippet(String(r.bodyText ?? "")),
      usageCount: Number(r.usageCount ?? 0),
    }));
}

/** Hledání záznamů, kterými se náhled vyplní: kontakty a organizace přes API kontaktů, obchody a zakázky přes entity. */
export async function pickRecords(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry">,
  input: { kind: EmailEntityType; q?: string | undefined },
): Promise<PickOption[]> {
  if (input.kind === "person" || input.kind === "company") {
    const found = await searchContacts(ctx, { q: input.q, limit: 8, kinds: [input.kind] });
    if (input.kind === "person")
      return found.persons.map((p) => ({
        id: p.id,
        label: p.name,
        hint: p.email ?? p.companyName ?? null,
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
  const page = await queryRecords(ctx, deps.registry, entity, {
    ...(input.q ? { q: input.q } : {}),
    limit: 8,
  });
  return page.rows.map((r) => ({ id: r.id, label: String(r[def.titleKey] ?? ""), hint: null }));
}

/**
 * Započítá použití šablony (e-mail se otevřel v Gmailu nebo zkopíroval). Počítadlo se zvyšuje atomicky v SQL, takže
 * souběžná použití se neztratí. Šablonu musí aktér smět číst. `canLogActivity` říká, zda jde nabídnout zápis aktivity.
 */
export async function markUsed(ctx: Ctx, deps: Deps, templateId: string): Promise<MarkUsedResult> {
  await loadTemplate(ctx, deps, templateId);
  const [r] = await ctx.db
    .update(emailTemplate)
    .set({ usageCount: sql`${emailTemplate.usageCount} + 1` })
    .where(eq(emailTemplate.id, templateId))
    .returning({ usageCount: emailTemplate.usageCount });
  if (!r) throw new NotFoundError();
  return { usageCount: r.usageCount, canLogActivity: !!deps.services.optional("tasks") };
}

/**
 * Zapíše odeslaný e-mail jako hotovou aktivitu typu e-mail (SAB-04) přes službu `tasks` (modul úkolů). Aktivita se
 * naváže na kontakt, organizaci, obchod nebo zakázku, ze které se e-mail psal; viditelnost řeší služba (soukromý
 * záznam = soukromá aktivita). Bez zapnutého modulu úkolů dá srozumitelnou chybu.
 */
export async function logActivity(
  ctx: Ctx,
  deps: Deps,
  input: { entityType: EmailEntityType; id: string; subject: string },
): Promise<LogActivityResult> {
  const tasks = deps.services.optional("tasks");
  if (!tasks) throw new UserError("Zápis aktivity není dostupný: modul Úkoly není zapnutý.");
  const c = await contextFromTarget(ctx, deps, input.entityType, input.id);
  try {
    const { id } = await tasks.logDoneActivity(ctx, {
      typeKey: "email",
      subject: input.subject,
      ...(c.dealId ? { dealId: c.dealId } : {}),
      ...(c.companyId ? { companyId: c.companyId } : {}),
      ...(c.personId ? { personId: c.personId } : {}),
      ...(c.jobId ? { jobId: c.jobId } : {}),
    });
    return { activityId: id };
  } catch (e) {
    if (e instanceof NotImplementedError)
      throw new UserError("Zápis aktivity zatím není dostupný.");
    throw e;
  }
}

/**
 * Uloží předmět a text šablony z editoru (přes entitu: oprávnění `write`, audit a hledání jako u jiných změn). Tělo
 * jako dokument Tiptap se odvodí z textu v háčku entity. `expectedUpdatedAt` chrání před přepsáním cizí změny.
 */
export async function saveContent(
  ctx: Ctx,
  deps: Deps,
  input: { id: string; subject: string; bodyText: string; expectedUpdatedAt?: string | undefined },
): Promise<{ updatedAt: string }> {
  const entity = await templateEntity(ctx, deps);
  const { row } = await updateRecord(
    ctx,
    deps.registry,
    entity,
    input.id,
    { subject: input.subject.replace(/\s*[\r\n]+\s*/g, " ").trim(), bodyText: input.bodyText },
    input.expectedUpdatedAt ? { expectedUpdatedAt: input.expectedUpdatedAt } : {},
  );
  return { updatedAt: row.updatedAt };
}

/**
 * Port pro knihovnu e-mailů v Můj prostor (MPR-2, KNI-02): přesun textu mezi soukromou knihovnou a sdílenými
 * šablonami. Služba `emailTemplates` (`ServiceMap`); vše jde přes entitu, takže platí
 * oprávnění `sablony-emailu.*`, zámek i audit.
 */
export function emailTemplatesService(deps: ModuleDeps) {
  return {
    async importText(
      ctx: Ctx,
      input: {
        name: string;
        category: string | null;
        language: Language;
        subject: string;
        bodyText: string;
        bodyJson: Record<string, unknown>;
        tags: string[];
      },
    ): Promise<{ id: string; href: string }> {
      const entity = await templateEntity(ctx, deps);
      const base = {
        name: input.name,
        category: input.category,
        language: input.language,
        subject: input.subject,
        bodyText: input.bodyText,
      };
      // štítky knihovny nemusí existovat mezi štítky šablon; bez nich se text přesune také
      const created = await createRecord(
        ctx,
        deps.registry,
        entity,
        input.tags.length ? { ...base, tags: input.tags } : base,
      ).catch((e: unknown) => {
        if (input.tags.length && e instanceof UserError)
          return createRecord(ctx, deps.registry, entity, base);
        throw e;
      });
      const id = created.row.id;
      await ctx.db
        .update(emailTemplate)
        .set({ bodyJson: input.bodyJson })
        .where(eq(emailTemplate.id, id));
      return { id, href: `/sablony-emailu/${id}` };
    },

    async exportText(ctx: Ctx, id: string) {
      let tpl: TemplateRow;
      try {
        tpl = await loadTemplate(ctx, deps, id);
      } catch (e) {
        if (e instanceof NotFoundError) return null;
        throw e;
      }
      const [r] = await ctx.db
        .select({ bodyJson: emailTemplate.bodyJson, tags: emailTemplate.tags })
        .from(emailTemplate)
        .where(eq(emailTemplate.id, id));
      return {
        name: tpl.name,
        category: tpl.category,
        subject: tpl.subject,
        bodyText: tpl.bodyText || docToText(r?.bodyJson),
        bodyJson: r?.bodyJson ?? textToDoc(tpl.bodyText),
        tags: r?.tags ?? [],
      };
    },

    async remove(ctx: Ctx, id: string): Promise<void> {
      const entity = await templateEntity(ctx, deps);
      await getRecord(ctx, deps.registry, entity, id);
      await deleteRecord(ctx, entity, id);
    },
  };
}

/** Typ služby pro knihovnu (shodný s portem v `muj-prostor/src/library/preview.ts`). */
export type EmailTemplatesService = ReturnType<typeof emailTemplatesService>;
