import fs from "node:fs";
import path from "node:path";
import { MODULE_IDS } from "@rebar/core";
import { describe, expect, it } from "vitest";
import { fileDeclaresSymbol } from "../scripts/docs/lib/symbols";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

function walk(dir: string, filter: (f: string) => boolean): string[] {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    if (["node_modules", ".next", "dist"].includes(e.name)) return [];
    const rel = path.posix.join(dir, e.name);
    return e.isDirectory() ? walk(rel, filter) : filter(rel) ? [rel] : [];
  });
}

/** Povinná dokumentace podle zadání (§13). */
const REQUIRED = [
  "README.md",
  "CHANGELOG.md",
  "docs/ARCHITECTURE.md",
  "docs/CUSTOMIZATION.md",
  "docs/DEPLOYMENT.md",
  "docs/RUNBOOK.md",
  "docs/SECURITY.md",
  "docs/AUDIT.md",
  "docs/OPEN-QUESTIONS.md",
  "docs/INDEX.md",
  "docs/DOCS-PROCES.md",
  "docs/moduly/_sablona.md",
  "docs/reference/README.md",
  "docs/DASHBOARDY.md",
  "docs/EXPORTY.md",
];

/**
 * Generovaná reference (`pnpm docs:generate`): vzniká z kódu a komentářů v něm, proto se u ní kontrolují jen odkazy
 * (jedním testem), ne interní název jádra ani příkazy v textu. Aktuálnost vůči kódu hlídá `pnpm docs:check`.
 */
const GENERATED = walk("docs/reference", (f) => f.endsWith(".md"));

/**
 * Pracovní dokumenty projektu OPSYS (zadání, rozbory, specifikace od zadavatele): mluví o jádru Rebar a o postupu prací,
 * proto se u nich nekontrolují odkazy, příkazy ani interní název. Do rozcestníku docs/INDEX.md patří (generuje se).
 */
const WORKING_DOCS = ["docs/opsys/", "docs/specifikace/", "docs/_archiv/"];

/** Ručně psané dokumenty, ve kterých se kontrolují odkazy a příkazy. */
const DOCS = [
  "README.md",
  "CHANGELOG.md",
  ...walk(
    "docs",
    (f) =>
      f.endsWith(".md") && !GENERATED.includes(f) && !WORKING_DOCS.some((w) => f.startsWith(w)),
  ),
  ...walk("clients", (f) => f.endsWith(".md")),
];

/**
 * Dokumenty určené klientovi. Interní pracovní název jádra se v nich nesmí objevit (zadání §11).
 * Dokumentace pro vývojáře a správce (`docs/`, `README.md`) ho smí obsahovat v názvech balíčků a cestách.
 */
const CLIENT_FACING = walk("clients", (f) => f.endsWith(".md"));

/** Odstraní fenced bloky a vrátí jen běžný text (odkazy v ukázkách kódu se nekontrolují). */
function withoutFences(md: string): string {
  return md.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
}

/** GitHub kotva nadpisu: malá písmena, bez interpunkce, mezery na pomlčky (diakritika zůstává). */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function anchorsOf(md: string): Set<string> {
  const out = new Set<string>();
  for (const m of withoutFences(md).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) out.add(slug(m[1]!));
  return out;
}

describe("povinná dokumentace existuje a není prázdná", () => {
  for (const f of REQUIRED) {
    it(f, () => {
      expect(exists(f), `chybí ${f}`).toBe(true);
      expect(read(f).trim().length).toBeGreaterThan(500);
    });
  }

  it("ADR jsou očíslované bez děr", () => {
    const nums = walk("docs/adr", (f) => f.endsWith(".md")).map((f) =>
      Number(path.posix.basename(f).slice(0, 3)),
    );
    expect(nums.length).toBeGreaterThan(0);
    nums.sort((a, b) => a - b);
    nums.forEach((n, i) => expect(n).toBe(i + 1));
  });
});

