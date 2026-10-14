import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT, rel } from "./paths";

/*
  Zdrojový korpus: všechny zdrojové soubory repozitáře (bez testů) a jejich AST. Generátor z něj čte to, co za běhu
  nejde zjistit (popisy v JSDoc, místo definice, volání typu `emit("…")`). Soubory se čtou a parsují jen jednou.
*/

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".git",
  "test-results",
  "test-results-crawl",
  "test-results-crawl-ucet",
  "test-results-fresh",
  "playwright-report",
  ".data",
]);

/**
 * Soubory, které patří do repozitáře: sledované a nové nezaignorované (git). Ignorované soubory (sestavení, výstupy
 * testů, generované zkušební adresáře) tak nemůžou změnit generovaný výstup, který se pak liší mezi počítačem a CI.
 * Bez gitu (např. rozbalený archiv) se prochází souborový systém.
 */
let gitFiles: Set<string> | null | undefined;
function trackedFiles(): Set<string> | null {
  if (gitFiles !== undefined) return gitFiles;
  try {
    const out = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      {
        cwd: ROOT,
        maxBuffer: 256 * 1024 * 1024,
      },
    ).toString("utf8");
    gitFiles = new Set(out.split("\0").filter(Boolean));
  } catch {
    gitFiles = null;
  }
  return gitFiles;
}

/** Rekurzivně vypíše soubory, které projdou filtrem; výsledek je seřazený. */
export function walk(dir: string, filter: (file: string) => boolean): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const tracked = trackedFiles();
  const out: string[] = [];
  const visit = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) visit(full);
      else if (filter(rel(full)) && (!tracked || tracked.has(rel(full)))) out.push(rel(full));
    }
  };
  visit(abs);
  return out.sort();
}

export const isSourceFile = (f: string) =>
  /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts") && !/\.(test|spec)\.tsx?$/.test(f);

const cache = new Map<string, ts.SourceFile>();

/** Parsuje soubor (cesta od kořene repozitáře). */
export function parseFile(file: string): ts.SourceFile {
  let sf = cache.get(file);
  if (!sf) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    sf = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.ES2023,
      true,
      file.endsWith(".tsx")
        ? ts.ScriptKind.TSX
        : file.endsWith(".ts")
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS,
    );
    cache.set(file, sf);
  }
  return sf;
}

/** Zdrojové soubory balíčků a aplikace (bez testů). */
export function sourceFiles(): string[] {
  return [
    ...walk("packages", (f) => /\/src\//.test(f) && isSourceFile(f)),
    ...walk("apps/web/src", isSourceFile),
  ];
}

/** Text JSDoc komentáře zbavený hvězdiček: `{ description, tags }`. */
export type Jsdoc = { description: string; tags: { name: string; text: string }[] };

export function parseJsdocText(raw: string): Jsdoc {
  const body = raw
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\* ?/, ""));
  const desc: string[] = [];
  const tags: { name: string; text: string }[] = [];
  let current: { name: string; text: string } | null = null;
  for (const line of body) {
    const m = /^@(\w+)\s*(.*)$/.exec(line.trim());
    if (m) {
      current = { name: m[1]!, text: m[2]! };
      tags.push(current);
    } else if (current) current.text += `\n${line}`;
    else desc.push(line);
  }
  return {
    description: normalizeParagraphs(desc.join("\n")),
    tags: tags.map((t) => ({ name: t.name, text: t.text.replace(/\s+/g, " ").trim() })),
  };
}

