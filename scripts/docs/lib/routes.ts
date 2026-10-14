import ts from "typescript";
import { leadingJsdoc, parseFile, summary, walk } from "./corpus";

/** Trasa Next.js aplikace (`apps/web/src/app`). */
export type AppRoute = {
  /** Adresa s dynamickými částmi `[id]`; skupiny tras `(app)` se do adresy nepromítají. */
  path: string;
  kind: "page" | "route";
  /** Skupina tras (`app` pro `(app)`), prázdná mimo skupinu. */
  group: string;
  file: string;
  /** U route handleru metody HTTP. */
  methods: string[];
  doc: string;
};

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function exportedMethods(sf: ts.SourceFile): string[] {
  const found = new Set<string>();
  for (const st of sf.statements) {
    const exported =
      ts.canHaveModifiers(st) &&
      ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(st) && exported && st.name && METHODS.includes(st.name.text))
      found.add(st.name.text);
    if (ts.isVariableStatement(st) && exported)
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && METHODS.includes(d.name.text)) found.add(d.name.text);
        if (ts.isObjectBindingPattern(d.name))
          for (const el of d.name.elements)
            if (ts.isIdentifier(el.name) && METHODS.includes(el.name.text)) found.add(el.name.text);
      }
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause))
      for (const el of st.exportClause.elements)
        if (METHODS.includes(el.name.text)) found.add(el.name.text);
  }
  return METHODS.filter((m) => found.has(m));
}

/** Popis souboru: JSDoc první deklarace, nebo JSDoc exportované funkce (výchozí export / metoda). */
function fileDoc(sf: ts.SourceFile): string {
  for (const st of sf.statements) {
    const d = leadingJsdoc(sf, st);
    if (d && !ts.isImportDeclaration(st)) return summary(d);
  }
  const first = sf.statements[0];
  if (first) return summary(leadingJsdoc(sf, first));
  return "";
}

/** Všechny `page.tsx` a `route.ts` v `apps/web/src/app`. */
export function appRoutes(): AppRoute[] {
  const base = "apps/web/src/app";
  const files = walk(base, (f) => /\/(page|route)\.(ts|tsx)$/.test(f));
  return files
    .map((file) => {
      const sub = file.slice(base.length + 1).split("/");
      const name = sub.pop()!;
      const kind: AppRoute["kind"] = name.startsWith("page") ? "page" : "route";
      const groups = sub.filter((s) => /^\(.+\)$/.test(s)).map((s) => s.slice(1, -1));
      const segs = sub.filter((s) => !/^\(.+\)$/.test(s) && !s.startsWith("@"));
      const sf = parseFile(file);
      return {
        path: `/${segs.join("/")}`,
        kind,
        group: groups.join("/"),
        file,
        methods: kind === "route" ? exportedMethods(sf) : [],
        doc: fileDoc(sf),
      };
    })
    .sort((a, b) => (a.path === b.path ? (a.kind < b.kind ? -1 : 1) : a.path < b.path ? -1 : 1));
}

/** Exportovaná funkce serverové akce (`"use server"`). */
export type ServerAction = { name: string; file: string; params: string; doc: string };

/** Serverové akce: exportované funkce souborů, které začínají direktivou `"use server"`. */
export function serverActions(): ServerAction[] {
  const out: ServerAction[] = [];
  for (const file of walk("apps/web/src", (f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))) {
    const sf = parseFile(file);
    const first = sf.statements[0];
    if (
      !first ||
      !ts.isExpressionStatement(first) ||
      !ts.isStringLiteral(first.expression) ||
      first.expression.text !== "use server"
    )
      continue;
    for (const st of sf.statements) {
      if (!ts.isFunctionDeclaration(st) || !st.name) continue;
      if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      out.push({
        name: st.name.text,
        file,
        params: st.parameters.map((p) => p.getText(sf).replace(/\s+/g, " ")).join(", "),
        doc: summary(leadingJsdoc(sf, st)),
      });
    }
  }
  return out;
}
