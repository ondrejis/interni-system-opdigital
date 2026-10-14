import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { packageEntries } from "../lib/discover";
import { code, doc, generatedHeader, link, table, text } from "../lib/md";
import { ROOT, rel } from "../lib/paths";

/*
  API reference z TSDoc: vlastní lehký generátor nad TypeScript compiler API (ADR 022). Čte exporty vstupních bodů
  balíčků (`exports` v package.json), jejich JSDoc a deklarace. Žádná další závislost, výstup je plně pod kontrolou
  (deterministický, bez časových razítek, bez absolutních cest).
*/

const DIR = "docs/reference/api";
const MAX_TYPE_LINES = 40;
const MAX_INFERRED = 240;

type Kind =
  "function" | "class" | "interface" | "type" | "enum" | "const" | "namespace" | "re-export";

type ApiItem = {
  name: string;
  kind: Kind;
  file: string;
  /** Deklarace začíná na tomto řádku souboru (do výstupu se nepíše, jen řadí překlady). */
  summary: string;
  description: string;
  signature: string;
  params: { name: string; text: string }[];
  returns: string;
  deprecated: string | null;
  home: string; // klíč deklarace
};

function program(files: string[]): ts.Program {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023,
    lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    resolveJsonModule: true,
    types: ["node"],
    typeRoots: [path.join(ROOT, "node_modules/@types")],
    allowImportingTsExtensions: true,
  };
  return ts.createProgram({ rootNames: files.map((f) => path.join(ROOT, f)), options });
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function hasModifier(n: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    (ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined)?.some((m) => m.kind === kind) ?? false
  );
}

function kindOf(d: ts.Declaration): Kind | null {
  if (ts.isFunctionDeclaration(d)) return "function";
  if (ts.isClassDeclaration(d)) return "class";
  if (ts.isInterfaceDeclaration(d)) return "interface";
  if (ts.isTypeAliasDeclaration(d)) return "type";
  if (ts.isEnumDeclaration(d)) return "enum";
  if (ts.isModuleDeclaration(d)) return "namespace";
  if (ts.isVariableDeclaration(d)) {
    const init = d.initializer;
    return init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
      ? "function"
      : "const";
  }
  return null;
}

function typeParams(
  n: { typeParameters?: ts.NodeArray<ts.TypeParameterDeclaration> },
  sf: ts.SourceFile,
) {
  return n.typeParameters?.length
    ? `<${n.typeParameters.map((t) => oneLine(t.getText(sf))).join(", ")}>`
    : "";
}

