import { desc } from "drizzle-orm";
import type { PrivatePathDef } from "@rebar/core/module-server";
import { company, person } from "@rebar/kontakty/schema";
import { listTemplates, previewDraft, renderTemplate } from "./service";

/**
 * Ruční čtecí cesty modulu pro test soukromí (D §5.4): co by aktér viděl v seznamu šablon, v náhledu s daty záznamů
 * a v hotovém e-mailu. Test je spustí jako Partner i jako vlastník nad sestavou se soukromými záznamy a hledá v odpovědi
 * canary řetězec (soukromá firma, osoba nebo šablona se nesmí objevit).
 */
export const privatePaths: readonly PrivatePathDef[] = [
  {
    name: "sablony-emailu.templates",
    run: (ctx, deps) => listTemplates(ctx, deps, {}),
  },
  {
    name: "sablony-emailu.render",
    run: async (ctx, deps) => {
      const templates = await listTemplates(ctx, deps, {});
      const t = templates[0];
      if (!t) return [];
      const companies = await ctx.db
        .select({ id: company.id })
        .from(company)
        .orderBy(desc(company.createdAt))
        .limit(30);
      const persons = await ctx.db
        .select({ id: person.id })
        .from(person)
        .orderBy(desc(person.createdAt))
        .limit(30);
      const run = async (entityType: "company" | "person", id: string) => {
        try {
          return await renderTemplate(ctx, deps, { entityType, id, templateId: t.id });
        } catch {
          return null; // nevidím = nenalezeno; to je správně
        }
      };
      return Promise.all([
        ...companies.map((c) => run("company", c.id)),
        ...persons.map((p) => run("person", p.id)),
      ]);
    },
  },
  {
    name: "sablony-emailu.preview",
    run: async (ctx, deps) => {
      const persons = await ctx.db.select({ id: person.id }).from(person).limit(30);
      return Promise.all(
        persons.map((p) =>
          previewDraft(ctx, deps, {
            subject: "{jmeno} {firma}",
            body: "{jmeno}",
            context: { personId: p.id },
          }).catch(() => null),
        ),
      );
    },
  },
];
