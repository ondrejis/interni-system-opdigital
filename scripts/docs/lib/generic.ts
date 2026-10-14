import { code, table, text } from "./md";

/*
  Obecné vykreslení registru, který generátor nezná: nová položka manifestu, `ModuleServer` nebo `ModuleUi` se tak
  objeví v referenci hned, i když pro ni ještě není vlastní sekce. Když je potřeba přesnější výpis, přidá se
  vlastní vykreslovač (viz `docs/DOCS-PROCES.md`, „Jak rozšířit generátor“).
*/

type Prim = string | number | boolean | null;
const isPrim = (v: unknown): v is Prim =>
  v === null || ["string", "number", "boolean"].includes(typeof v);

function entriesOf(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((v, i) => [String(i), v]);
  if (value instanceof Map) return [...value.entries()].map(([k, v]) => [String(k), v]);
  if (value instanceof Set) return [...value.values()].map((v, i) => [String(i), v]);
  if (value && typeof value === "object") return Object.entries(value);
  return [];
}

function shortValue(v: unknown): string {
  if (isPrim(v)) return v === null ? "" : code(String(v));
  if (typeof v === "function") return "funkce";
  if (Array.isArray(v)) {
    return v.every(isPrim) && v.length
      ? v.map((x) => code(String(x))).join(", ")
      : `pole (${v.length})`;
  }
  if (v && typeof v === "object") return "objekt";
  return "";
}

/** Tabulka z libovolné kolekce: sloupce jsou skalární vlastnosti položek, složitější hodnoty se jen označí. */
export function genericTable(value: unknown): string {
  const entries = entriesOf(value);
  if (!entries.length) return "_Prázdné._";
  const objects = entries.filter(([, v]) => v && typeof v === "object" && !Array.isArray(v));
  if (!objects.length) {
    // pole funkcí nebo skalárů: jen počet a případně názvy
    const names = entries.map(([k, v]) =>
      typeof v === "function"
        ? (v as { name?: string }).name || "(anonymní funkce)"
        : shortValue(v) || k,
    );
    return `Počet položek: ${entries.length}. ${
      names.some((n) => n !== "(anonymní funkce)") ? names.map((n) => code(n)).join(", ") : ""
    }`.trim();
  }
  const cols: string[] = [];
  for (const [, o] of objects)
    for (const [k, v] of Object.entries(o as object)) {
      if (!cols.includes(k) && (isPrim(v) || typeof v === "function" || Array.isArray(v)))
        cols.push(k);
    }
  const isMap = value instanceof Map || (!Array.isArray(value) && !(value instanceof Set));
  const headers = [...(isMap ? ["Klíč"] : []), ...cols];
  const rows = entries.map(([k, v]) => [
    ...(isMap ? [code(k)] : []),
    ...cols.map((c) => shortValue((v as Record<string, unknown> | null)?.[c])),
  ]);
  return table(
    headers.map((h) => text(h)),
    rows,
  );
}