function describe(
  name: string,
  symbol: ts.Symbol,
  d: ts.Declaration,
  checker: ts.TypeChecker,
): ApiItem | null {
  const kind = kindOf(d);
  if (!kind) return null;
  const sf = d.getSourceFile();
  const docParts = symbol.getDocumentationComment(checker);
  const description = ts.displayPartsToString(docParts).replace(/\r/g, "").trim();
  const tags = symbol.getJsDocTags(checker);
  const params = tags
    .filter((t) => t.name === "param")
    .map((t) => {
      const txt = ts.displayPartsToString(t.text);
      const m = /^(\S+)\s*-?\s*([\s\S]*)$/.exec(txt);
      return { name: m?.[1] ?? "", text: oneLine(m?.[2] ?? "") };
    });
  const returns = oneLine(
    ts.displayPartsToString(tags.find((t) => t.name === "returns")?.text ?? []),
  );
  const dep = tags.find((t) => t.name === "deprecated");

  let signature: string;
  if (kind === "function") {
    const fn = ts.isVariableDeclaration(d)
      ? (d.initializer as ts.ArrowFunction | ts.FunctionExpression)
      : (d as ts.FunctionDeclaration);
    const ps = fn.parameters.map((p) => oneLine(p.getText(sf))).join(", ");
    let ret = fn.type ? oneLine(fn.type.getText(sf)) : "";
    if (!ret) {
      const sig = checker.getSignatureFromDeclaration(fn);
      if (sig)
        ret = clip(
          oneLine(
            checker.typeToString(
              checker.getReturnTypeOfSignature(sig),
              fn,
              ts.TypeFormatFlags.NoTruncation,
            ),
          ),
          MAX_INFERRED,
        );
    }
    const isAsync = fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
      ? "async "
      : "";
    signature = `${isAsync}function ${name}${typeParams(fn, sf)}(${ps})${ret ? `: ${ret}` : ""}`;
  } else if (kind === "const") {
    const t =
      d.parent && ts.isVariableDeclarationList(d.parent)
        ? d.parent.flags & ts.NodeFlags.Const
          ? "const"
          : "let"
        : "const";
    const declared = (d as ts.VariableDeclaration).type;
    const typeText = declared
      ? oneLine(declared.getText(sf))
      : clip(
          oneLine(
            checker.typeToString(
              checker.getTypeOfSymbolAtLocation(symbol, d),
              d,
              ts.TypeFormatFlags.NoTruncation,
            ),
          ),
          MAX_INFERRED,
        );
    signature = `${t} ${name}: ${typeText}`;
  } else if (kind === "class") {
    const c = d as ts.ClassDeclaration;
    const heritage = c.heritageClauses?.map((h) => oneLine(h.getText(sf))).join(" ") ?? "";
    const members = c.members
      .filter(
        (m) =>
          !hasModifier(m, ts.SyntaxKind.PrivateKeyword) &&
          !hasModifier(m, ts.SyntaxKind.ProtectedKeyword) &&
          !(m.name && ts.isPrivateIdentifier(m.name)),
      )
      .map((m) => {
        if (ts.isConstructorDeclaration(m))
          return `  constructor(${m.parameters.map((p) => oneLine(p.getText(sf))).join(", ")});`;
        if (ts.isMethodDeclaration(m))
          return `  ${hasModifier(m, ts.SyntaxKind.StaticKeyword) ? "static " : ""}${m.name.getText(sf)}${typeParams(m, sf)}(${m.parameters.map((p) => oneLine(p.getText(sf))).join(", ")})${m.type ? `: ${oneLine(m.type.getText(sf))}` : ""};`;
        if (ts.isPropertyDeclaration(m))
          return `  ${hasModifier(m, ts.SyntaxKind.StaticKeyword) ? "static " : ""}${m.name.getText(sf)}${m.type ? `: ${oneLine(m.type.getText(sf))}` : ""};`;
        if (ts.isGetAccessorDeclaration(m))
          return `  get ${m.name.getText(sf)}()${m.type ? `: ${oneLine(m.type.getText(sf))}` : ""};`;
        return "";
      })
      .filter(Boolean);
    signature = `class ${name}${typeParams(c, sf)}${heritage ? ` ${heritage}` : ""} {\n${members.join("\n")}\n}`;
  } else if (kind === "namespace") {
    signature = `namespace ${name}`;
  } else {
    // interface, type, enum: zdroj deklarace bez JSDoc, zkrácený
    let t = d.getText(sf);
    const lines = t.split("\n");
    if (lines.length > MAX_TYPE_LINES)
      t = `${lines.slice(0, MAX_TYPE_LINES).join("\n")}\n// … (zkráceno, celá deklarace je ve zdroji)`;
    signature = t.replace(/^export\s+(default\s+)?/, "");
  }

  const summaryText = description
    .split(/\n\s*\n/)[0]!
    .replace(/\s+/g, " ")
    .trim();
  return {
    name,
    kind,
    file: rel(sf.fileName),
    summary: summaryText,
    description,
    signature,
    params,
    returns,
    deprecated: dep ? oneLine(ts.displayPartsToString(dep.text)) || "ano" : null,
    home: `${rel(sf.fileName)}#${d.pos}`,
  };
}

