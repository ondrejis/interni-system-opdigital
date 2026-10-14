import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/paths";
import { loadRuntime } from "./lib/runtime";
import { applyBlock, moduleBlock, scaffoldModuleDoc } from "./sections/docs-meta";

/*
  `pnpm docs:scaffold` založí chybějící kostry `docs/moduly/<modul>.md` ze šablony `docs/moduly/_sablona.md`.
  Existující dokumenty nikdy nepřepisuje (jsou ruční). Po založení spusť `pnpm docs:generate` (doplní rozcestník).
*/

const rt = loadRuntime();
let created = 0;
for (const m of rt.manifests) {
  const file = path.join(ROOT, "docs/moduly", `${m.id}.md`);
  if (fs.existsSync(file)) continue;
  const filled = applyBlock(scaffoldModuleDoc(rt, m.id), await moduleBlock(rt, m.id));
  fs.writeFileSync(file, filled ?? scaffoldModuleDoc(rt, m.id));
  console.log(`Založeno docs/moduly/${m.id}.md`);
  created++;
}
console.log(
  created
    ? `Hotovo, založeno ${created} kostra(y). Spusť pnpm docs:generate.`
    : "Všechny moduly už mají dokument.",
);
