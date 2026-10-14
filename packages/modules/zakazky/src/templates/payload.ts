import { z } from "zod";
import { ITEM_KIND_KEYS } from "../budget/math";

/**
 * Obsah šablony zakázky (`job_template.payload`): kostra rozpočtu (objekty → oddíly → položky, volitelně s cenami),
 * úkoly zakázky a role týmu bez konkrétních lidí. Tvar je verzovaný (`v`), aby šel později rozšířit.
 */
export const itemTemplate = z.object({
  code: z.string().nullable().default(null),
  title: z.string().min(1),
  kind: z.enum(ITEM_KIND_KEYS).default("other"),
  unit: z.string().default("ks"),
  quantity: z.string().default("1"),
  unitCostMinor: z.number().int().default(0),
  unitPriceMinor: z.number().int().default(0),
  vatRateBp: z.number().int().default(2100),
  spec: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
  calc: z
    .array(
      z.object({
        variable: z.string().nullable().default(null),
        description: z.string().nullable().default(null),
        formula: z.string().default(""),
      }),
    )
    .default([]),
});
export type ItemTemplate = z.infer<typeof itemTemplate>;

export type SectionTemplate = {
  code: string | null;
  title: string;
  costCategory: string | null;
  items: ItemTemplate[];
  children: SectionTemplate[];
};
export const sectionTemplate: z.ZodType<SectionTemplate> = z.lazy(() =>
  z.object({
    code: z.string().nullable().default(null),
    title: z.string().min(1),
    costCategory: z.string().nullable().default(null),
    items: z.array(itemTemplate).default([]),
    children: z.array(sectionTemplate).default([]),
  }),
) as z.ZodType<SectionTemplate>;

export const templatePayload = z.object({
  v: z.literal(1).default(1),
  budget: z
    .object({
      withPrices: z.boolean().default(false),
      objects: z
        .array(
          z.object({
            code: z.string().nullable().default(null),
            title: z.string().min(1),
            isDefault: z.boolean().default(false),
            sections: z.array(sectionTemplate).default([]),
          }),
        )
        .default([]),
    })
    .nullable()
    .default(null),
  tasks: z
    .array(
      z.object({
        title: z.string().min(2),
        description: z.string().nullable().default(null),
        /** Termín jako počet dní od zahájení zakázky (bez data zahájení se termín nenastaví). */
        daysFromStart: z.number().int().min(0).max(3650).nullable().default(null),
        priority: z.enum(["low", "normal", "high"]).default("normal"),
      }),
    )
    .default([]),
  roles: z.array(z.string().min(1).max(60)).default([]),
});
export type TemplatePayload = z.infer<typeof templatePayload>;

/** Souhrn obsahu šablony pro seznam (bez cen). */
export function summarizePayload(p: TemplatePayload) {
  let sections = 0;
  let items = 0;
  const walk = (s: SectionTemplate) => {
    sections++;
    items += s.items.length;
    s.children.forEach(walk);
  };
  p.budget?.objects.forEach((o) => o.sections.forEach(walk));
  return {
    sections,
    items,
    tasks: p.tasks.length,
    roles: p.roles.length,
    hasBudget: !!p.budget && sections > 0,
    withPrices: p.budget?.withPrices ?? false,
  };
}

/** Odstraní z obsahu ceny (pro uživatele bez `zakazky.economics`). */
export function stripPrices(p: TemplatePayload): TemplatePayload {
  const strip = (s: SectionTemplate): SectionTemplate => ({
    ...s,
    items: s.items.map((i) => ({ ...i, unitCostMinor: 0, unitPriceMinor: 0 })),
    children: s.children.map(strip),
  });
  return {
    ...p,
    budget: p.budget
      ? {
          ...p.budget,
          withPrices: false,
          objects: p.budget.objects.map((o) => ({ ...o, sections: o.sections.map(strip) })),
        }
      : null,
  };
}
