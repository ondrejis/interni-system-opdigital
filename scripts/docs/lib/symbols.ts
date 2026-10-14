import ts from "typescript";
import { forEachNode, parseFile, propName } from "./corpus";

const cache = new Map<string, { names: Set<string>; strings: Set<string> }>();

function collect(file: string) {
  let c = cache.get(file);
  if (c) return c;
  const sf = parseFile(file);
  const names = new Set<string>();
  const strings = new Set<string>();
  const addBinding = (b: ts.BindingName) => {
    if (ts.isIdentifier(b)) names.add(b.text);
    else for (const el of b.elements) if (ts.isBindingElement(el)) addBinding(el.name);
  };
  forEachNode(sf, (n) => {
    if (
      (ts.isFunctionDeclaration(n) ||
        ts.isClassDeclaration(n) ||
        ts.isInterfaceDeclaration(n) ||
        ts.isTypeAliasDeclaration(n) ||
        ts.isEnumDeclaration(n) ||
        ts.isModuleDeclaration(n)) &&
      n.name &&
      ts.isIdentifier(n.name)
    )
      names.add(n.name.text);
    else if (ts.isVariableDeclaration(n)) addBinding(n.name);
    else if (
      ts.isPropertyAssignment(n) ||
      ts.isPropertySignature(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isMethodSignature(n) ||
      ts.isPropertyDeclaration(n) ||
      ts.isEnumMember(n) ||
      ts.isGetAccessorDeclaration(n) ||
      ts.isSetAccessorDeclaration(n)
    ) {
      const name = propName(n.name as ts.PropertyName);
      if (name) names.add(name);
    } else if (ts.isExportSpecifier(n)) names.add(n.name.text);
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) strings.add(n.text);
  });
  c = { names, strings };
  cache.set(file, c);
  return c;
}

/**
 * Deklaruje soubor symbol? Symbol je název deklarace (funkce, třídy, typu, konstanty, vlastnosti objektu, metody),
 * případně `Třída.metoda`, nebo text, který je v souboru řetězcovým literálem (název příkazu `zakazky.update`).
 * Zmínka jen v komentáři se nepočítá.
 */
export function fileDeclaresSymbol(file: string, symbol: string): boolean {
  const { names, strings } = collect(file);
  if (strings.has(symbol)) return true;
  return symbol.split(".").every((part) => names.has(part));
}
