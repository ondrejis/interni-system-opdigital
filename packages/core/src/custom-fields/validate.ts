import type { CustomFieldOptions, CustomFieldType } from "../db/schema/config";
import { UserError } from "../rbac/errors";

export type FieldDef = {
  key: string;
  label: string;
  type: CustomFieldType;
  options: CustomFieldOptions;
  required: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const isEmpty = (v: unknown) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Typy hodnot atributů záznamů: typy vlastních polí plus dlouhý text a stav z pipeline. */
export type ValueType = CustomFieldType | "longtext" | "status";

export type ValueDef = { type: ValueType; options: CustomFieldOptions };

/**
 * Zkontroluje a upraví jednu hodnotu podle typu. Vrací normalizovanou hodnotu nebo vyhodí text
 * chyby (bez názvu pole — doplní volající). Používá se pro vlastní pole i nativní atributy entit.
 */
export function normalizeValue(def: ValueDef, v: unknown): unknown {
  switch (def.type) {
    case "longtext": {
      if (typeof v !== "string") throw "musí být text";
      const t = v.trim();
      if (t.length > 20000) throw "je příliš dlouhé";
      return t;
    }
    case "status": {
      if (typeof v !== "string" || !UUID.test(v)) throw "musí být platný stav";
      return v.toLowerCase();
    }
    case "text": {
      if (typeof v !== "string") throw "musí být text";
      const t = v.trim();
      if (t.length > 2000) throw "je příliš dlouhé";
      return t;
    }
    case "number": {
      if (typeof v !== "number" || !Number.isFinite(v)) throw "musí být číslo";
      return v;
    }
    case "currency": {
      if (typeof v !== "number" || !Number.isInteger(v))
        throw "musí být částka v haléřích (celé číslo)";
      return v;
    }
    case "date": {
      if (typeof v !== "string" || !ISO_DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))
        throw "musí být datum (RRRR-MM-DD)";
      return v;
    }
    case "select": {
      if (typeof v !== "string" || !def.options.choices?.some((c) => c.value === v))
        throw "není jednou z nabízených možností";
      return v;
    }
    case "multiselect": {
      if (!Array.isArray(v)) throw "musí být seznam možností";
      const values = [...new Set(v)];
      if (
        !values.every(
          (x) => typeof x === "string" && def.options.choices?.some((c) => c.value === x),
        )
      )
        throw "obsahuje nenabízenou možnost";
      return values;
    }
    case "user":
    case "record": {
      if (typeof v !== "string" || !UUID.test(v)) throw "musí odkazovat na záznam";
      return v.toLowerCase();
    }
    case "checkbox": {
      if (typeof v !== "boolean") throw "musí být ano/ne";
      return v;
    }
    case "url": {
      if (typeof v !== "string") throw "musí být adresa";
      try {
        const u = new URL(v.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") throw 0;
        return u.toString();
      } catch {
        throw "musí být platná adresa (http:// nebo https://)";
      }
    }
    case "phone": {
      if (typeof v !== "string") throw "musí být telefonní číslo";
      const digits = v.replace(/[\s().-]/g, "");
      if (!/^\+?[0-9]{9,15}$/.test(digits)) throw "není platné telefonní číslo";
      return digits;
    }
    case "email": {
      if (typeof v !== "string" || !EMAIL.test(v.trim())) throw "musí být platný e-mail";
      return v.trim().toLowerCase();
    }
  }
}

/**
 * Ověří hodnoty vlastních polí podle jejich definic a vrátí normalizovaný objekt do sloupce `custom`.
 * Prázdná hodnota pole odstraní. Neznámý klíč je chyba (překlep neprojde mlčky).
 * `partial: true` (úprava) nevyžaduje povinná pole, která v zadání nejsou.
 */
export function validateCustomValues(
  defs: readonly FieldDef[],
  values: Record<string, unknown>,
  opts: { partial?: boolean } = {},
): Record<string, unknown> {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: Record<string, unknown> = {};
  const problems: string[] = [];

  for (const key of Object.keys(values)) {
    const def = byKey.get(key);
    if (!def) {
      problems.push(`Neznámé pole „${key}“.`);
      continue;
    }
    const v = values[key];
    if (isEmpty(v)) continue;
    try {
      out[key] = normalizeValue(def, v);
    } catch (e) {
      if (typeof e !== "string") throw e;
      problems.push(`Pole „${def.label}“ ${e}.`);
    }
  }
  if (!opts.partial) {
    for (const def of defs)
      if (def.required && out[def.key] === undefined)
        problems.push(`Pole „${def.label}“ je povinné.`);
  } else {
    for (const def of defs)
      if (def.required && def.key in values && out[def.key] === undefined)
        problems.push(`Pole „${def.label}“ je povinné.`);
  }
  if (problems.length) throw new UserError(problems.join(" "));
  return out;
}
