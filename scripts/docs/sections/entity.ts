import type { AttributeDef, EntityDef } from "@rebar/core/entities";
import { definitionOf, summary } from "../lib/corpus";
import { drizzlePg } from "../lib/deps";
import { code, doc, generatedHeader, link, table, text } from "../lib/md";
import type { Runtime } from "../lib/runtime";

const DIR = "docs/reference/entity";
const HOOKS = [
  "beforeCreate",
  "afterCreate",
  "beforeUpdate",
  "afterUpdate",
  "beforeDelete",
] as const;

/** Název tabulky entity v databázi. */
export function tableNameOf(e: EntityDef): string {
  return drizzlePg.getTableConfig(e.table as never).name;
}

function columnOf(e: EntityDef, a: AttributeDef): string {
  if (a.custom) return "`custom` (JSONB)";
  const col = a.field
    ? (e.table as unknown as Record<string, { name?: string }>)[a.field]
    : undefined;
  return col?.name ? code(col.name) : "";
}

function flags(a: AttributeDef): string {
  const f: string[] = [];
  if (a.readonly) f.push("jen pro čtení");
  if (a.filterable === false) f.push("bez filtru");
  if (a.sortable === false) f.push("bez řazení");
  if (a.searchable === false) f.push("mimo hledání");
  if (a.aggregate?.length) f.push("součet");
  if (a.defaultVisible === false) f.push("výchozí skrytý");
  return f.join(", ");
}

/** Odkaz na anchor entity, pokud existuje v referenci. */
function entityRef(rt: Runtime, key: string, fromDir: string): string {
  const owner = rt.manifests.find((m) => rt.servers.get(m.id)?.entities.some((e) => e.key === key));
  return owner ? link(code(key), fromDir, `${DIR}/${owner.id}.md#${key}`) : code(key);
}

/** Entity: pole, typy, vazby, povinnost, enumy, oprávnění. */
export function entityDocs(rt: Runtime): Record<string, string> {
  const out: Record<string, string> = {};
  const index: string[][] = [];

  for (const m of rt.manifests) {
    const entities = rt.servers.get(m.id)?.entities ?? [];
    if (!entities.length) continue;
    const blocks = entities.map((e) => {
      const def = definitionOf("defineEntity", e.key);
      const perms = Object.entries(e.permissions)
        .filter(([, v]) => v)
        .map(([op, v]) => `${op}: ${code(v as string)}`)
        .join(", ");
      const hooks = [
        ...HOOKS.filter((h) => typeof e[h] === "function"),
        ...(e.search ? ["search"] : []),
        ...(e.scope ? ["scope"] : []),
        ...(e.owners ? ["owners"] : []),
        ...(e.ownerDefaults ? ["ownerDefaults"] : []),
      ];
      const info: string[] = [
        `- **Modul:** ${link(m.name, DIR, `docs/reference/moduly/${m.id}.md`)}`,
        `- **Tabulka:** ${code(tableNameOf(e))} (${link("databáze", DIR, `docs/reference/databaze/${m.id}.md`)})`,
        `- **Seznam:** ${code(e.listPath)}, detail ${code(`${e.listPath}/<id>`)}`,
        `- **Oprávnění:** ${perms}`,
        `- **Název záznamu:** ${code(e.titleKey)}${e.statusKey ? `, stav (kanban): ${code(e.statusKey)}` : ""}`,
      ];
      if (e.ownerColumns?.length)
        info.push(
          `- **Rozsah „jen moje“:** sloupce ${e.ownerColumns.map((c) => code((c as { name: string }).name)).join(", ")}`,
        );
      else if (e.scope) info.push("- **Rozsah „jen moje“:** vlastní predikát (`scope`)");
      if (e.noCreate)
        info.push(
          `- **Vytvoření:** jen příkazy modulu${typeof e.noCreate === "string" ? ` (${text(e.noCreate)})` : ""}`,
        );
      if (e.noDelete)
        info.push(
          `- **Smazání:** nelze${typeof e.noDelete === "string" ? ` (${text(e.noDelete)})` : ""}`,
        );
      if (hooks.length)
        info.push(`- **Háčky a rozšíření entity:** ${hooks.map((h) => code(h)).join(", ")}`);
      if (def) info.push(`- **Definice:** ${code(def.file)}`);

      const rows = e.attributes.map((a) => {
        const target = a.record ? `vazba na ${entityRef(rt, a.record.entityType, DIR)}` : "";
        const pipeline = a.pipeline
          ? `pipeline ${code(`${a.pipeline.entityType}/${a.pipeline.key}`)}`
          : "";
        const lookup = a.lookup ? `číselník ${code(a.lookup)}` : "";
        const choices = a.choices?.length ? a.choices.map((c) => code(c.value)).join(", ") : "";
        const limits = [
          a.min !== undefined ? `min ${a.min}` : "",
          a.max !== undefined ? `max ${a.max}` : "",
          a.unit ? `jednotka ${a.unit}` : "",
          a.default !== undefined ? `výchozí ${code(String(a.default))}` : "",
        ]
          .filter(Boolean)
          .join(", ");
        return [
          code(a.key),
          text(a.label),
          a.type,
          a.required ? "ano" : "ne",
          [target, pipeline, lookup, choices].filter(Boolean).join("; "),
          a.permission ? code(a.permission) : "",
          limits,
          flags(a),
          columnOf(e, a),
        ];
      });

      const pipelines = (m.seed?.pipelines ?? []).filter((p) => p.entityType === e.key);
      const pipeBlocks = pipelines.map((p) =>
        doc(
          `#### Výchozí pipeline „${text(p.name)}“ (${code(p.key)})`,
          table(
            ["Pořadí", "Stav", "Barva", "Druh", "Fáze"],
            p.stages.map((s, i) => [
              i + 1,
              text(s.name),
              s.color ?? "",
              s.kind ?? "",
              s.phase ?? "",
            ]),
          ),
        ),
      );

      index.push([
        link(code(e.key), "docs/reference/entity", `${DIR}/${m.id}.md#${e.key}`),
        text(e.label.one),
        m.id,
        code(tableNameOf(e)),
        String(e.attributes.length),
      ]);

      return doc(
        `## ${e.key}`,
        `**${text(e.label.one)}** (množné číslo: ${text(e.label.many)}).${summary(def?.doc) ? ` ${text(summary(def?.doc))}` : ""}`,
        info.join("\n"),
        `### Pole entity ${code(e.key)}`,
        table(
          [
            "Klíč",
            "Název",
            "Typ",
            "Povinné",
            "Hodnoty a vazby",
            "Oprávnění ke čtení",
            "Omezení",
            "Příznaky",
            "Sloupec v DB",
          ],
          rows,
        ),
        ...pipeBlocks,
      );
    });
    out[`${DIR}/${m.id}.md`] = doc(
      `# Entity modulu ${m.name}`,
      generatedHeader("registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek"),
      `Entity modulu ${link(m.name, DIR, `docs/reference/moduly/${m.id}.md`)}. Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.`,
      ...blocks,
    );
  }

  out[`${DIR}/README.md`] = doc(
    "# Entity",
    generatedHeader("registry entit všech modulů"),
    "Entity jsou záznamy, které engine umí zobrazit, filtrovat, řadit, exportovat a hlídat oprávněními. Každý modul má svůj soubor.",
    table(["Klíč", "Název", "Modul", "Tabulka", "Počet polí"], index),
  );
  return out;
}
