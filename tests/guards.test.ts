import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (["node_modules", ".next", "dist", "test-results"].includes(e.name)) return [];
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const isSource = (f: string) =>
  /\.(ts|tsx|mjs|js|css|json)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith("package.json");
const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");

/** Kód jádra a aplikace: vše mimo klienty, skripty a testy. */
const coreFiles = [
  ...walk(path.join(root, "packages")),
  ...walk(path.join(root, "apps/web/src")),
  ...walk(path.join(root, "apps/web/public")),
].filter((f) => isSource(f) && !rel(f).startsWith("packages/core/src/testing/")); // testovací pomůcky: názvy DB rolí apod.

function offenders(files: string[], pattern: RegExp, allow: string[] = []) {
  return files
    .filter((f) => !allow.includes(rel(f)))
    .flatMap((f) =>
      fs
        .readFileSync(f, "utf8")
        .split("\n")
        .map((line, i) => ({ file: rel(f), line: i + 1, text: line.trim() }))
        .filter((l) => pattern.test(l.text)),
    );
}

describe("jádro neobsahuje klientskou logiku", () => {
  it("žádná podmínka na slug nebo proměnnou CLIENT (kromě kontroly při startu)", () => {
    const found = offenders(
      coreFiles,
      /(process\.env\.CLIENT\b|\bslug\s*(===|!==|==(?!=)|!=(?!=))\s*(?!\s|["']string["'])|(===|!==|==|!=)\s*[\w.?]*slug\b|switch\s*\([^)]*slug)/,
      ["apps/web/src/server/bootstrap.ts"],
    );
    expect(found).toEqual([]);
  });

  it("v kódu jádra nejsou jména konkrétních klientů", () => {
    const found = offenders(coreFiles, /thermodo|nikk|plze[ňn]sk[ýy] bagr|brochier/i);
    expect(found).toEqual([]);
  });

  it("jádro nesahá do složky clients/ jinak než přes aliasy @client/*", () => {
    const found = offenders(coreFiles, /["'`][^"'`]*\/clients\/[^"'`]*["'`]/);
    expect(found).toEqual([]);
  });
});

describe("interní název jádra se nedostane ke klientovi", () => {
  it("slovo „rebar“ se v kódu vyskytuje jen jako název balíčků @rebar/* a v definici INTERNAL_NAME", () => {
    const found = offenders(coreFiles, /rebar/i, ["packages/core/src/config/schema.ts"]).filter(
      (l) => /rebar/i.test(l.text.replace(/@rebar\//gi, "")),
    );
    expect(found).toEqual([]);
  });

  it("název systému v PWA, hlavičce a titulku jde z konfigurace, ne z textu v kódu", () => {
    const layout = fs.readFileSync(path.join(root, "apps/web/src/app/layout.tsx"), "utf8");
    expect(layout).toContain("getBranding()"); // branding = nastavení v administraci nebo konfigurace klienta
  });
});

describe("aplikace nenese kód migrací", () => {
  it("web ani běžné moduly neimportují @rebar/core/migrations (migrace jsou samostatný krok)", () => {
    const found = offenders(
      coreFiles.filter((f) => !rel(f).startsWith("packages/core/")),
      /@rebar\/core\/migrations/,
    );
    expect(found).toEqual([]);
  });

  it("import.meta.dirname se nepoužívá v kódu, který jde do bundlu aplikace", () => {
    const found = offenders(coreFiles, /import\.meta\.dirname/, [
      "packages/core/src/db/migrate.ts",
    ]);
    expect(found).toEqual([]);
  });
});

describe("upozornění", () => {
  it("moduly a aplikace vyvolávají upozornění přes notify() z katalogu, ne přes starý createNotifications", () => {
    const found = offenders(
      coreFiles.filter((f) => !rel(f).startsWith("packages/core/")),
      /\bcreateNotifications\s*\(/,
    );
    expect(found).toEqual([]);
  });

  it("push se neodesílá v modulech ani v aplikaci (jen worker přes jádro; žádné přímé volání web-push)", () => {
    const found = offenders(
      coreFiles.filter((f) => !rel(f).startsWith("packages/core/")),
      /\bsendNotification\s*\(|from\s+["']web-push["']|import\(["']web-push["']\)|\bpushToUser\s*\(/,
    );
    expect(found).toEqual([]);
  });

  it("service worker nepřijímá odkaz z cizího původu (otevírá jen cesty začínající /)", () => {
    const sw = fs.readFileSync(path.join(root, "apps/web/public/sw.js"), "utf8");
    expect(sw).toMatch(/startsWith\("\/"\)\s*&&\s*!value\.startsWith\("\/\/"\)/);
  });
});