/** Sloučí řádky odstavce do jednoho, odstavce nechá oddělené prázdným řádkem; kódové bloky nechá být. */
function normalizeParagraphs(s: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let fenced = false;
  const flush = () => {
    if (para.length) out.push(para.join(" ").replace(/\s+/g, " ").trim());
    para = [];
  };
  for (const line of s.split("\n")) {
    if (/^\s*```/.test(line)) {
      flush();
      fenced = !fenced;
      out.push(line.trim());
      continue;
    }
    if (fenced) {
      out.push(line);
      continue;
    }
    if (line.trim() === "") flush();
    else if (/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      flush();
      para.push(line.trim());
    } else para.push(line.trim());
  }
  flush();
  return out.join("\n\n").trim();
}

/** JSDoc bezprostředně před uzlem (poslední blok začínající dvěma hvězdičkami v úvodních komentářích). */
export function leadingJsdoc(sf: ts.SourceFile, node: ts.Node): Jsdoc | null {
  const ranges = ts.getLeadingCommentRanges(sf.text, node.getFullStart()) ?? [];
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i]!;
    const raw = sf.text.slice(r.pos, r.end);
    if (r.kind === ts.SyntaxKind.MultiLineCommentTrivia && raw.startsWith("/**")) {
      return parseJsdocText(raw);
    }
    // jiný komentář (řádkový) mezi popisem a uzlem popis neruší, jen je ignorován
  }
  return null;
}

/**
 * JSDoc k výrazu (typicky `defineX({…})`): hledá se u samotného uzlu a pak u rodičů, kteří výraz jen obalují
 * (deklarace proměnné, příkaz, vlastnost objektu, prvek pole).
 */
export function jsdocOfExpression(sf: ts.SourceFile, node: ts.Node): Jsdoc | null {
  let cur: ts.Node | undefined = node;
  while (cur) {
    const d = leadingJsdoc(sf, cur);
    if (d) return d;
    const p: ts.Node | undefined = cur.parent;
    if (
      p &&
      (ts.isVariableDeclaration(p) ||
        ts.isVariableDeclarationList(p) ||
        ts.isVariableStatement(p) ||
        ts.isExportAssignment(p) ||
        ts.isPropertyAssignment(p) ||
        ts.isParenthesizedExpression(p) ||
        ts.isAsExpression(p) ||
        ts.isSatisfiesExpression(p) ||
        ts.isArrayLiteralExpression(p))
    ) {
      cur = p;
      continue;
    }
    return null;
  }
  return null;
}

/** Hodnota řetězcového literálu (včetně šablony bez výrazů) nebo `undefined`. */
export function stringLiteral(n: ts.Node | undefined): string | undefined {
  if (!n) return undefined;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  return undefined;
}

/** Název vlastnosti objektu jako řetězec. */
export function propName(n: ts.PropertyName | undefined): string | undefined {
  if (!n) return undefined;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  return undefined;
}

/** Hodnota vlastnosti objektového literálu podle názvu. */
export function getProp(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && propName(p.name) === name) return p.initializer;
  }
  return undefined;
}

/** Projde strom a zavolá `visit` pro každý uzel. */
export function forEachNode(sf: ts.SourceFile, visit: (n: ts.Node) => void) {
  const rec = (n: ts.Node) => {
    visit(n);
    ts.forEachChild(n, rec);
  };
  rec(sf);
}

/** Definice vytvořená voláním `defineX({ key: "…" })` ve zdrojích. */
export type Definition = {
  callee: string;
  key: string;
  file: string;
  doc: Jsdoc | null;
};

let definitionsCache: Definition[] | null = null;

/** Volání, jejichž první argument je objekt s řetězcovým klíčem (`name`/`key`/`id`). */
const DEFINERS: Record<string, string> = {
  defineCommand: "name",
  defineJob: "name",
  defineModuleJob: "name",
  defineEntity: "key",
  defineSetting: "key",
  defineExtension: "id",
};

/** Všechny definice nalezené ve zdrojích (příkazy, úlohy, entity, nastavení). Řazeno podle callee, klíče, souboru. */
export function definitions(): Definition[] {
  if (definitionsCache) return definitionsCache;
  const out: Definition[] = [];
  for (const file of sourceFiles()) {
    const sf = parseFile(file);
    forEachNode(sf, (n) => {
      if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return;
      const keyProp = DEFINERS[n.expression.text];
      const arg = n.arguments[0];
      if (!keyProp || !arg || !ts.isObjectLiteralExpression(arg)) return;
      const key = stringLiteral(getProp(arg, keyProp));
      if (key === undefined) return;
      out.push({ callee: n.expression.text, key, file, doc: jsdocOfExpression(sf, n) });
    });
  }
  out.sort((a, b) =>
    `${a.callee}\0${a.key}\0${a.file}` < `${b.callee}\0${b.key}\0${b.file}` ? -1 : 1,
  );
  definitionsCache = out;
  return out;
}

/** Definice podle volání a klíče (`definitionOf("defineCommand", "zakazky.update")`). */
export function definitionOf(callee: string, key: string): Definition | undefined {
  return definitions().find((d) => d.callee === callee && d.key === key);
}

/** První odstavec popisu (do prvního prázdného řádku) na jeden řádek. */
export function summary(doc: Jsdoc | null | undefined): string {
  if (!doc?.description) return "";
  return doc.description.split("\n\n")[0]!.replace(/\n/g, " ");
}

/**
 * Popisy vlastností objektových literálů v souboru podle cesty (`branding.name`): hodí se pro Zod schémata, kde
 * popis pole je JSDoc nad vlastností. Cesta se skládá jen z vlastností, které samy obsahují objekt (`z.object({…})`).
 */
export function propertyDocs(file: string): Map<string, string> {
  const sf = parseFile(file);
  const out = new Map<string, string>();
  const visit = (n: ts.Node, trail: string[]) => {
    if (ts.isPropertyAssignment(n)) {
      const name = propName(n.name);
      if (name !== undefined) {
        const here = [...trail, name];
        const d = leadingJsdoc(sf, n);
        if (d?.description) out.set(here.join("."), d.description.replace(/\n\n/g, " "));
        ts.forEachChild(n.initializer, (c) => visit(c, here));
        // vlastnost přímo objektová (bez volání) – potomci už jsou navštíveni výše
        return;
      }
    }
    ts.forEachChild(n, (c) => visit(c, trail));
  };
  visit(sf, []);
  return out;
}

/** Všechna použití `process.env.NAME` / `process.env["NAME"]` ve zdrojích: název → soubory (seřazené). */
export function envUsages(files: readonly string[]): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  for (const file of files) {
    const sf = parseFile(file);
    forEachNode(sf, (n) => {
      let name: string | undefined;
      if (
        ts.isPropertyAccessExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "env" &&
        ts.isIdentifier(n.expression.expression) &&
        n.expression.expression.text === "process"
      )
        name = n.name.text;
      else if (
        ts.isElementAccessExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "env" &&
        ts.isIdentifier(n.expression.expression) &&
        n.expression.expression.text === "process"
      )
        name = stringLiteral(n.argumentExpression);
      if (name && /^[A-Z][A-Z0-9_]*$/.test(name)) {
        const set = out.get(name) ?? new Set<string>();
        set.add(file);
        out.set(name, set);
      }
    });
  }
  return new Map(
    [...out.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, [...v].sort()]),
  );
}