/** Rozbité relativní odkazy (soubor, kotva) v jednom dokumentu. */
function brokenLinks(doc: string): string[] {
  const md = read(doc);
  const bad: string[] = [];
  for (const m of withoutFences(md)
    .replace(/`[^`\n]*`/g, "")
    .matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1]!;
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue; // http(s), mailto…
    const [file = "", anchor] = target.split("#") as [string, string | undefined];
    const resolved = file === "" ? doc : path.posix.join(path.posix.dirname(doc), file);
    const rel = path.posix.normalize(resolved);
    if (rel.startsWith("..")) {
      bad.push(`${target} (mimo repozitář)`);
      continue;
    }
    if (!exists(rel)) {
      bad.push(`${target} (soubor neexistuje)`);
      continue;
    }
    if (anchor && rel.endsWith(".md") && !anchorsOf(read(rel)).has(decodeURIComponent(anchor)))
      bad.push(`${target} (kotva neexistuje)`);
  }
  return bad;
}

/** Wiki odkazy `[[…]]` bez cíle. Hledá se vedle dokumentu, v `docs/` a v `docs/adr/`. */
function brokenWikiLinks(doc: string): string[] {
  const bad: string[] = [];
  for (const m of withoutFences(read(doc))
    .replace(/`[^`\n]*`/g, "")
    .matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const t = m[1]!.trim();
    const dir = path.posix.dirname(doc);
    const candidates = [t, `${t}.md`].flatMap((c) => [
      c,
      `${dir}/${c}`,
      `docs/${c}`,
      `docs/adr/${c}`,
    ]);
    if (!candidates.some(exists)) bad.push(`[[${t}]]`);
  }
  return bad;
}

describe("odkazy v dokumentaci", () => {
  for (const doc of DOCS) {
    it(`${doc}: relativní odkazy na soubory a kotvy vedou na existující cíl`, () => {
      expect(brokenLinks(doc)).toEqual([]);
    });
  }

  it("generovaná reference: relativní odkazy na soubory a kotvy vedou na existující cíl", () => {
    expect(GENERATED.length).toBeGreaterThan(0);
    const bad = GENERATED.flatMap((doc) => brokenLinks(doc).map((b) => `${doc}: ${b}`));
    expect(bad).toEqual([]);
  });

  it("wiki odkazy [[…]] v dokumentaci vedou na existující soubor", () => {
    const bad = [...DOCS, ...GENERATED].flatMap((f) => brokenWikiLinks(f).map((b) => `${f}: ${b}`));
    expect(bad).toEqual([]);
  });
});

describe("interní název jádra", () => {
  it("v dokumentech určených klientovi se nevyskytuje", () => {
    const found = CLIENT_FACING.filter((f) => /rebar/i.test(read(f)));
    expect(found).toEqual([]);
  });

  it("v udržované dokumentaci pro vývojáře je jen jako název balíčku (@rebar/…), databáze, proměnná nebo cesta", () => {
    // Dovolené: @rebar/…, rebar_dev/rebar_test/… (databáze a role), REBAR_TEST_… (proměnné), `rebar` (věta, která
    // interní název vysvětluje), rebar/ (cesta v pracovním prostoru). Historické a pracovní dokumenty (AUDIT, ZAKAZKA, CRM) a rozcestník (INDEX cituje jejich nadpisy) se nekontrolují.
    const allowed = /@rebar\/|rebar_[a-z0-9_]+|REBAR_[A-Z_]+|`rebar`|rebar\/|rebar@|-rebar\.md/gi;
    const maintained = DOCS.filter(
      (d) => !CLIENT_FACING.includes(d) && !["docs/AUDIT.md", "docs/INDEX.md"].includes(d),
    );
    const found: string[] = [];
    for (const doc of maintained) {
      withoutFences(read(doc))
        .split("\n")
        .forEach((line, i) => {
          const rest = line.replace(allowed, "");
          if (/rebar/i.test(rest)) found.push(`${doc}:${i + 1}: ${line.trim().slice(0, 90)}`);
        });
    }
    expect(found).toEqual([]);
  });
});

