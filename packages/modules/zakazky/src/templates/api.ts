/**
 * Veřejné rozhraní oblasti „templates“ pro ostatní oblasti a moduly (serverový kód, funkce s `ctx`).
 * Ostatní se na oblast odkazují jen přes `templatesApi` z `@rebar/zakazky/server`, ne přes cesty do složky.
 * Funkce nekontrolují oprávnění, to dělá volající.
 */
import { inTx } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { applyTemplateTx, type ApplyTemplateResult } from "./service";

/** Použije šablonu na zakázku (rozpočet jen do prázdné verze, úkoly a role jednou). */
export function applyTemplate(
  ctx: Ctx,
  jobId: string,
  templateId: string,
  opts: { versionId?: string | null } = {},
): Promise<ApplyTemplateResult> {
  return inTx(ctx, (c) => applyTemplateTx(c, jobId, templateId, opts));
}

export type { ApplyTemplateResult };
