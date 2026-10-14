import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { forEachNode, leadingJsdoc, parseFile, stringLiteral, summary, walk } from "../lib/corpus";
import { drizzle, drizzlePg } from "../lib/deps";
import { code, doc, generatedHeader, link, plural, table, text } from "../lib/md";
import { ROOT } from "../lib/paths";
import type { Runtime } from "../lib/runtime";

const DIR = "docs/reference/databaze";

type AnyTable = Parameters<typeof drizzlePg.getTableConfig>[0];

type Group = { id: string; title: string; file: string; tables: AnyTable[] };

const isTable = (v: unknown): v is AnyTable =>
  !!v && typeof v === "object" && drizzle.is(v as never, drizzlePg.PgTable);

/** Tabulky z exportů souboru, v pořadí deklarace v souboru (ne podle abecedy: pořadí dává smysl čtenáři). */
async function tablesOf(file: string): Promise<AnyTable[]> {
  const mod = (await import(pathToFileURL(path.join(ROOT, file)).href)) as Record<string, unknown>;
  const names = exportedNamesInOrder(file);
  const seen = new Set<unknown>();
  const out: AnyTable[] = [];
  for (const n of names) {
    const v = mod[n];
    if (isTable(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  for (const v of Object.keys(mod)
    .sort()
    .map((k) => mod[k])) {
    if (isTable(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function exportedNamesInOrder(file: string): string[] {
  const sf = parseFile(file);
  const names: string[] = [];
  for (const st of sf.statements) {
    if (
      ts.isVariableStatement(st) &&
      st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name)) names.push(d.name.text);
  }
  return names;
}

/** Popis tabulky z JSDoc nad `export const x = pgTable("tabulka", …)`. */
function tableDocs(files: string[]): Map<string, { doc: string; file: string }> {
  const out = new Map<string, { doc: string; file: string }>();
  for (const file of files) {
    const sf = parseFile(file);
    forEachNode(sf, (n) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "pgTable" &&
        n.arguments[0]
      ) {
        const name = stringLiteral(n.arguments[0]);
        let stmt: ts.Node | undefined = n;
        while (stmt && !ts.isVariableStatement(stmt)) stmt = stmt.parent;
        if (name && stmt) out.set(name, { doc: summary(leadingJsdoc(sf, stmt)), file });
      }
    });
  }
  return out;
}

function sqlText(v: unknown): string {
  const chunks = (v as { queryChunks?: unknown[] }).queryChunks;
  if (!chunks) return "SQL";
  return chunks
    .map((c) => {
      const value = (c as { value?: unknown }).value;
      return Array.isArray(value) ? value.join("") : "?";
    })
    .join("")
    .trim();
}

function defaultOf(col: { hasDefault: boolean; default?: unknown; defaultFn?: unknown }): {
  text: string;
  code: boolean;
} {
  if (col.defaultFn) return { text: "generuje aplikace", code: false };
  if (!col.hasDefault) return { text: "", code: false };
  const d = col.default;
  if (d === undefined) return { text: "", code: false };
  if (d && typeof d === "object" && "queryChunks" in (d as object))
    return { text: sqlText(d), code: true };
  if (typeof d === "string") return { text: `'${d.replace(/'/g, "''")}'`, code: true };
  return { text: JSON.stringify(d), code: true };
}

function tableBlock(
  t: AnyTable,
  docs: Map<string, { doc: string; file: string }>,
  level = 3,
): string {
  const c = drizzlePg.getTableConfig(t);
  const meta = docs.get(c.name);
  const nameOf = (x: unknown) => (x as { name?: string }).name ?? "(výraz)";
  const tableName = (ft: unknown) => drizzlePg.getTableConfig(ft as AnyTable).name;

  const fkByColumn = new Map<string, string[]>();
  for (const fk of c.foreignKeys) {
    const r = fk.reference();
    const target = `${tableName(r.foreignTable)}.${r.foreignColumns.map(nameOf).join(",")}`;
    const rule = fk.onDelete ? ` (při smazání: ${fk.onDelete})` : "";
    for (const col of r.columns) {
      const list = fkByColumn.get(col.name) ?? [];
      list.push(`→ ${target}${rule}`);
      fkByColumn.set(col.name, list);
    }
  }
  const pkCols = new Set(c.primaryKeys.flatMap((p) => p.columns.map(nameOf)));

  const rows = c.columns.map((col) => {
    const notes: string[] = [];
    if (col.primary || pkCols.has(col.name)) notes.push("PK");
    if (col.isUnique) notes.push("unikátní");
    if (col.enumValues?.length) notes.push(`hodnoty: ${col.enumValues.join(", ")}`);
    notes.push(...(fkByColumn.get(col.name) ?? []));
    const d = defaultOf(col as never);
    return [
      code(col.name),
      code(col.getSQLType()),
      col.notNull ? "ne" : "ano",
      d.text ? (d.code ? code(d.text) : d.text) : "",
      notes.map((n) => (n.startsWith("→") ? n : n)).join("; "),
    ];
  });

  const extra: string[] = [];
  if (c.indexes.length)
    extra.push(
      table(
        ["Index", "Sloupce", "Druh"],
        c.indexes.map((i) => [
          code(i.config.name ?? "(bez názvu)"),
          i.config.columns.map((col) => code(nameOf(col))).join(", "),
          [i.config.unique ? "unikátní" : "", i.config.where ? "částečný" : ""]
            .filter(Boolean)
            .join(", "),
        ]),
      ),
    );
  if (c.uniqueConstraints.length)
    extra.push(
      table(
        ["Unikátní omezení", "Sloupce"],
        c.uniqueConstraints.map((u) => [
          code(u.name ?? "(bez názvu)"),
          u.columns.map((col) => code(col.name)).join(", "),
        ]),
      ),
    );
  if (c.primaryKeys.length)
    extra.push(
      `Složený primární klíč: ${c.primaryKeys.map((p) => p.columns.map((col) => code(col.name)).join(", ")).join("; ")}.`,
    );
  if (c.checks.length)
    extra.push(`Kontrolní omezení: ${c.checks.map((k) => code(k.name)).join(", ")}.`);

  return doc(
    `${"#".repeat(level)} ${c.name}`,
    meta?.doc ? text(meta.doc) : "",
    meta ? `Definice: ${code(meta.file)}.` : "",
    table(["Sloupec", "Typ", "Může být prázdný", "Výchozí", "Poznámka"], rows),
    ...extra,
  );
}

type Migration = { tag: string; date: string; summary: string };

function migrationsOf(dir: string): Migration[] {
  const journal = path.join(ROOT, dir, "meta/_journal.json");
  if (!fs.existsSync(journal)) return [];
  const j = JSON.parse(fs.readFileSync(journal, "utf8")) as {
    entries: { tag: string; when: number }[];
  };
  return j.entries.map((e) => {
    const sqlFile = path.join(ROOT, dir, `${e.tag}.sql`);
    const sql = fs.existsSync(sqlFile) ? fs.readFileSync(sqlFile, "utf8") : "";
    const ops = new Map<string, number>();
    const tables = new Set<string>();
    for (const m of sql.matchAll(
      /^\s*(CREATE (?:UNIQUE )?(?:TABLE|INDEX|FUNCTION|EXTENSION|TRIGGER|OR REPLACE FUNCTION)|ALTER TABLE|DROP (?:TABLE|INDEX|FUNCTION)|INSERT INTO|UPDATE|DELETE FROM)\b([^;]*)/gim,
    )) {
      const op = m[1]!.toUpperCase().replace(/\s+/g, " ");
      ops.set(op, (ops.get(op) ?? 0) + 1);
      const t =
        /\b(?:TABLE|INTO|UPDATE|FROM)\s+(?:IF (?:NOT )?EXISTS\s+)?"([a-z0-9_]+)"/i.exec(m[0]) ??
        /\bON\s+"([a-z0-9_]+)"/i.exec(m[0]);
      if (t) tables.add(t[1]!);
    }
    const opsText = [...ops.entries()].map(([k, n]) => `${k} ×${n}`).join(", ");
    const tablesText = [...tables].sort().join(", ");
    return {
      tag: e.tag,
      date: new Date(e.when).toISOString().slice(0, 10),
      summary: [opsText, tablesText ? `tabulky: ${tablesText}` : ""].filter(Boolean).join("; "),
    };
  });
}

/** Schéma databáze po balíčcích (jádro po souborech schématu, moduly po modulech) a seznam migrací. */
export async function databaseDocs(rt: Runtime): Promise<Record<string, string>> {
  const groups: Group[] = [];
  const coreFiles = walk(
    "packages/core/src/db/schema",
    (f) => f.endsWith(".ts") && !f.endsWith("index.ts"),
  );
  for (const f of coreFiles) {
    const id = path.basename(f, ".ts");
    groups.push({ id, title: `Jádro: ${id}`, file: f, tables: await tablesOf(f) });
  }
  const moduleGroups: Group[] = [];
  for (const m of rt.manifests) {
    const file = `packages/modules/${m.id}/src/schema.ts`;
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    moduleGroups.push({ id: m.id, title: `Modul ${m.name}`, file, tables: await tablesOf(file) });
  }
  const docsMap = tableDocs([...coreFiles, ...moduleGroups.map((g) => g.file)]);

  const out: Record<string, string> = {};
  const coreTables = groups.flatMap((g) => g.tables);
  const coreBlocks = groups
    .filter((g) => g.tables.length)
    .map((g) =>
      doc(
        `## Schéma ${g.id}`,
        `Soubor ${code(g.file)}. Tabulky: ${g.tables.map((t) => code(drizzlePg.getTableConfig(t).name)).join(", ")}.`,
        ...g.tables.map((t) => tableBlock(t, docsMap)),
      ),
    );
  const migrationBlock = (dir: string) => {
    const ms = migrationsOf(dir);
    return ms.length
      ? doc(
          "## Migrace",
          `Složka ${code(dir)}; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: ${ms.length}.`,
          table(
            ["Pořadí", "Název", "Datum", "Obsah"],
            ms.map((x, i) => [i, code(x.tag), x.date, text(x.summary)]),
          ),
        )
      : "";
  };
  out[`${DIR}/jadro.md`] = doc(
    "# Databáze: jádro",
    generatedHeader("definice tabulek v `packages/core/src/db/schema` (Drizzle) a žurnál migrací"),
    `Tabulky platformy: uživatelé a role, audit, spolupráce (komentáře, úkoly, upozornění), soubory, nastavení, číselníky, pohledy. Počet tabulek: ${coreTables.length}. Konvence sloupců (UUID v7, audit sloupce, měkké mazání, peníze v haléřích) popisují [ADR 002](../../adr/002-konvence-datoveho-modelu.md) a [ADR 003](../../adr/003-penize-a-mnozstvi.md).`,
    ...coreBlocks,
    migrationBlock("packages/core/drizzle"),
  );
  for (const g of moduleGroups) {
    out[`${DIR}/${g.id}.md`] = doc(
      `# Databáze: ${g.title}`,
      generatedHeader(`definice tabulek v \`${g.file}\` (Drizzle) a žurnál migrací modulu`),
      `Modul ${link(g.title.replace("Modul ", ""), DIR, `docs/reference/moduly/${g.id}.md`)}. Počet tabulek: ${g.tables.length}.`,
      ...g.tables.map((t) => tableBlock(t, docsMap, 2)),
      migrationBlock(`packages/modules/${g.id}/drizzle`),
    );
  }
  const allGroups = [
    {
      name: "Jádro",
      file: "jadro.md",
      tables: coreTables.length,
      migrations: migrationsOf("packages/core/drizzle").length,
    },
    ...moduleGroups.map((g) => ({
      name: g.title,
      file: `${g.id}.md`,
      tables: g.tables.length,
      migrations: migrationsOf(`packages/modules/${g.id}/drizzle`).length,
    })),
  ];
  out[`${DIR}/README.md`] = doc(
    "# Databáze",
    generatedHeader("definice tabulek (Drizzle) a žurnály migrací jádra a modulů"),
    "Jedna databáze PostgreSQL. Každý balíček (jádro, každý modul) vlastní své tabulky a svou složku migrací s vlastní tabulkou záznamu o migracích ([ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Tabulky vypnutého modulu se nemažou.",
    table(
      ["Balíček", "Tabulek", "Migrací", "Dokument"],
      allGroups.map((g) => [g.name, g.tables, g.migrations, link(g.file, DIR, `${DIR}/${g.file}`)]),
    ),
    `Celkem tabulek: ${allGroups.reduce((n, g) => n + g.tables, 0)}, ${plural(
      allGroups.reduce((n, g) => n + g.migrations, 0),
      "migrace",
      "migrace",
      "migrací",
    )}.`,
    "Tabulky fronty úloh (pg-boss) zakládá krok migrací (`installQueues`) ve schématu knihovny; v tomto přehledu nejsou.",
  );
  return out;
}
