// Velikost JavaScriptu, který si prohlížeč stahuje (apps/web/.next/static). Vypíše souhrn (a do GITHUB_STEP_SUMMARY),
// a když překročí rozpočet, skončí chybou. Rozpočet: BUNDLE_BUDGET_KB (gzip, součet všech chunků), výchozí 700.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(
  import.meta.dirname,
  `../apps/web/${process.env.NEXT_DIST_DIR ?? ".next"}/static`,
);
if (!fs.existsSync(root)) {
  console.error(`Chybí ${root}; nejdřív pnpm build.`);
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) {
      const buf = fs.readFileSync(p);
      files.push({
        name: path.relative(root, p),
        raw: buf.length,
        gzip: zlib.gzipSync(buf).length,
      });
    }
  }
})(root);

const kb = (n) => Math.round((n / 1024) * 10) / 10;
const total = files.reduce((a, f) => ({ raw: a.raw + f.raw, gzip: a.gzip + f.gzip }), {
  raw: 0,
  gzip: 0,
});
const budget = Number(process.env.BUNDLE_BUDGET_KB ?? 700);
const top = [...files].sort((a, b) => b.gzip - a.gzip).slice(0, 10);

const lines = [
  "### Velikost JavaScriptu (apps/web)",
  "",
  `Celkem ${files.length} souborů: **${kb(total.gzip)} kB gzip** (${kb(total.raw)} kB surově), rozpočet ${budget} kB gzip.`,
  "",
  "| Největší soubory | gzip kB | surově kB |",
  "| --- | ---: | ---: |",
  ...top.map((f) => `| \`${f.name}\` | ${kb(f.gzip)} | ${kb(f.raw)} |`),
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");

if (kb(total.gzip) > budget) {
  console.error(`\nJavaScript má ${kb(total.gzip)} kB gzip, rozpočet je ${budget} kB.`);
  process.exit(1);
}