describe("příkazy pnpm v dokumentaci existují", () => {
  const rootScripts = new Set(
    Object.keys((JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts),
  );
  const workspaceScripts = new Set<string>();
  const workspaceNames = new Map<string, Set<string>>();
  for (const dir of ["apps", "packages", "packages/modules", "clients", "tests", "."]) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base)) continue;
    const candidates =
      dir === "." || dir === "tests" ? [base] : fs.readdirSync(base).map((d) => path.join(base, d));
    for (const c of candidates) {
      const pj = path.join(c, "package.json");
      if (!fs.existsSync(pj)) continue;
      const pkg = JSON.parse(fs.readFileSync(pj, "utf8")) as {
        name?: string;
        scripts?: Record<string, string>;
      };
      const scripts = new Set(Object.keys(pkg.scripts ?? {}));
      scripts.forEach((s) => workspaceScripts.add(s));
      if (pkg.name) workspaceNames.set(pkg.name, scripts);
    }
  }
  /** Vestavěné příkazy pnpm, které nejsou skripty. */
  const BUILTIN = new Set([
    "install",
    "i",
    "add",
    "remove",
    "exec",
    "dlx",
    "audit",
    "store",
    "update",
    "up",
    "outdated",
    "run",
    "-r",
    "--filter",
    "-C",
    "--dir",
  ]);

  /** Příkazy `pnpm …` z kódu (inline i fenced), s popisem místa. */
  function commandsIn(md: string): string[] {
    const chunks = [
      ...[...md.matchAll(/^(?:```|~~~)[^\n]*\n([\s\S]*?)^(?:```|~~~)/gm)].map((m) => m[1]!),
      ...[...withoutFences(md).matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!),
    ];
    return chunks.flatMap((c) =>
      c
        .split("\n")
        .flatMap((line) => line.split(/&&|\|\||;|\|/))
        .map((s) => s.trim().replace(/^(?:\$\s*|[A-Z_]+=\S+\s+)+/, ""))
        .filter((s) => /^pnpm\s/.test(s)),
    );
  }

  function check(command: string): string | null {
    const args = command.split(/\s+/).slice(1);
    let pkgScripts: Set<string> | null = null;
    let i = 0;
    while (i < args.length) {
      const a = args[i]!;
      if (a === "--filter" || a === "-C" || a === "--dir") {
        const target = args[i + 1] ?? "";
        pkgScripts = target.includes("<") ? workspaceScripts : (workspaceNames.get(target) ?? null);
        if (!pkgScripts) return `neznámý balíček ${target}`;
        i += 2;
      } else if (a === "-r" || a.startsWith("--")) i += 1;
      else break;
    }
    const name = args[i];
    if (!name) return null; // samotné `pnpm` v textu
    if (name === "run") return check(`pnpm ${args.slice(i + 1).join(" ")}`);
    if (name === "exec" || name === "dlx") return null;
    if (BUILTIN.has(name)) return null;
    if ((pkgScripts ?? rootScripts).has(name)) return null;
    return `skript „${name}“ není v package.json`;
  }

  for (const doc of DOCS) {
    it(`${doc}`, () => {
      const bad = commandsIn(read(doc)).flatMap((c) => {
        const problem = check(c);
        return problem ? [`${c} → ${problem}`] : [];
      });
      expect(bad).toEqual([]);
    });
  }
});

