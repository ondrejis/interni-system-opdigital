import { z } from "zod";

/*
  Vstupy příkazů e-mailové knihovny (MPR-2): `muj-prostor.library.*`. Výsledky jsou v `library/types.ts`. Soubor
  se zpřístupňuje přes `../contract.ts` (společný kontrakt modulu).
*/

const id = z.uuid();

/** `muj-prostor.library.list`: hledání (bez diakritiky, v názvu, kategorii, předmětu, textu a štítcích) a filtry. */
export const libraryListInput = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(120).optional(),
  /** Řazení: podle názvu (výchozí) nebo naposledy upravené první. */
  sort: z.enum(["title", "updated"]).optional(),
});

/** `muj-prostor.library.variables`: katalog proměnných (stejný jako u šablon e-mailů). */
export const libraryVariablesInput = z.object({});

/** Záznamy, kterými se náhled vyplní; každý je nepovinný. */
export const libraryContextInput = z.object({
  personId: id.nullish(),
  companyId: id.nullish(),
  dealId: id.nullish(),
  jobId: id.nullish(),
});

/** `muj-prostor.library.preview`: text položky vyplněný daty vybraných záznamů. */
export const libraryPreviewInput = z.object({
  id,
  context: libraryContextInput.optional(),
});

/** `muj-prostor.library.pick`: hledání záznamů pro výběr v náhledu (kontakt, organizace, obchod, zakázka). */
export const libraryPickInput = z.object({
  kind: z.enum(["person", "company", "deal", "job"]),
  q: z.string().trim().max(120).optional(),
});

/** `muj-prostor.library.move`: přesun (nebo kopie) textu mezi knihovnou a sdílenými šablonami. */
export const libraryMoveInput = z.discriminatedUnion("direction", [
  z.object({
    direction: z.literal("toTemplates"),
    /** Položka knihovny. */
    id,
    language: z.enum(["cs", "sk", "en"]).optional(),
    /** Ponechat původní položku v knihovně (kopie). */
    keepSource: z.boolean().optional(),
  }),
  z.object({
    direction: z.literal("fromTemplate"),
    /** Sdílená šablona. */
    id,
    keepSource: z.boolean().optional(),
  }),
]);
