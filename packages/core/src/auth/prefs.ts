import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { schema } from "../db/client";
import { PermissionError, UserError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";

/*
  Osobní předvolby uživatele (`user.prefs`, NAS-05 Vzhled). Sloupec je volný JSON, do kterého smí psát víc částí
  systému (např. poslední filtry); tahle část vlastní jen klíče níže, ostatní klíče při uložení nechává beze změny.
*/

/** Barevný motiv: světlý, tmavý, nebo podle systému. */
export const THEMES = ["system", "light", "dark"] as const;
/** Hustota řádků v tabulkách a seznamech. */
export const DENSITIES = ["comfortable", "compact"] as const;

/** Adresa úvodní stránky po přihlášení: interní cesta aplikace (nikdy ne vnější odkaz). */
const startPageField = z
  .string()
  .max(80)
  .regex(/^\/[a-z0-9][a-z0-9\-/]*$/, "Neplatná adresa úvodní stránky.")
  .nullable();

/** Změna vzhledu: každý klíč je nepovinný a chybějící zůstává beze změny (žádné výchozí hodnoty, jinak by změna jednoho klíče přepsala ostatní). */
export const appearancePatch = z.object({
  theme: z.enum(THEMES).optional(),
  density: z.enum(DENSITIES).optional(),
  /** Kam jít po přihlášení; `null` = výchozí stránka systému (Přehled). */
  startPage: startPageField.optional(),
});

/** Hodnoty Vzhledu s vyplněnými výchozími. */
export type Appearance = {
  theme: (typeof THEMES)[number];
  density: (typeof DENSITIES)[number];
  startPage: string | null;
};

/** Vzhled z uložených předvoleb; neplatný nebo chybějící klíč nahradí výchozí hodnotou (poškozená data nikdy nespadnou). */
export function readAppearance(prefs: unknown): Appearance {
  const raw = prefs && typeof prefs === "object" ? (prefs as Record<string, unknown>) : {};
  const pick = <T extends z.ZodType>(schemaOf: T, value: unknown, fallback: z.output<T>) => {
    const r = schemaOf.safeParse(value);
    return r.success ? r.data : fallback;
  };
  return {
    theme: pick(z.enum(THEMES), raw.theme, "system"),
    density: pick(z.enum(DENSITIES), raw.density, "comfortable"),
    startPage: pick(startPageField, raw.startPage, null),
  };
}

/** Předvolby přihlášeného uživatele (vzhled s výchozími hodnotami). */
export async function getOwnAppearance(ctx: Ctx): Promise<Appearance> {
  const id = ctx.actor.userId;
  if (!id) throw new PermissionError();
  const [row] = await ctx.db
    .select({ prefs: schema.user.prefs })
    .from(schema.user)
    .where(eq(schema.user.id, id));
  return readAppearance(row?.prefs);
}

/**
 * Uloží vzhled: sloučí zadané klíče do `user.prefs` jedním `||` (klíče jiných částí systému zůstanou, souběžné zápisy
 * jiných klíčů se neztratí). Úvodní stránku si smí uživatel nastavit jen z `allowedStartPages` (adresy, na které má
 * přístup); kontrolu s aktuální navigací dělá volající.
 */
export async function updateOwnAppearance(
  ctx: Ctx,
  raw: z.input<typeof appearancePatch>,
  allowedStartPages: readonly string[],
): Promise<Appearance> {
  const id = ctx.actor.userId;
  if (!id) throw new PermissionError();
  const patch = appearancePatch.parse(raw);
  if (patch.startPage && !allowedStartPages.includes(patch.startPage))
    throw new UserError("Na tuto stránku nemáte přístup.");
  const [row] = await ctx.db
    .update(schema.user)
    .set({ prefs: sql`${schema.user.prefs} || ${JSON.stringify(patch)}::jsonb`, updatedBy: id })
    .where(eq(schema.user.id, id))
    .returning({ prefs: schema.user.prefs });
  return readAppearance(row?.prefs);
}

/**
 * Kam po přihlášení: uložená úvodní stránka, je-li stále dostupná, jinak `fallback`. Cíl vždy projde seznamem
 * dostupných adres, takže uložená adresa nikdy nevede mimo aplikaci ani na stránku bez přístupu.
 */
export function resolveStartPage(
  appearance: Pick<Appearance, "startPage">,
  allowed: readonly string[],
  fallback: string,
): string {
  const page = appearance.startPage;
  return page && allowed.includes(page) ? page : fallback;
}
