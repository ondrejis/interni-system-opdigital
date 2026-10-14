import fs from "node:fs";
import path from "node:path";
import { REQUIRED_KINDS, exportedDeclarations } from "./lib/exported-decls.mjs";

/*
  Pravidlo `docs/exported-description`: každá exportovaná funkce, třída, rozhraní, typ a výčet musí mít nad deklarací
  JSDoc s popisem (věta, k čemu slouží). Starý kód bez popisu je v `docs/jsdoc-baseline.json` (ratchet): seznam se smí jen
  zmenšovat, nový export bez popisu je chyba. Rozhodnutí a důvody: docs/adr/022-dokumentace-z-kodu.md.
*/

const BASELINE_FILE = "docs/jsdoc-baseline.json";

let cached = null;

/** Načte baseline: `{ "cesta/soubor.ts": ["export1", …] }` jako množiny. */
export function loadBaseline(root) {
  const file = path.join(root, BASELINE_FILE);
  if (!fs.existsSync(file)) return new Map();
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  return new Map(Object.entries(json.exceptions ?? {}).map(([f, names]) => [f, new Set(names)]));
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Exportovaná funkce, třída, rozhraní, typ a výčet musí mít JSDoc s popisem (výjimky v docs/jsdoc-baseline.json).",
    },
    schema: [],
    messages: {
      missing:
        "Exportovaný {{kind}} „{{name}}“ nemá popis. Přidej nad deklaraci JSDoc s větou, k čemu slouží (viz docs/DOCS-PROCES.md). Výjimky ze starého kódu jsou v docs/jsdoc-baseline.json a smějí se jen mazat.",
    },
  },
  create(context) {
    const root = context.cwd ?? process.cwd();
    cached ??= loadBaseline(root);
    const rel = path.relative(root, context.filename).split(path.sep).join("/");
    const allowed = cached.get(rel);
    return {
      Program(program) {
        const sourceCode = context.sourceCode;
        const ast = { body: program.body, comments: sourceCode.getAllComments() };
        for (const d of exportedDeclarations(ast, sourceCode.text, context.filename)) {
          if (!REQUIRED_KINDS.includes(d.kind) || d.documented || allowed?.has(d.name)) continue;
          context.report({
            node: d.node,
            messageId: "missing",
            data: { kind: d.kind, name: d.name },
          });
        }
      },
    };
  },
};

export default { rules: { "exported-description": rule } };
