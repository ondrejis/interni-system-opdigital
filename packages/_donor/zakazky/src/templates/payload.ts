import { z } from "zod";

/**
 * Obsah šablony zakázky (`job_template.payload`): úkoly zakázky a role týmu bez konkrétních lidí. Tvar je verzovaný (`v`),
 * aby šel později rozšířit (typ zakázky, fáze a platby přidá přepracování modelu zakázky).
 */
export const templatePayload = z.object({
  v: z.literal(1).default(1),
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

/** Souhrn obsahu šablony pro seznam. */
export function summarizePayload(p: TemplatePayload) {
  return { tasks: p.tasks.length, roles: p.roles.length };
}