/** Markdown JSDoc popisu: kódové bloky nechá, zbytek ošetří proti HTML značkám. */
function descriptionMd(s: string): string {
  const out: string[] = [];
  let fenced = false;
  for (const line of s.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    out.push(fenced || /^\s*```/.test(line) ? line : text(line));
  }
  return out
    .join("\n")
    .replace(/\{@link\s+([^}\s|]+)(?:[\s|]+([^}]*))?\}/g, (_, a: string, b?: string) =>
      code(b?.trim() || a),
    );
}

const KIND_ORDER: Kind[] = [
  "function",
  "class",
  "const",
  "interface",
  "type",
  "enum",
  "namespace",
  "re-export",
];

function entryFile(pkgDir: string, subpath: string) {
  const name = subpath === "." ? "index" : subpath.slice(2).replace(/\//g, "-");
  return `${DIR}/${pkgDir}/${name}.md`;
}

/** API referenčního dokumentu: exportované funkce a typy po balíčcích a vstupních bodech. */
export function apiDocs(): Record<string, string> {
  const raw = packageEntries();
  // i soubory .tsx (UI modulů), které `packageEntries` jinak přeskakuje, patří do API
  const all: { pkg: string; subpath: string; file: string }[] = [...raw];
  const withTsx = tsxEntries();
  for (const e of withTsx)
    if (!all.some((x) => x.file === e.file && x.subpath === e.subpath)) all.push(e);
  all.sort((a, b) => (`${a.pkg}\0${a.subpath}` < `${b.pkg}\0${b.subpath}` ? -1 : 1));

  const prog = program([...new Set(all.map((e) => e.file))]);
  const checker = prog.getTypeChecker();
  const out: Record<string, string> = {};

  type Entry = {
    pkg: string;
    pkgDir: string;
    subpath: string;
    file: string;
    items: ApiItem[];
    reexports: { name: string; from: string }[];
  };
  const entries: Entry[] = [];
  for (const e of all) {
    const sf = prog.getSourceFile(path.join(ROOT, e.file));
    const mod = sf && checker.getSymbolAtLocation(sf);
    if (!sf || !mod) continue;
    const items: ApiItem[] = [];
    const reexports: Entry["reexports"] = [];
    for (const ex of checker.getExportsOfModule(mod)) {
      const target = ex.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(ex) : ex;
      const d = target.declarations?.[0];
      if (!d) continue;
      if (d.getSourceFile().fileName.includes("/node_modules/")) {
        const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(d.getSourceFile().fileName);
        reexports.push({ name: ex.name, from: m?.[1] ?? "externí balíček" });
        continue;
      }
      const item = describe(ex.name, target, d, checker);
      if (item) items.push(item);
    }
    items.sort((a, b) => {
      const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
      return k !== 0 ? k : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    reexports.sort((a, b) => (a.name < b.name ? -1 : 1));
    entries.push({ ...e, pkgDir: e.pkg.replace(/^@rebar\//, ""), items, reexports });
  }

  // domovský vstupní bod deklarace: nejdřív konkrétní podcesty, hlavní vstup (".") až nakonec
  const homeOf = new Map<string, Entry>();
  const priority = [...entries].sort((a, b) =>
    a.pkg !== b.pkg
      ? 0
      : (a.subpath === ".") === (b.subpath === ".")
        ? a.subpath < b.subpath
          ? -1
          : 1
        : a.subpath === "."
          ? 1
          : -1,
  );
  for (const e of priority)
    for (const i of e.items)
      if (!homeOf.has(`${e.pkg}\0${i.home}`)) homeOf.set(`${e.pkg}\0${i.home}`, e);

  const indexRows: unknown[][] = [];
  for (const e of entries) {
    const file = entryFile(e.pkgDir, e.subpath);
    const own = e.items.filter((i) => homeOf.get(`${e.pkg}\0${i.home}`) === e);
    const entryName = e.subpath === "." ? e.pkg : `${e.pkg}${e.subpath.slice(1)}`;
    const documented = e.items.filter((i) => i.description).length;
    indexRows.push([
      link(code(entryName), DIR, file),
      e.items.length,
      documented,
      e.items.length ? `${Math.round((documented / e.items.length) * 100)} %` : "",
      code(e.file),
    ]);

    const summaryRows = e.items.map((i) => {
      const home = homeOf.get(`${e.pkg}\0${i.home}`)!;
      const target =
        home === e
          ? `#${i.name.toLowerCase()}`
          : `${path.posix.relative(path.posix.dirname(file), entryFile(home.pkgDir, home.subpath))}#${i.name.toLowerCase()}`;
      return [
        `[${code(i.name)}](${target})`,
        i.kind,
        text(i.summary),
        home === e
          ? ""
          : `v ${code(home.subpath === "." ? home.pkg : home.pkg + home.subpath.slice(1))}`,
      ];
    });

    out[file] = doc(
      `# ${entryName}`,
      generatedHeader("exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích"),
      `Vstupní bod ${code(entryName)} (soubor ${code(e.file)}). Exportů: ${e.items.length}, z toho s popisem ${documented}.`,
      e.items.length
        ? table(["Export", "Druh", "Popis", "Podrobně"], summaryRows)
        : "_Vstupní bod nemá žádné vlastní exporty._",
      e.reexports.length
        ? `Re-exporty z externích knihoven: ${e.reexports.map((r) => `${code(r.name)} (${code(r.from)})`).join(", ")}.`
        : "",
      ...own.map((i) =>
        doc(
          `### ${i.name}`,
          `${i.kind}${i.deprecated ? ` (zastaralé: ${text(i.deprecated)})` : ""} · ${code(i.file)}`,
          i.description ? descriptionMd(i.description) : "_Bez popisu._",
          "```ts\n" + i.signature + "\n```",
          i.params.length
            ? "Parametry:\n\n" +
                i.params
                  .map((p) => `- ${code(p.name)}${p.text ? `: ${text(p.text)}` : ""}`)
                  .join("\n")
            : "",
          i.returns ? `Vrací: ${text(i.returns)}` : "",
        ),
      ),
    );
  }

  out[`${DIR}/README.md`] = doc(
    "# API reference",
    generatedHeader("TSDoc komentáře a deklarace exportů ve zdrojích (TypeScript compiler API)"),
    "Reference exportovaných funkcí, tříd a typů po balíčcích a vstupních bodech (`exports` v `package.json`). Každý export má popis z JSDoc nad deklarací; export bez popisu je označen „Bez popisu“ a hlídá ho ratchet (`pnpm docs:coverage`, [ADR 022](../../adr/022-dokumentace-z-kodu.md)). Export, který balíček nabízí přes více vstupních bodů, je popsán jednou (v konkrétním podbodu, ne v hlavním vstupu).",
    table(["Vstupní bod", "Exportů", "S popisem", "Pokrytí", "Soubor"], indexRows),
  );
  return out;
}

/** Vstupní body typu `.tsx` (UI modulů a balíčku UI), které běžný výpis vstupních bodů přeskakuje. */
function tsxEntries(): { pkg: string; subpath: string; file: string }[] {
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
  ];
  for (const dir of dirs.sort()) {
    const pj = path.join(ROOT, dir, "package.json");
    if (!fs.existsSync(pj)) continue;
    const pkg = JSON.parse(fs.readFileSync(pj, "utf8")) as {
      name: string;
      exports?: Record<string, string>;
    };
    for (const [subpath, target] of Object.entries(pkg.exports ?? {}))
      if (typeof target === "string" && target.endsWith(".tsx"))
        out.push({ pkg: pkg.name, subpath, file: path.posix.join(dir, target) });
  }
  return out;
}
