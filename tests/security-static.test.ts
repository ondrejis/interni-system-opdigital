import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
  Statické kontroly bezpečnosti nad zdrojovými soubory a nasazením (bez databáze, běží vteřiny):
  hlavičky v Caddy, ochrana route handlerů (CSRF, přihlášení, omezení počtu požadavků), zakázané vzory (SQL ze
  řetězců, vkládání HTML, eval), tajemství v repozitáři a klientská logika v jádru.
*/

const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");

function walk(dir: string, skip: readonly string[] = []): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (
      ["node_modules", ".next", "dist", "test-results", "playwright-report", ".data"].includes(
        e.name,
      )
    )
      return [];
    const full = path.join(dir, e.name);
    if (skip.some((s) => rel(full).startsWith(s))) return [];
    return e.isDirectory() ? walk(full, skip) : [full];
  });
}

const isTest = (f: string) => /\.(test|spec)\.tsx?$/.test(f) || rel(f).startsWith("tests/");
const sources = (dirs: string[]) =>
  dirs
    .flatMap((d) => walk(path.join(root, d)))
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !isTest(f));

/* ---------- Caddy: hlavičky ---------- */

describe("Caddyfile: bezpečnostní hlavičky a limity", () => {
  const caddy = read("deploy/caddy/Caddyfile");
  const header = (name: string) => {
    const m = caddy.match(new RegExp(`^\\s*${name}\\s+"([^"]*)"`, "mi"));
    return m?.[1];
  };
  const csp = Object.fromEntries(
    (header("Content-Security-Policy") ?? "").split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values];
    }),
  ) as Record<string, string[]>;

  it("HSTS na rok včetně poddomén", () => {
    const v = header("Strict-Transport-Security") ?? "";
    expect(Number(v.match(/max-age=(\d+)/)?.[1])).toBeGreaterThanOrEqual(31_536_000);
    expect(v).toContain("includeSubDomains");
  });

  it("CSP: výchozí zdroj jen vlastní, žádné unsafe-eval, žádné cizí skripty, zákaz vkládání a pluginů", () => {
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["script-src"]).toContain("'self'");
    for (const [directive, values] of Object.entries(csp)) {
      expect(values, directive).not.toContain("'unsafe-eval'");
      expect(values, directive).not.toContain("*");
      expect(
        values.filter((x) => /^https?:/.test(x)),
        directive,
      ).toEqual([]);
    }
    // inline skripty potřebuje jen Next.js (hydratace) a skript motivu; nesmí se přidat nic dalšího
    expect(csp["script-src"]!.filter((v) => v.startsWith("'unsafe"))).toEqual(["'unsafe-inline'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
    expect(csp["connect-src"]).toEqual(["'self'"]);
  });

  it("X-Frame-Options, Referrer-Policy, X-Content-Type-Options, Permissions-Policy", () => {
    expect(header("X-Frame-Options")).toBe("DENY");
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toMatch(
      /^(no-referrer|same-origin|strict-origin(-when-cross-origin)?)$/,
    );
    const pp = header("Permissions-Policy") ?? "";
    for (const feature of ["microphone", "payment"]) expect(pp).toContain(`${feature}=()`);
    expect(pp).not.toMatch(/=\*/);
  });

  it("neprozrazuje server, přepisuje adresu klienta a omezuje velikost těla (menší limit u veřejných cest)", () => {
    expect(caddy).toMatch(/-Server/);
    expect(caddy).toMatch(/header_up X-Forwarded-For \{remote_host\}/);
    expect(caddy).toMatch(/max_size 30MB/);
    // veřejné a přihlašovací cesty nepotřebují velká těla (poptávky, přihlášení, pozvánky)
    expect(caddy).toMatch(
      /@small[\s\S]*\/api\/intake\/\*[\s\S]*request_body @small[\s\S]*max_size \d+KB/,
    );
  });
});

/* ---------- route handlery ---------- */

