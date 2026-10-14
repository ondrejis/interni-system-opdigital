import fs from "node:fs";
import path from "node:path";
import * as prettier from "prettier";
import tseslint from "typescript-eslint";
import { isSourceFile, walk } from "./lib/corpus";
import { REQUIRED_KINDS, exportedDeclarations } from "./lib/exported-decls.mjs";
import { ROOT } from "./lib/paths";

/*
  `pnpm docs:coverage` vypíše, kolik exportovaných funkcí, tříd a typů má popis (JSDoc), po balíčcích.
  `--check`        selže, když nový export nemá popis (a není v baseline), nebo když baseline obsahuje už vyřešenou položku.
  `--prune`        z docs/jsdoc-baseline.json odstraní vyřešené položky (baseline se smí jen zmenšovat).
  `--init`         založí baseline ze současného stavu (jen když ještě neexistuje).
  `--list`         vypíše všechny exporty bez popisu.
  Stejnou logiku (`lib/exported-decls.mjs`) používá pravidlo ESLintu `docs/exported-description`.
*/

const BASELINE = "docs/jsdoc-baseline.json";
const args = new Set(process.argv.slice(2));

type Baseline = { exceptions: Record<string, string[]> };

const baselinePath = path.join(ROOT, BASELINE);
const baseline: Baseline = fs.existsSync(baselinePath)
  ? (JSON.parse(fs.readFileSync(baselinePath, "utf8")) as Baseline)
  : { exceptions: {} };

/** Soubory, na které se pravidlo vztahuje (shodné s `eslint.config.mjs`). */
function scopedFiles(): string[] {
  return [
    ...walk("packages/core/src", isSourceFile),
    ...walk("packages/ui/src", isSourceFile),
    ...walk(
      "packages/modules",
      (f) => /^packages\/modules\/[^/]+\/src\//.test(f) && isSourceFile(f),
    ),
  ].sort();
}

const pkgOf = (file: string) => {
  const m = /^packages\/(modules\/)?([^/]+)\//.exec(file);
  return m ? (m[1] ? `@rebar/${m[2]}` : `@rebar/${m[2]}`) : file;
};

type Stat = {
  required: number;
  documented: number;
  components: number;
  componentsDocumented: number;
  values: number;
  valuesDocumented: number;
};
const stats = new Map<string, Stat>();
const missing: { file: string; name: string; kind: string }[] = [];

