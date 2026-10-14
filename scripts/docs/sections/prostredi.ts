import fs from "node:fs";
import path from "node:path";
import { clientConfigSchema } from "@rebar/core";
import { envSchema } from "../../../apps/web/src/server/env";
import { envUsages, propertyDocs, walk } from "../lib/corpus";
import { code, doc, generatedHeader, table, text } from "../lib/md";
import { ROOT } from "../lib/paths";
import { FIELD_HEADERS, fieldRows, schemaFields } from "../lib/zod-fields";

type ZodLike = {
  safeParse(v: unknown): { success: boolean; data?: unknown };
  _zod: { def: Record<string, unknown> & { type: string } };
};

/** Popisy z komentářů v `.env.example`: komentář nad proměnnou je její popis (prázdný řádek ho přeruší). */
function envExampleDocs(): Map<string, string> {
  const file = path.join(ROOT, ".env.example");
  const out = new Map<string, string>();
  if (!fs.existsSync(file)) return out;
  let comment: string[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const c = /^#\s?(.*)$/.exec(line);
    const v = /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line);
    if (c && !v) comment.push(c[1]!);
    else if (v) {
      // komentář nad proměnnou je její popis; platí jen pro proměnnou bezprostředně pod ním
      if (comment.length) out.set(v[1]!, comment.join(" ").replace(/\s+/g, " ").trim());
      comment = [];
    } else if (line.trim() === "") comment = [];
  }
  return out;
}

function unwrap(s: ZodLike): ZodLike {
  let node = s;
  for (;;) {
    const d = node._zod.def;
    if (["optional", "nullable", "nullish", "default", "prefault"].includes(d.type))
      node = d.innerType as ZodLike;
    else if (d.type === "pipe") node = d.out as ZodLike;
    else return node;
  }
}

function envType(s: ZodLike): { type: string; values: string[]; constraints: string } {
  const node = unwrap(s);
  const d = node._zod.def as {
    type: string;
    format?: string;
    entries?: Record<string, string>;
    checks?: {
      _zod: { def: { check: string; minimum?: number; pattern?: RegExp; format?: string } };
    }[];
  };
  const constraints: string[] = [];
  for (const c of d.checks ?? []) {
    const cd = c._zod.def;
    if (cd.check === "min_length" && cd.minimum !== undefined)
      constraints.push(`alespoň ${cd.minimum} znaků`);
    if (cd.check === "string_format" && cd.format === "regex" && cd.pattern)
      constraints.push(`vzor \`${cd.pattern.source}\``);
  }
  if (d.type === "enum")
    return { type: "enum", values: Object.values(d.entries ?? {}), constraints: "" };
  if (d.type === "boolean") return { type: "ano/ne", values: [], constraints: "" };
  if (d.type === "number")
    return { type: "číslo", values: [], constraints: constraints.join("; ") };
  if (d.type === "string") {
    const fmt = d.format === "url" ? "url" : "text";
    return { type: fmt, values: [], constraints: constraints.join("; ") };
  }
  return { type: d.type, values: [], constraints: constraints.join("; ") };
}

/** Proměnné prostředí (validační schéma aplikace + ostatní použití v kódu) a konfigurace klienta (`config.ts`). */
export function environmentDocs(): Record<string, string> {
  const shape = (envSchema as unknown as { shape: Record<string, ZodLike> }).shape;
  const propDocs = propertyDocs("apps/web/src/server/env.ts");
  const example = envExampleDocs();

  const schemaNames = Object.keys(shape).sort();
  const usages = envUsages([
    ...walk("apps", (f) => /\.(ts|tsx|mjs)$/.test(f)),
    ...walk("packages", (f) => /\.(ts|tsx|mjs)$/.test(f)),
    ...walk("scripts", (f) => /\.(ts|tsx|mjs)$/.test(f)),
    ...walk("tests", (f) => /\.(ts|tsx|mjs)$/.test(f)),
    ...walk("clients", (f) => /\.(ts|tsx|mjs)$/.test(f)),
  ]);

  const schemaRows = schemaNames.map((name) => {
    const field = shape[name]!;
    const r = field.safeParse(undefined);
    const t = envType(field);
    const def = r.success && r.data !== undefined ? String(r.data) : "";
    return [
      code(name),
      t.type,
      r.success ? "ne" : "ano",
      t.values.length ? t.values.map((v) => code(v)).join(", ") : "",
      def ? code(def) : "",
      t.constraints,
      text(propDocs.get(name) ?? example.get(name) ?? ""),
    ];
  });

  const others = [...usages.keys()].filter((k) => !shape[k]);
  const otherRows = others.map((name) => {
    const files = usages.get(name)!;
    const shown = files
      .slice(0, 4)
      .map((f) => code(f))
      .join(", ");
    return [
      code(name),
      text(example.get(name) ?? ""),
      files.length > 4 ? `${shown} a dalších ${files.length - 4}` : shown,
    ];
  });
  const exampleOnly = [...example.keys()].filter((k) => !shape[k] && !usages.has(k)).sort();

  // konfigurace klienta
  const cfgDocs = propertyDocs("packages/core/src/config/schema.ts");
  const cfg = schemaFields(clientConfigSchema, cfgDocs);

  const envDoc = doc(
    "# Proměnné prostředí a konfigurace",
    generatedHeader(
      "validační schéma `envSchema` (`apps/web/src/server/env.ts`), `clientConfigSchema`, `.env.example` a použití `process.env` ve zdrojích",
    ),
    "Proměnné prostředí nastavují instanci (databáze, adresa, tajemství); konfigurace klienta (`clients/<slug>/config.ts`) určuje moduly, branding a zabezpečení. Postup nasazení je v [DEPLOYMENT](../DEPLOYMENT.md), vzor v `.env.example`.",
    "## Proměnné prostředí aplikace",
    "Ověřuje je `loadEnv` při startu; špatné nastavení aplikaci nenastartuje a vypíše všechny chyby. „Povinná“ znamená, že schéma odmítne chybějící hodnotu. Podmínky, které závisejí na kombinaci proměnných nebo na produkčním režimu, kontroluje navíc samotná funkce `loadEnv` (viz `apps/web/src/server/env.ts`).",
    table(["Proměnná", "Typ", "Povinná", "Hodnoty", "Výchozí", "Omezení", "Popis"], schemaRows),
    "## Další proměnné čtené v kódu",
    "Proměnné mimo validační schéma aplikace (migrace, seed, testy, výkonové a procházecí testy, sestavení). Nejsou součástí provozní konfigurace aplikace, pokud není uvedeno jinak.",
    table(["Proměnná", "Popis z `.env.example`", "Kde se čte"], otherRows),
    exampleOnly.length
      ? doc(
          "## Proměnné jen v `.env.example`",
          "Proměnné ze vzoru, které žádný zdrojový soubor TypeScriptu nečte (používají je skripty v shellu nebo Docker Compose):",
          exampleOnly
            .map((n) => `- ${code(n)}${example.get(n) ? `: ${text(example.get(n))}` : ""}`)
            .join("\n"),
        )
      : "",
    "## Konfigurace klienta (`clients/<slug>/config.ts`)",
    "Typovaná a validovaná Zodem při startu (`clientConfigSchema`, `defineClientConfig`). Změna znamená nové sestavení image. Přehled úrovní úprav je v [CUSTOMIZATION](../CUSTOMIZATION.md).",
    cfg.error ? cfg.error : table([...FIELD_HEADERS], fieldRows(cfg.fields, code, text)),
  );
  return { "docs/reference/prostredi.md": envDoc };
}