describe("route handlery v apps/web/src/app/api", () => {
  const routes = walk(path.join(root, "apps/web/src/app/api")).filter((f) =>
    f.endsWith("route.ts"),
  );
  const MUTATING = /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/;

  /** Zvenku volané bez přihlášení: každá musí mít vlastní ochranu (podpis/klíč/token) a omezení počtu požadavků. */
  const PUBLIC: Record<string, { guard: RegExp; limit: RegExp | null }> = {
    "auth/[...all]": { guard: /getServices\(\)\.auth\.handler/, limit: null }, // limity a CSRF řeší Better Auth (testováno v jádru)
    "health/live": { guard: /select 1/, limit: null }, // bez podrobností a bez dat
    health: { guard: /HEALTH_TOKEN/, limit: null },
    // příchozí požadavky od n8n a Googlu: podpis (HMAC) nebo token kanálu, omezení počtu požadavků (doplní C2 a KAL-A)
    "ingest/[source]": { guard: /signature|podpis|hmac/i, limit: /consumeRateLimit/ },
    "kalendar/google/webhook": { guard: /channel|token/i, limit: /consumeRateLimit/ },
    "kalendar/feed/[token]": { guard: /feedForToken/, limit: /consumeRateLimit/ },
    "invitations/accept": { guard: /acceptInvitation/, limit: /consumeRateLimit/ },
  };

  it("každý route handler je buď přihlášený (ctxFromRequest), nebo veřejný s vlastní ochranou a limitem", () => {
    for (const f of routes) {
      const key = rel(f)
        .replace("apps/web/src/app/api/", "")
        .replace(/\/route\.ts$/, "");
      const src = fs.readFileSync(f, "utf8");
      const pub = PUBLIC[key];
      if (pub) {
        expect(src, `${key}: ochrana`).toMatch(pub.guard);
        if (pub.limit) expect(src, `${key}: omezení počtu požadavků`).toMatch(pub.limit);
      } else {
        expect(src, `${key}: chybí ctxFromRequest (nezařazená veřejná cesta?)`).toContain(
          "ctxFromRequest(",
        );
        expect(src, `${key}: nepřihlášený musí dostat 401`).toMatch(/401/);
      }
    }
  });

  it("každá mutace (POST/PUT/PATCH/DELETE) kontroluje původ požadavku (CSRF), kromě klíčem chráněných vstupů", () => {
    // Better Auth má vlastní kontrolu původu; příchozí požadavky jsou serverová volání s podpisem
    const EXEMPT = new Set(["auth/[...all]", "ingest/[source]", "kalendar/google/webhook"]);
    for (const f of routes) {
      const key = rel(f)
        .replace("apps/web/src/app/api/", "")
        .replace(/\/route\.ts$/, "");
      const src = fs.readFileSync(f, "utf8");
      if (!MUTATING.test(src) && !/export const (POST|PUT|PATCH|DELETE)\b/.test(src)) continue;
      if (EXEMPT.has(key)) continue;
      expect(src, `${key}: mutace bez sameOriginOrFail`).toContain("sameOriginOrFail(");
    }
  });

  it("GET handlery nic nemění v datech (žádný insert/update/delete mimo omezení počtu požadavků)", () => {
    for (const f of routes) {
      const src = fs.readFileSync(f, "utf8");
      const get = src.match(/export\s+async\s+function\s+GET[\s\S]*?(?=\nexport\s|$)/)?.[0] ?? "";
      expect(get, rel(f)).not.toMatch(/\.(insert|update|delete)\(/);
    }
  });

  it("odpovědi se soubory mají nosniff a nikdy neposílají neověřený typ (inline jen obrázky a PDF)", () => {
    for (const file of ["apps/web/src/app/api/files/[id]/route.ts"]) {
      const src = read(file);
      expect(src, file).toMatch(/x-content-type-options.*nosniff/i);
      expect(src, file).toMatch(
        /INLINE = \/\^\(image\\\/\(jpeg\|png\|webp\|gif\)\|application\\\/pdf\)\$\//,
      );
      expect(src, file).toMatch(/content-security-policy.*sandbox/i);
    }
  });
});

/* ---------- zakázané vzory ---------- */

describe("zakázané vzory v kódu", () => {
  const code = sources(["packages", "apps/web/src", "scripts"]).filter(
    (f) => !rel(f).startsWith("scripts/_tmp-"), // dočasné pracovní skripty (nejsou součástí repozitáře)
  );

  const offenders = (re: RegExp, allow: readonly string[] = []) =>
    code
      .filter((f) => !allow.includes(rel(f)))
      .flatMap((f) =>
        fs
          .readFileSync(f, "utf8")
          .split("\n")
          .map((l, i) => ({ at: `${rel(f)}:${i + 1}`, l }))
          .filter(({ l }) => re.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)),
      )
      .map((x) => x.at);

  it("SQL se nesestavuje z řetězců: sql.raw a .unsafe jen na zaručeně bezpečných místech", () => {
    expect(
      offenders(/\bsql\.raw\(|\.unsafe\(/, [
        "packages/core/src/entities/expr.ts", // klíč vlastního pole ověřený regulárním výrazem [a-z][a-z0-9_]{1,40}
        "packages/core/src/db/grants.ts", // názvy rolí a schémat z konfigurace migrací, ne od uživatele
        "packages/core/src/testing/global-setup.ts",
        "packages/core/src/testing/setup-file.ts", // testovací databáze s názvem generovaným z náhodných bajtů
        "scripts/perf-check.ts", // vývojový nástroj: název databáze z prostředí (ověřený regulárním výrazem), EXPLAIN zachycených dotazů
      ]),
    ).toEqual([]);
  });

  it("HTML se nevkládá z dat: dangerouslySetInnerHTML jen pro konstantní CSS a skript motivu", () => {
    expect(
      offenders(/dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\(/, [
        "packages/ui/src/components/rise.tsx",
        "apps/web/src/app/layout.tsx",
      ]),
    ).toEqual([]);
  });

  it("žádné eval, new Function ani dynamické require z uživatelského vstupu", () => {
    expect(offenders(/\beval\(|new Function\(/)).toEqual([]);
  });

  it("nikde se nevypisuje celá zpráva se vstupem do logu bez očištění (console.error jen přes captureError)", () => {
    expect(
      offenders(/console\.(error|warn)\(.*\berr\b/, [
        "apps/web/src/instrumentation-node.ts", // chyba konfigurace při startu (bez dat)
        "packages/core/src/observability/scrub.ts",
      ]).filter((at) => !at.startsWith("scripts/")),
    ).toEqual([]);
  });

  it("přesměrování míří jen na pevné adresy aplikace (žádný otevřený redirect z parametru)", () => {
    const calls = code.flatMap((f) =>
      fs
        .readFileSync(f, "utf8")
        .split("\n")
        .map((l, i) => ({ at: `${rel(f)}:${i + 1}`, l }))
        .filter(({ l }) => /\bredirect\(/.test(l) && !/^\s*(import|\/\/|\*)/.test(l)),
    );
    for (const { at, l } of calls)
      expect(l, at).toMatch(/redirect\(\s*(["'`]\/|allowedSections|`\/)/);
  });
});

/* ---------- tajemství ---------- */

describe("tajemství v repozitáři", () => {
  const SECRET_PATTERNS: [string, RegExp][] = [
    ["soukromý klíč", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["klíč AWS", /\bAKIA[0-9A-Z]{16}\b/],
    ["token GitHubu", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
    ["klíč OpenAI/Anthropic", /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ["klíč Googlu", /\bAIza[0-9A-Za-z_-]{30,}\b/],
    ["token Slacku", /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/],
    [
      "heslo v adrese databáze",
      /postgres(ql)?:\/\/[^:@/\s$]+:(?!app@|migrator@|\$\{|<|x@|\*\*\*)[^@/\s$]{6,}@/,
    ],
    [
      "přiřazené tajemství",
      /\b(AUTH_SECRET|APP_ENCRYPTION_KEY|HEALTH_TOKEN|VAPID_PRIVATE_KEY|RESTIC_PASSWORD|AWS_SECRET_ACCESS_KEY|DB_[A-Z_]*PASSWORD)=[A-Za-z0-9+/_=-]{16,}/,
    ],
  ];

  const tracked = (() => {
    try {
      return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
        .split("\0")
        .filter(Boolean);
    } catch {
      return null; // bez gitu (např. rozbalený archiv) se skenuje strom
    }
  })();
  const files = (tracked ?? walk(root).map(rel)).filter(
    (f) => !/(pnpm-lock\.yaml|\.(png|jpe?g|ico|woff2?|ttf|pdf|xlsx|zip|svg)$)/.test(f),
  );

  it("žádný soubor v repu neobsahuje klíč, token ani heslo (ukázky v testech a návodech jsou zástupné)", () => {
    const hits: string[] = [];
    for (const f of files) {
      // tento soubor popisuje vzory a test očištění logu záměrně obsahuje ukázkové údaje
      if (
        ["tests/security-static.test.ts", "packages/core/src/observability/scrub.test.ts"].includes(
          f,
        )
      )
        continue;
      let text: string;
      try {
        text = fs.readFileSync(path.join(root, f), "utf8");
      } catch {
        continue;
      }
      for (const [label, re] of SECRET_PATTERNS) if (re.test(text)) hits.push(`${f}: ${label}`);
    }
    expect(hits).toEqual([]);
  });

  it("v gitu nejsou soubory .env (jen vzory) ani klíče", () => {
    const names = files.filter((f) =>
      /(^|\/)\.env($|\.)|\.(pem|key|p12|pfx)$|id_(rsa|ed25519)/.test(f),
    );
    expect(names.filter((f) => !/\.env\.example$/.test(f))).toEqual([]);
  });

  it("vzory .env.example nemají tajná pole vyplněná", () => {
    for (const file of [".env.example", "deploy/.env.example"]) {
      const text = read(file);
      for (const key of [
        "AUTH_SECRET",
        "APP_ENCRYPTION_KEY",
        "HEALTH_TOKEN",
        "VAPID_PRIVATE_KEY",
        "OWNER_PASSWORD",
      ]) {
        const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
        if (m) expect(m[1]!.trim(), `${file}: ${key}`).toBe("");
      }
    }
  });
});

/* ---------- interní název a klientská logika ---------- */

describe("interní název a klienti", () => {
  it("v souborech klientů (config, branding, seed) není interní název mimo importy @rebar/*", () => {
    const found = walk(path.join(root, "clients"))
      .filter((f) => /\.(ts|tsx|json|css|svg|md)$/.test(f))
      .filter((f) => !f.endsWith("package.json"))
      .flatMap((f) =>
        fs
          .readFileSync(f, "utf8")
          .split("\n")
          .map((l, i) => ({ at: `${rel(f)}:${i + 1}`, l: l.replace(/@rebar\//g, "") }))
          .filter(({ l }) => /rebar/i.test(l)),
      )
      .map((x) => x.at);
    expect(found).toEqual([]);
  });

  it("veřejné soubory (service worker, ikony, manifest) nenesou interní název", () => {
    for (const f of walk(path.join(root, "apps/web/public")).filter((x) =>
      /\.(js|json|webmanifest|html|txt)$/.test(x),
    ))
      expect(fs.readFileSync(f, "utf8"), rel(f)).not.toMatch(/rebar/i);
  });

  it("v jádru a modulech není podmínka na konkrétního klienta (slug, client, CLIENT, BUILT_FOR_CLIENT)", () => {
    const core = sources(["packages", "apps/web/src"]).filter(
      (f) => !rel(f).startsWith("packages/core/src/testing/"),
    );
    const patterns: [string, RegExp][] = [
      [
        "porovnání slug",
        /\bslug\s*(?:===|!==|==(?!=)|!=(?!=))(?!\s*["']string["'])|(===|!==|==|!=)\s*[\w.?]*\bslug\b/,
      ],
      [
        "porovnání client",
        /\b(client|clientSlug|clientName)\s*(===|!==|==|!=)|(===|!==|==|!=)\s*(client|clientSlug)\b/,
      ],
      ["switch podle klienta", /switch\s*\(\s*[\w.]*(slug|client)\b/i],
      ["proměnná CLIENT", /process\.env\.CLIENT\b|NEXT_PUBLIC_BUILT_FOR_CLIENT/],
      ["adresář klientů mimo alias", /["'`][^"'`]*\/clients\/(?!_template)[^"'`]*["'`]/],
    ];
    const allow = new Set([
      "apps/web/src/server/bootstrap.ts", // jediné místo, kde se při startu čte vybraný klient
      "packages/core/src/config/schema.ts", // `slug` ve schématu konfigurace (kontrola tvaru, ne větvení)
    ]);
    const found: string[] = [];
    for (const f of core) {
      if (allow.has(rel(f))) continue;
      fs.readFileSync(f, "utf8")
        .split("\n")
        .forEach((l, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
          for (const [label, re] of patterns)
            if (re.test(l)) found.push(`${rel(f)}:${i + 1} (${label})`);
        });
    }
    expect(found).toEqual([]);
  });
});
