import { PermissionError, canSeePrivate, type Ctx } from "@rebar/core/rbac";
import type { ModuleDeps } from "@rebar/core/module-server";
import { textToNoteDoc } from "./doc";
import { createNote } from "./write";

/**
 * Samostatná soukromá poznámka (Můj prostor → Soukromé, SOUK-01); volá ji služba `tasks.createPrivateNote`. Smí ji
 * založit jen vlastník soukromých záznamů. `bodyJson` je dokument Tiptap, nebo prostý text; vždy projde sanitizací.
 */
export async function createPrivateNote(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { title: string; bodyJson: unknown },
): Promise<{ id: string }> {
  if (!canSeePrivate(ctx))
    throw new PermissionError("Soukromou poznámku smí vytvořit jen vlastník.");
  const body = typeof input.bodyJson === "string" ? textToNoteDoc(input.bodyJson) : input.bodyJson;
  const n = await createNote(ctx, deps, {
    title: input.title,
    bodyJson: (body ?? null) as Record<string, unknown> | null,
    isPrivate: true,
  });
  return { id: n.id };
}
