/*
  Exportované deklarace a jejich popisy (JSDoc). Jediný zdroj pravdy pro pravidlo ESLintu
  (`docs/exported-description`) i pro `pnpm docs:coverage`, takže obojí vždy říká totéž.

  Pracuje nad AST ve tvaru ESTree z `@typescript-eslint/parser` (s `range` a `comment: true`), proto je to čisté `.mjs`
  a načte ho konfigurace ESLintu i skripty spouštěné přes tsx.
*/

/** Druhy, u kterých se popis vyžaduje. Komponenty a hodnoty se jen počítají. */
export const REQUIRED_KINDS = ["function", "class", "interface", "type", "enum"];

/**
 * Text popisu z JSDoc bloku: všechno před první značkou `@…`, bez hvězdiček.
 * @param {string} value obsah komentáře tak, jak ho dává parser (bez okrajových značek komentáře)
 */
export function jsdocDescription(value) {
  const lines = value.split("\n").map((l) => l.replace(/^\s*\* ?/, ""));
  const out = [];
  for (const line of lines) {
    if (/^\s*@\w/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * Popis (JSDoc) těsně před uzlem, nebo `null`. Mezi komentářem a uzlem smí být jen prázdné znaky nebo řádkové komentáře
 * (např. `// eslint-disable-next-line`).
 * @param {{ range: [number, number] }} node
 * @param {{ type: string; value: string; range: [number, number] }[]} comments
 * @param {string} text
 */
export function leadingDescription(node, comments, text) {
  let end = node.range[0];
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.range[1] > end) continue;
    if (text.slice(c.range[1], end).trim() !== "") return null;
    if (c.type === "Block" && c.value.startsWith("*")) return jsdocDescription(c.value);
    if (c.type === "Line") {
      end = c.range[0];
      continue;
    }
    return null; // obyčejný blokový komentář popis neposkytuje
  }
  return null;
}

const isFn = (n) => n && (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression");

/** Funkce obalená voláním (`forwardRef(() => …)`, `memo(function …)`), typicky komponenta. */
function wrappedFn(n) {
  return n && n.type === "CallExpression" && n.arguments.some((a) => isFn(a));
}

function kindOfDeclaration(decl, init, name, isTsx) {
  switch (decl.type) {
    case "FunctionDeclaration":
    case "TSDeclareFunction":
      return isTsx && /^[A-Z]/.test(name) ? "component" : "function";
    case "ClassDeclaration":
      return "class";
    case "TSInterfaceDeclaration":
      return "interface";
    case "TSTypeAliasDeclaration":
      return "type";
    case "TSEnumDeclaration":
      return "enum";
    case "VariableDeclarator":
      if (isFn(init)) return isTsx && /^[A-Z]/.test(name) ? "component" : "function";
      if (isTsx && /^[A-Z]/.test(name) && wrappedFn(init)) return "component";
      if (init && init.type === "ClassExpression") return "class";
      return "value";
    default:
      return null;
  }
}

/**
 * Všechny exportované deklarace souboru.
 * @param {object} ast program (ESTree) s `range` a `comments`
 * @param {string} text zdrojový text souboru
 * @param {string} filename jen kvůli příponě (`.tsx` = komponenty)
 * @returns {{ name: string; kind: string; documented: boolean; node: object; line: number }[]}
 */
export function exportedDeclarations(ast, text, filename) {
  const isTsx = filename.endsWith(".tsx");
  const comments = ast.comments ?? [];
  /** @type {Map<string, { stmt: object; decl: object; init?: object }>} */
  const locals = new Map();
  for (const st of ast.body) {
    const target =
      st.type === "ExportNamedDeclaration" || st.type === "ExportDefaultDeclaration"
        ? st.declaration
        : st;
    if (!target) continue;
    if (target.type === "VariableDeclaration") {
      for (const d of target.declarations)
        if (d.id.type === "Identifier") locals.set(d.id.name, { stmt: st, decl: d, init: d.init });
    } else if (
      target.id &&
      target.id.type === "Identifier" &&
      kindOfDeclaration(target, undefined, target.id.name, isTsx)
    ) {
      locals.set(target.id.name, { stmt: st, decl: target });
    }
  }

  const out = [];
  const push = (name, stmt, decl, init, node) => {
    const kind = kindOfDeclaration(decl, init, name, isTsx);
    if (!kind) return;
    const desc = leadingDescription(stmt, comments, text);
    out.push({ name, kind, documented: !!desc, node, line: node.loc?.start.line ?? 0 });
  };

  for (const st of ast.body) {
    if (st.type === "ExportNamedDeclaration") {
      if (st.declaration) {
        const d = st.declaration;
        if (d.type === "VariableDeclaration") {
          for (const v of d.declarations)
            if (v.id.type === "Identifier") push(v.id.name, st, v, v.init, v);
        } else if (d.id && d.id.type === "Identifier") push(d.id.name, st, d, undefined, d);
      } else if (!st.source) {
        for (const sp of st.specifiers) {
          if (sp.type !== "ExportSpecifier") continue;
          const local = sp.local.name;
          const l = locals.get(local);
          const exported = sp.exported.name ?? sp.exported.value;
          if (l && l.stmt !== st) push(exported, l.stmt, l.decl, l.init, sp);
        }
      }
    } else if (st.type === "ExportDefaultDeclaration") {
      const d = st.declaration;
      if (d.type === "Identifier") {
        const l = locals.get(d.name);
        if (l && l.stmt !== st) push("default", l.stmt, l.decl, l.init, d);
      } else if (
        (d.type === "FunctionDeclaration" ||
          d.type === "ClassDeclaration" ||
          d.type === "TSDeclareFunction") &&
        d.id
      ) {
        push(d.id.name, st, d, undefined, d);
      } else if (d.type === "FunctionDeclaration" || d.type === "ClassDeclaration") {
        push("default", st, d, undefined, d);
      }
    }
  }

  // přetížené funkce: popis stačí na jedné signatuře
  const merged = new Map();
  for (const e of out) {
    const key = `${e.kind}:${e.name}`;
    const prev = merged.get(key);
    if (!prev) merged.set(key, e);
    else prev.documented = prev.documented || e.documented;
  }
  return [...merged.values()];
}