describe("cesty v dokumentaci existují", () => {
  const TOP = /^(apps|packages|clients|deploy|scripts|tests|docs|\.github)\//;
  /** Dokumenty, které popisují stav kódu (historii a rozhodnutí nekontrolujeme: mohou zmiňovat odstraněné soubory). */
  const CHECKED = [
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/CUSTOMIZATION.md",
    "docs/DEPLOYMENT.md",
    "docs/RUNBOOK.md",
    "docs/SECURITY.md",
  ];
  for (const doc of CHECKED) {
    it(`${doc}: cesty v kódu ukazují na existující soubory a složky`, () => {
      const bad: string[] = [];
      for (const m of read(doc).matchAll(/`([^`\n]+)`/g)) {
        const token = m[1]!
          .trim()
          .split(/\s+/)[0]!
          .replace(/[.,;:]+$/, "");
        if (!TOP.test(token)) continue;
        if (/[<>*{}$…]/.test(token)) continue; // zástupné hodnoty (<slug>, *, {…})
        const clean = token.replace(/:\d+$/, "");
        if (!exists(clean.replace(/\/$/, ""))) bad.push(clean);
      }
      expect([...new Set(bad)]).toEqual([]);
    });
  }
});

describe("README", () => {
  it("odkazuje na všechny hlavní dokumenty", () => {
    const readme = read("README.md");
    for (const f of [
      "docs/ARCHITECTURE.md",
      "docs/CUSTOMIZATION.md",
      "docs/DEPLOYMENT.md",
      "docs/RUNBOOK.md",
      "docs/SECURITY.md",
      "docs/DASHBOARDY.md",
      "docs/EXPORTY.md",
      "CHANGELOG.md",
    ])
      expect(readme, f).toContain(f);
  });
});

describe("nástěnky a exporty", () => {
  it("mají vlastní dokument a ADR s datovým a bezpečnostním modelem", () => {
    expect(read("docs/DASHBOARDY.md")).toContain("dashboardMetrics");
    expect(read("docs/DASHBOARDY.md")).toContain("adr/025-vlastni-nastenky.md");
    expect(read("docs/EXPORTY.md")).toContain("adr/026-exporty-fronta-plany.md");
    expect(read("docs/adr/025-vlastni-nastenky.md")).toContain("schemaVersion");
    expect(read("docs/adr/026-exporty-fronta-plany.md")).toContain("FOR UPDATE SKIP LOCKED");
  });
});

describe("rozcestník docs/INDEX.md", () => {
  it("odkazuje na každý dokument v docs/ (reference přes svůj úvod)", () => {
    const index = read("docs/INDEX.md");
    const linked = new Set(
      [...withoutFences(index).matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)].map((m) =>
        path.posix.normalize(path.posix.join("docs", m[1]!)),
      ),
    );
    const missing = walk("docs", (f) => f.endsWith(".md"))
      .filter((f) => f !== "docs/INDEX.md" && !GENERATED.includes(f))
      .filter((f) => !linked.has(f));
    expect(missing, "dokument chybí v rozcestníku (pnpm docs:generate)").toEqual([]);
    expect(linked.has("docs/reference/README.md")).toBe(true);
  });
});

describe("vyprávěcí dokumentace modulů (docs/moduly)", () => {
  const MODULE_DOCS = walk(
    "docs/moduly",
    (f) => f.endsWith(".md") && !path.posix.basename(f).startsWith("_"),
  );

  it("každý modul má dokument (kostru založí pnpm docs:scaffold)", () => {
    const missing = MODULE_IDS.filter((id) => !exists(`docs/moduly/${id}.md`));
    expect(missing).toEqual([]);
  });

  it("šablona obsahuje všechny povinné sekce", () => {
    const headings = [
      ...withoutFences(read("docs/moduly/_sablona.md")).matchAll(/^##\s+(.+?)\s*$/gm),
    ].map((m) => m[1]);
    expect(headings).toEqual([
      "Souhrn z kódu",
      "Účel",
      "Kdo to používá (role)",
      "Hlavní toky krok za krokem",
      "Stavy a přechody",
      "Pravidla a výpočty",
      "Oprávnění",
      "Nastavení",
      "Události a upozornění",
      "Exporty",
      "Integrace s jinými moduly",
      "Hrany a známá omezení",
      "Odkazy na kód a testy",
    ]);
  });

  for (const doc of MODULE_DOCS) {
    it(`${doc}: má blok „Souhrn z kódu“ a odkazy na kód (\`cesta/soubor.ts#symbol\`) vedou na existující soubor a symbol`, () => {
      const md = read(doc);
      expect(md).toContain("<!-- docs:generated:start -->");
      expect(md).toContain("<!-- docs:generated:end -->");
      const bad: string[] = [];
      for (const m of withoutFences(md).matchAll(/`([^`\n]+)`/g)) {
        const token = m[1]!.trim();
        const [file = "", symbol] = token.split("#") as [string, string | undefined];
        if (!/^(apps|packages|clients|deploy|scripts|tests|docs|\.github)\//.test(file)) continue;
        if (/[<>*{}$…]/.test(file)) continue; // zástupné hodnoty
        if (!/\.(ts|tsx|mjs|js|json|sql|md|yml|yaml|sh)$/.test(file)) continue; // složky a výrazy
        if (!exists(file)) {
          bad.push(`${token} (soubor neexistuje)`);
          continue;
        }
        if (symbol !== undefined && /\.(ts|tsx)$/.test(file) && !fileDeclaresSymbol(file, symbol))
          bad.push(`${token} (symbol v souboru není deklarovaný)`);
      }
      expect(bad).toEqual([]);
    });
  }
});

describe("detekce symbolů v odkazech na kód", () => {
  it("rozpozná deklarace a nepočítá zmínky v komentářích", () => {
    expect(fileDeclaresSymbol("packages/core/src/modules/registry.ts", "resolveModules")).toBe(
      true,
    );
    expect(
      fileDeclaresSymbol("packages/core/src/modules/registry.ts", "ModuleResolutionError"),
    ).toBe(true);
    expect(fileDeclaresSymbol("packages/core/src/modules/registry.ts", "neexistujiciSymbol")).toBe(
      false,
    );
  });
});