for (const file of scopedFiles()) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const { ast } = (
    tseslint.parser as unknown as {
      parseForESLint(
        code: string,
        options: object,
      ): { ast: { body: unknown[]; comments: unknown[] } };
    }
  ).parseForESLint(text, {
    range: true,
    loc: true,
    comment: true,
    filePath: file,
    ecmaFeatures: { jsx: file.endsWith(".tsx") },
  });
  const s = stats.get(pkgOf(file)) ?? {
    required: 0,
    documented: 0,
    components: 0,
    componentsDocumented: 0,
    values: 0,
    valuesDocumented: 0,
  };
  stats.set(pkgOf(file), s);
  for (const d of exportedDeclarations(ast, text, file)) {
    if (REQUIRED_KINDS.includes(d.kind)) {
      s.required++;
      if (d.documented) s.documented++;
      else missing.push({ file, name: d.name, kind: d.kind });
    } else if (d.kind === "component") {
      s.components++;
      if (d.documented) s.componentsDocumented++;
    } else {
      s.values++;
      if (d.documented) s.valuesDocumented++;
    }
  }
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)} %` : "–");
const rows = [...stats.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
const total = rows.reduce(
  (t, [, s]) => ({
    required: t.required + s.required,
    documented: t.documented + s.documented,
    components: t.components + s.components,
    componentsDocumented: t.componentsDocumented + s.componentsDocumented,
    values: t.values + s.values,
    valuesDocumented: t.valuesDocumented + s.valuesDocumented,
  }),
  {
    required: 0,
    documented: 0,
    components: 0,
    componentsDocumented: 0,
    values: 0,
    valuesDocumented: 0,
  },
);

const inBaseline = (file: string, name: string) =>
  baseline.exceptions[file]?.includes(name) ?? false;
const newViolations = missing.filter((m) => !inBaseline(m.file, m.name));
const missingSet = new Set(missing.map((m) => `${m.file}\0${m.name}`));
const stale: { file: string; name: string }[] = [];
for (const [file, names] of Object.entries(baseline.exceptions))
  for (const name of names) if (!missingSet.has(`${file}\0${name}`)) stale.push({ file, name });

if (args.has("--init")) {
  if (fs.existsSync(baselinePath)) {
    console.error(`${BASELINE} už existuje. Baseline se smí jen zmenšovat: použij --prune.`);
    process.exit(1);
  }
  await writeBaseline(missing.map((m) => ({ file: m.file, name: m.name })));
  console.log(`Založeno ${BASELINE} (${missing.length} výjimek).`);
  process.exit(0);
}

if (args.has("--prune")) {
  const keep = missing.filter((m) => inBaseline(m.file, m.name));
  await writeBaseline(keep.map((m) => ({ file: m.file, name: m.name })));
  console.log(`Z baseline odstraněno ${stale.length} vyřešených položek, zbývá ${keep.length}.`);
  process.exit(0);
}

async function writeBaseline(items: { file: string; name: string }[]) {
  const exceptions: Record<string, string[]> = {};
  for (const { file, name } of items) (exceptions[file] ??= []).push(name);
  const sorted = Object.fromEntries(
    Object.keys(exceptions)
      .sort()
      .map((f) => [f, [...new Set(exceptions[f]!)].sort()]),
  );
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  const json = JSON.stringify(
    {
      $comment:
        "Ratchet popisů exportů (ADR 022): exporty, které ještě nemají JSDoc s popisem. Seznam se smí jen zmenšovat (pnpm docs:coverage --prune); nový export bez popisu je chyba.",
      exceptions: sorted,
    },
    null,
    2,
  );
  const config = (await prettier.resolveConfig(baselinePath)) ?? {};
  fs.writeFileSync(baselinePath, await prettier.format(json, { ...config, parser: "json" }));
}

if (args.has("--list"))
  for (const m of missing)
    console.log(`${m.file}#${m.name} (${m.kind})${inBaseline(m.file, m.name) ? "" : "  NOVÝ"}`);

console.log("Pokrytí popisy exportovaných funkcí, tříd a typů (JSDoc s popisem)");
console.log("");
console.log("| Balíček | Povinných | S popisem | Pokrytí | Komponenty UI | Konstanty a hodnoty |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const [pkg, s] of rows)
  console.log(
    `| ${pkg} | ${s.required} | ${s.documented} | ${pct(s.documented, s.required)} | ${pct(s.componentsDocumented, s.components)} | ${pct(s.valuesDocumented, s.values)} |`,
  );
console.log(
  `| **Celkem** | ${total.required} | ${total.documented} | **${pct(total.documented, total.required)}** | ${pct(total.componentsDocumented, total.components)} | ${pct(total.valuesDocumented, total.values)} |`,
);
console.log("");
console.log(
  `Výjimky v baseline: ${Object.values(baseline.exceptions).reduce((n, l) => n + l.length, 0)}; bez popisu mimo baseline: ${newViolations.length}; vyřešené, ještě v baseline: ${stale.length}.`,
);

if (args.has("--check")) {
  let failed = false;
  if (newViolations.length) {
    failed = true;
    console.error("\nNové exporty bez popisu (přidej JSDoc s větou, k čemu slouží):");
    for (const m of newViolations.slice(0, 50))
      console.error(`  - ${m.file}#${m.name} (${m.kind})`);
    if (newViolations.length > 50) console.error(`  … a dalších ${newViolations.length - 50}`);
  }
  if (stale.length) {
    failed = true;
    console.error(
      "\nV baseline jsou položky, které už popis mají nebo neexistují. Odstraň je: pnpm docs:coverage --prune",
    );
    for (const m of stale.slice(0, 50)) console.error(`  - ${m.file}#${m.name}`);
    if (stale.length > 50) console.error(`  … a dalších ${stale.length - 50}`);
  }
  process.exit(failed ? 1 : 0);
}
