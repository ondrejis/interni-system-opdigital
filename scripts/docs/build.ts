import fs from "node:fs";
import path from "node:path";
import { loadRuntime } from "./lib/runtime";
import { ROOT } from "./lib/paths";
import { apiDocs } from "./sections/api";
import { databaseDocs } from "./sections/databaze";
import { applyBlock, indexDoc, moduleBlock, referenceReadme } from "./sections/docs-meta";
import { entityDocs } from "./sections/entity";
import { exportDocs } from "./sections/exporty";
import { moduleDocs } from "./sections/moduly";
import { permissionsDoc } from "./sections/opravneni";
import { commandDocs } from "./sections/prikazy";
import { environmentDocs } from "./sections/prostredi";
import { routeDocs } from "./sections/trasy";
import { eventDocs } from "./sections/udalosti";

/** `all` = vše, `api` = jen API reference, `runtime` = vše kromě API reference (rychlé, pro testy). */
export type BuildScope = "all" | "api" | "runtime";

/** Složka API reference; patří generátoru stejně jako celá `docs/reference`. */
export const API_DIR = "docs/reference/api";
export const REFERENCE_DIR = "docs/reference";

/**
 * Sestaví generovaný obsah v paměti: cesta od kořene repozitáře → obsah souboru. Nic nezapisuje.
 * Výstup je deterministický (stabilní řazení, žádná časová razítka ani absolutní cesty).
 */
export async function build(scope: BuildScope = "all"): Promise<Map<string, string>> {
  const files: Record<string, string> = {};
  if (scope !== "api") {
    const rt = loadRuntime();
    Object.assign(
      files,
      permissionsDoc(rt),
      entityDocs(rt),
      commandDocs(rt),
      environmentDocs(),
      routeDocs(rt),
      exportDocs(rt),
      await moduleDocs(rt),
      await databaseDocs(rt),
      await eventDocs(rt),
    );
  }
  if (scope !== "runtime") Object.assign(files, apiDocs());
  if (scope === "all") {
    const rt = loadRuntime();
    files["docs/reference/README.md"] = referenceReadme(rt, Object.keys(files));
    // vyprávěcí dokumentace modulů: generuje se jen blok mezi značkami, zbytek je ruční
    for (const m of rt.manifests) {
      const file = `docs/moduly/${m.id}.md`;
      const abs = path.join(ROOT, file);
      if (!fs.existsSync(abs)) continue;
      const next = applyBlock(fs.readFileSync(abs, "utf8"), await moduleBlock(rt, m.id));
      if (next !== null) files[file] = next;
    }
    files["docs/INDEX.md"] = await indexDoc(rt);
  }
  const out = new Map<string, string>();
  for (const k of Object.keys(files).sort()) out.set(k, files[k]!);
  return out;
}

/** Soubory pod složkou (cesty od kořene repozitáře), seřazené. */
export function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const visit = (rel: string) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) visit(r);
      else out.push(r);
    }
  };
  visit(dir);
  return out.sort();
}
