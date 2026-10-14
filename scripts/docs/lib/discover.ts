import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./paths";

/** Katalog nalezený v exportech balíčků (např. seznam druhů push upozornění, metriky přehledu). */
export type Catalog = { name: string; entry: string; value: unknown };

const NAME = /^[A-Z][A-Z0-9_]*$/;
const KEYWORD = /(EVENT|CATALOG|METRIC|KPI|NOTIFICATION)/;

/**
 * Vstupní body balíčků (`exports` v `package.json`) jako cesty k souborům. Soubory `.tsx` se přeskakují
 * (rozhraní, ne data) a také šablony stylů.
 */
export function packageEntries(): { pkg: string; subpath: string; file: string }[] {
  const out: { pkg: string; subpath: string; file: string }[] = [];
  const dirs = [
    ...fs
      .readdirSync(path.join(ROOT, "packages"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "modules")
      .map((d) => `packages/${d.name}`),
    ...fs
      .readdirSync(path.join(ROOT, "packages/modules"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `packages/modules/${d.name}`),
  ].sort();
  for (const dir of dirs) {
    const pj = path.join(ROOT, dir, "package.json");
    if (!fs.existsSync(pj)) continue;
    const pkg = JSON.parse(fs.readFileSync(pj, "utf8")) as {
      name: string;
      exports?: Record<string, string>;
    };
    for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
      if (typeof target !== "string" || !/\.(ts|mjs|js)$/.test(target)) continue;
      out.push({ pkg: pkg.name, subpath, file: path.posix.join(dir, target) });
    }
  }
  return out;
}

/**
 * Najde exportované konstanty, které vypadají jako katalog (název VELKÝMI_PÍSMENY s `EVENT`, `CATALOG`, `METRIC`,
 * `KPI` nebo `NOTIFICATION`, hodnota je pole nebo objekt záznamů). Díky tomu se nový katalog (push události,
 * metriky přehledu) objeví v referenci sám, bez úpravy generátoru.
 */
export async function discoverCatalogs(): Promise<Catalog[]> {
  const out: Catalog[] = [];
  const seen = new Set<unknown>();
  for (const e of packageEntries()) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(pathToFileURL(path.join(ROOT, e.file)).href)) as Record<string, unknown>;
    } catch {
      continue;
    }
    for (const [name, value] of Object.entries(mod).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (!NAME.test(name) || !KEYWORD.test(name) || seen.has(value)) continue;
      const rows = Array.isArray(value)
        ? value
        : value && typeof value === "object"
          ? Object.values(value)
          : [];
      if (!rows.length || !rows.every((r) => r && typeof r === "object")) continue;
      seen.add(value);
      out.push({ name, entry: `${e.pkg}${e.subpath === "." ? "" : e.subpath.slice(1)}`, value });
    }
  }
  return out;
}
