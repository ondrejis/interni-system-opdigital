import { z } from "zod";
import "../zod-locale";
import { filterGroupSchema } from "../entities/filters";
import { sanitizeFileName } from "../files/validate";
import { localParts } from "../time/dates";

export const EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Co a jak se exportuje: entita, pohled (filtry, řazení, hledání), sloupce a formát. Základ šablon i plánů. */
export const exportSpecSchema = z.strictObject({
  entity: z.string().min(1).max(40),
  format: z.enum(EXPORT_FORMATS),
  /** `view` = aktuální pohled (filtry, řazení, hledání), `all` = všechny záznamy, které aktér vidí. */
  scope: z.enum(["view", "all"]).default("view"),
  /** Sloupce v pořadí; bez nich výchozí viditelné sloupce entity. */
  columns: z.array(z.string().min(1).max(80)).max(80).optional(),
  query: z
    .strictObject({
      filters: filterGroupSchema.optional(),
      sort: z
        .array(z.strictObject({ attr: z.string().min(1).max(80), dir: z.enum(["asc", "desc"]) }))
        .max(5)
        .optional(),
      q: z.string().trim().max(200).optional(),
    })
    .optional(),
  /** Název souboru bez přípony; `{datum}` se nahradí dnešním datem. */
  fileName: z.string().trim().max(80).optional(),
  /** Nejvýš tolik řádků (jinak strop exportu). */
  maxRows: z.number().int().min(1).max(50_000).optional(),
});
export type ExportSpec = z.output<typeof exportSpecSchema>;
export type ExportSpecInput = z.input<typeof exportSpecSchema>;

/** Dotaz, který se pro export použije: u `all` bez filtrů a řazení. */
export function specQuery(spec: ExportSpec) {
  return spec.scope === "all" ? undefined : spec.query;
}

/** Kmen názvu souboru z volby uživatele (bez přípony, bez nebezpečných znaků), s dnešním datem v české zóně. */
export function exportFileStem(
  wanted: string | undefined,
  fallback: string,
  now = new Date(),
): string {
  const today = localParts(now).date;
  const raw = (wanted?.trim() || fallback).replace(/\{datum\}/gi, today);
  const clean = sanitizeFileName(raw)
    .replace(/\.(csv|xlsx|pdf|zip)$/i, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return clean || fallback;
}
