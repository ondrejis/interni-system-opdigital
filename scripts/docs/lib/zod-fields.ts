import { zod } from "./deps";

/** Jedno pole vstupního schématu (Zod) převedené na řádek tabulky. */
export type Field = {
  path: string;
  type: string;
  required: boolean;
  nullable: boolean;
  default: string;
  constraints: string;
  values: string[];
  description: string;
};

type Json = {
  type?: string | string[];
  format?: string;
  properties?: Record<string, Json>;
  required?: string[];
  items?: Json | Json[];
  anyOf?: Json[];
  oneOf?: Json[];
  allOf?: Json[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  description?: string;
  additionalProperties?: boolean | Json;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  prefixItems?: Json[];
};

const UUID_PATTERN = /^\^\(\[0-9a-fA-F\]\{8\}/;

/** Převede schéma na JSON Schema (vstup), nebo `null`, když to nejde. */
function toJson(schema: unknown): Json | null {
  try {
    return zod.toJSONSchema(schema as never, { io: "input", unrepresentable: "any" }) as Json;
  } catch {
    return null;
  }
}

function range(min: number | undefined, max: number | undefined, unit: string): string {
  if (min !== undefined && max !== undefined)
    return min === max ? `${unit} ${min}` : `${unit} ${min}–${max}`;
  if (min !== undefined) return `${unit} ≥ ${min}`;
  if (max !== undefined) return `${unit} ≤ ${max}`;
  return "";
}

function constraintsOf(n: Json): string {
  const parts: string[] = [];
  const len = range(n.minLength, n.maxLength, "délka");
  if (len) parts.push(len);
  const lo = n.minimum ?? n.exclusiveMinimum;
  const hi = n.maximum ?? n.exclusiveMaximum;
  // meze celého čísla (Number.MAX_SAFE_INTEGER) nejsou informace
  const num = range(
    lo !== undefined && Math.abs(lo) >= 9e15 ? undefined : lo,
    hi !== undefined && Math.abs(hi) >= 9e15 ? undefined : hi,
    "hodnota",
  );
  if (num) parts.push(num);
  const items = range(n.minItems, n.maxItems, "počet");
  if (items) parts.push(items);
  if (n.pattern && !UUID_PATTERN.test(n.pattern) && n.pattern.length <= 60)
    parts.push(`vzor \`${n.pattern}\``);
  return parts.join(", ");
}

function formatLabel(n: Json): string {
  const t = Array.isArray(n.type) ? n.type.join(" | ") : n.type;
  switch (n.format) {
    case "uuid":
      return "uuid";
    case "date-time":
      return "datum a čas";
    case "date":
      return "datum";
    case "email":
      return "e-mail";
    case "uri":
    case "url":
      return "url";
    default:
      break;
  }
  if (n.format) return `${t ?? "string"} (${n.format})`;
  switch (t) {
    case "string":
      return "text";
    case "integer":
      return "celé číslo";
    case "number":
      return "číslo";
    case "boolean":
      return "ano/ne";
    case "null":
      return "null";
    case undefined:
      return "libovolné";
    default:
      return t;
  }
}

function nonNullAlternatives(n: Json): { alts: Json[]; nullable: boolean } {
  const list = n.anyOf ?? n.oneOf ?? [];
  const alts = list.filter((a) => !(a.type === "null" && Object.keys(a).length === 1));
  return { alts, nullable: alts.length !== list.length };
}

/** Přesná čísla v JSON bez exponentu; objekty a pole kompaktně. */
function showValue(v: unknown): string {
  const s = JSON.stringify(v);
  return s === undefined ? "" : s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

type Walk = { fields: Field[]; docs: ReadonlyMap<string, string> };

function walk(n: Json, p: string, required: boolean, ctx: Walk, inheritedNullable = false) {
  let node = n;
  let nullable = inheritedNullable;
  // anyOf [X, null] → X nullable
  if (node.anyOf || node.oneOf) {
    const { alts, nullable: nn } = nonNullAlternatives(node);
    if (nn) nullable = true;
    if (alts.length === 1) {
      node = {
        ...alts[0]!,
        default: node.default ?? alts[0]!.default,
        description: node.description ?? alts[0]!.description,
      };
    } else if (alts.length > 1) {
      const allObjects = alts.every((a) => a.type === "object" && a.properties);
      const labels = [
        ...new Set(
          alts.map((a) => (a.enum ? "enum" : a.const !== undefined ? "konstanta" : formatLabel(a))),
        ),
      ];
      const values = alts.flatMap((a) =>
        a.enum ? a.enum.map(String) : a.const !== undefined ? [String(a.const)] : [],
      );
      ctx.fields.push({
        path: p || "(vstup)",
        type: allObjects ? "jedna z variant" : labels.join(" | "),
        required,
        nullable,
        default: node.default !== undefined ? showValue(node.default) : "",
        constraints: "",
        values,
        description: node.description ?? ctx.docs.get(p) ?? "",
      });
      if (allObjects) {
        alts.forEach((a) => {
          for (const [k, v] of Object.entries(a.properties ?? {})) {
            const sub = p ? `${p}.${k}` : k;
            if (!ctx.fields.some((f) => f.path === sub)) walk(v, sub, false, ctx);
          }
        });
      }
      return;
    }
  }
  if (node.allOf?.length === 1) node = { ...node.allOf[0]!, ...node, allOf: undefined };

  const base: Field = {
    path: p || "(vstup)",
    type: formatLabel(node),
    required,
    nullable,
    default: node.default !== undefined ? showValue(node.default) : "",
    constraints: constraintsOf(node),
    values: [],
    description: node.description ?? ctx.docs.get(p) ?? "",
  };
  if (node.enum) {
    base.type = "enum";
    base.values = node.enum.map((v) => String(v));
  } else if (node.const !== undefined) {
    base.type = "konstanta";
    base.values = [String(node.const)];
  }

  if (node.type === "object" && node.properties) {
    if (p) ctx.fields.push({ ...base, type: "objekt" });
    const req = new Set(node.required ?? []);
    for (const [k, v] of Object.entries(node.properties)) {
      walk(v, p ? `${p}.${k}` : k, req.has(k), ctx);
    }
    if (node.additionalProperties && typeof node.additionalProperties === "object")
      walk(node.additionalProperties, `${p}.*`, false, ctx);
    return;
  }
  if (node.type === "object" && typeof node.additionalProperties === "object") {
    ctx.fields.push({ ...base, type: "slovník (klíč → hodnota)" });
    walk(node.additionalProperties, p ? `${p}.*` : "*", false, ctx);
    return;
  }
  if (node.type === "array" && node.items && !Array.isArray(node.items)) {
    const item = node.items;
    const itemNode = item.anyOf ? (nonNullAlternatives(item).alts[0] ?? item) : item;
    if (itemNode.type === "object" && itemNode.properties) {
      ctx.fields.push({ ...base, type: "pole objektů" });
      const req = new Set(itemNode.required ?? []);
      for (const [k, v] of Object.entries(itemNode.properties)) {
        walk(v, `${p}[].${k}`, req.has(k), ctx);
      }
      return;
    }
    ctx.fields.push({
      ...base,
      type: `pole (${itemNode.enum ? "enum" : formatLabel(itemNode)})`,
      values: itemNode.enum ? itemNode.enum.map(String) : [],
    });
    return;
  }
  ctx.fields.push(base);
}

/** Tabulkové pole `Field[]` z libovolného Zod schématu; `docs` doplní popisy podle cesty pole (z JSDoc). */
export function schemaFields(
  schema: unknown,
  docs: ReadonlyMap<string, string> = new Map(),
): { fields: Field[]; error?: string } {
  const json = toJson(schema);
  if (!json) return { fields: [], error: "Schéma nelze převést na popis polí (viz zdrojový kód)." };
  const ctx: Walk = { fields: [], docs };
  if (json.type === "object" && json.properties) {
    const req = new Set(json.required ?? []);
    for (const [k, v] of Object.entries(json.properties)) walk(v, k, req.has(k), ctx);
  } else {
    walk(json, "", true, ctx);
  }
  return { fields: ctx.fields };
}

/** Řádky tabulky polí pro `table()`. */
export function fieldRows(
  fields: readonly Field[],
  code: (s: string) => string,
  text: (s: string) => string,
): string[][] {
  return fields.map((f) => [
    code(f.path),
    f.type + (f.nullable ? " (nebo null)" : ""),
    f.required ? "ano" : "ne",
    f.values.length ? f.values.map((v) => code(v)).join(", ") : "",
    [f.constraints, f.default ? `výchozí ${code(f.default)}` : ""].filter(Boolean).join("; "),
    text(f.description),
  ]);
}

export const FIELD_HEADERS = ["Pole", "Typ", "Povinné", "Hodnoty", "Omezení", "Popis"] as const;
