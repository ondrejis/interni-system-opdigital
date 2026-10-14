import fs from "node:fs";
import path from "node:path";
import { walk } from "./lib/corpus";
import { ROOT } from "./lib/paths";
import { loadRuntime } from "./lib/runtime";
import { TODO_MARKER } from "./sections/docs-meta";

/*
  `pnpm docs:status` vypíše, co v ručně psané dokumentaci ještě chybí: moduly bez dokumentu a sekce s řádkem
  „TODO: doplnit vyprávění“. Jen informuje (kód 0); s `--strict` selže, dokud TODO zbývá.
*/

const strict = process.argv.includes("--strict");
const rt = loadRuntime();

type Row = { file: string; todo: string[]; total: number };
const rows: Row[] = [];
const missing: string[] = [];

function sectionsOf(md: string): { title: string; todo: boolean }[] {
  const out: { title: string; todo: boolean }[] = [];
  let cur: { title: string; todo: boolean } | null = null;
  let fenced = false;
  for (const line of md.split("\n")) {
    if (/^(```|~~~)/.test(line)) fenced = !fenced;
    const h = !fenced && /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      cur = { title: h[1]!, todo: false };
      out.push(cur);
    } else if (cur && line.includes(TODO_MARKER) && !line.trim().startsWith("<!--"))
      cur.todo = true;
  }
  return out;
}

for (const m of rt.manifests) {
  const file = `docs/moduly/${m.id}.md`;
  if (!fs.existsSync(path.join(ROOT, file))) {
    missing.push(file);
    continue;
  }
  const sections = sectionsOf(fs.readFileSync(path.join(ROOT, file), "utf8")).filter(
    (s) => s.title !== "Souhrn z kódu",
  );
  rows.push({
    file,
    todo: sections.filter((s) => s.todo).map((s) => s.title),
    total: sections.length,
  });
}

// ostatní dokumenty s označením TODO
const others = walk(
  "docs",
  (f) => f.endsWith(".md") && !f.startsWith("docs/moduly/") && !f.startsWith("docs/reference/"),
).filter((f) => fs.readFileSync(path.join(ROOT, f), "utf8").includes(TODO_MARKER));

let todoSections = 0;
console.log("Stav vyprávěcí dokumentace modulů");
console.log("=================================");
for (const r of rows) {
  todoSections += r.todo.length;
  const done = r.total - r.todo.length;
  console.log(
    `${r.file}: ${done}/${r.total} sekcí hotovo${r.todo.length ? `, chybí: ${r.todo.join(", ")}` : ""}`,
  );
}
for (const f of missing) console.log(`${f}: dokument chybí (pnpm docs:scaffold)`);
for (const f of others) console.log(`${f}: obsahuje „${TODO_MARKER}“`);
const total = rows.reduce((n, r) => n + r.total, 0);
console.log(
  `\nCelkem: ${total - todoSections}/${total} sekcí hotovo, ${todoSections} s TODO, ${missing.length} chybějících dokumentů.`,
);
if (strict && (todoSections || missing.length || others.length)) process.exit(1);
