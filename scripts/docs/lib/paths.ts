import path from "node:path";

/** Kořen repozitáře. */
export const ROOT = path.resolve(import.meta.dirname, "../../..");

/** Složka s generovanou referencí (celá se přepisuje, ruční úpravy nemají smysl). */
export const REFERENCE_DIR = "docs/reference";

/** Převede absolutní cestu na cestu v repozitáři s lomítky `/`. */
export function rel(abs: string): string {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}
