import fs from "node:fs";
import path from "node:path";
import { API_DIR, REFERENCE_DIR, build, filesUnder, type BuildScope } from "./build";
import { ROOT } from "./lib/paths";

/*
  `pnpm docs:generate` přepíše docs/reference/ (a vygenerované části docs/INDEX.md a docs/moduly/*.md) podle kódu.
  `pnpm docs:check` (= --check) nic nezapisuje: vygeneruje obsah do paměti, porovná ho s commitnutým a při rozdílu selže.
  `pnpm docs:api` (= --only=api) generuje jen API referenci z TSDoc.
*/

const args = process.argv.slice(2);
const check = args.includes("--check");
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const scope: BuildScope = only === "api" ? "api" : only === "runtime" ? "runtime" : "all";

const started = Date.now();
const expected = await build(scope);

// soubory, které generátor vlastní (smaže ty, které už nevznikají)
const ownedRoot = scope === "api" ? API_DIR : REFERENCE_DIR;
const onDisk = filesUnder(ownedRoot).filter(
  (f) => scope !== "runtime" || !f.startsWith(`${API_DIR}/`),
);

const changed: string[] = [];
const added: string[] = [];
const stale: string[] = [];
for (const [file, content] of expected) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) added.push(file);
  else if (fs.readFileSync(abs, "utf8") !== content) changed.push(file);
}
for (const f of onDisk) if (!expected.has(f)) stale.push(f);

if (check) {
  const problems = [
    ...added.map((f) => `chybí (nově vzniká): ${f}`),
    ...changed.map((f) => `neodpovídá kódu: ${f}`),
    ...stale.map((f) => `přebývá (kód už ho negeneruje): ${f}`),
  ];
  if (problems.length) {
    console.error("Dokumentace generovaná z kódu je neaktuální (drift):");
    for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
    if (problems.length > 40) console.error(`  … a dalších ${problems.length - 40}`);
    console.error(
      "\nOprava: spusť `pnpm docs:generate` a výsledek commitni. Soubory v docs/reference/ se neupravují ručně.",
    );
    process.exit(1);
  }
  console.log(
    `Dokumentace z kódu je aktuální (${expected.size} souborů, ${((Date.now() - started) / 1000).toFixed(1)} s).`,
  );
  process.exit(0);
}

for (const [file, content] of expected) {
  const abs = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!fs.existsSync(abs) || fs.readFileSync(abs, "utf8") !== content)
    fs.writeFileSync(abs, content);
}
for (const f of stale) fs.rmSync(path.join(ROOT, f));
// prázdné složky po smazaných souborech
for (const dir of [...new Set(stale.map((f) => path.dirname(f)))].sort().reverse()) {
  const abs = path.join(ROOT, dir);
  if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
}
console.log(
  `Vygenerováno ${expected.size} souborů (nových ${added.length}, změněných ${changed.length}, smazaných ${stale.length}) za ${((Date.now() - started) / 1000).toFixed(1)} s.`,
);
