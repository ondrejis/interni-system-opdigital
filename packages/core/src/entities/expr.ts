import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { AttributeDef } from "./types";

/** SQL výrazy jedné hodnoty atributu v různých typových podobách (podle toho, jak se porovnává). */
export type Exprs = {
  /** Hodnota jako text (nebo NULL). */
  text: SQL;
  /** Číslo (NULL, když hodnota není číslo — ochrana proti poškozeným datům). */
  num: SQL;
  date: SQL;
  /** Surová hodnota data / okamžiku pro řazení (u sloupce s časem zachová pořadí v rámci dne). */
  sort: SQL;
  bool: SQL;
  /** Pole textů (`text[]` nebo jsonb pole převedené na text[]). */
  array: SQL;
  arrayLength: SQL;
};

/**
 * Převod atributu na SQL výrazy. Nativní atributy jsou sloupce tabulky, vlastní pole jsou klíče ve
 * sloupci `custom` (jsonb). Nikdy se do SQL nevkládá uživatelský text — klíč se předává jako parametr.
 */
export function makeExprs(
  attr: AttributeDef,
  columns: Record<string, AnyPgColumn>,
  customColumn: AnyPgColumn | undefined,
): Exprs {
  if (attr.custom) {
    if (!customColumn) throw new Error("Entita nemá sloupec pro vlastní pole.");
    // Klíč vlastního pole je omezený na [a-z][a-z0-9_]{1,40} (viz definice polí), proto ho lze vložit jako literál.
    // Literál (ne parametr) je nutný, aby PostgreSQL poznal shodu výrazu v SELECT a GROUP BY.
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(attr.key))
      throw new Error(`Neplatný klíč vlastního pole: ${attr.key}`);
    const k = sql.raw(`'${attr.key}'`);
    const raw = sql`(${customColumn} ->> ${k})`;
    const json = sql`(${customColumn} -> ${k})`;
    return {
      text: raw,
      num: sql`(case when ${raw} ~ '^-?[0-9]+(\\.[0-9]+)?$' then ${raw}::numeric end)`,
      date: sql`(case when ${raw} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then ${raw}::date end)`,
      sort: sql`(case when ${raw} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then ${raw}::date end)`,
      bool: sql`(case when ${raw} in ('true', 'false') then ${raw}::boolean end)`,
      array: sql`(select coalesce(array_agg(e), '{}'::text[]) from jsonb_array_elements_text(case when jsonb_typeof(${json}) = 'array' then ${json} else '[]'::jsonb end) e)`,
      arrayLength: sql`(case when jsonb_typeof(${json}) = 'array' then jsonb_array_length(${json}) end)`,
    };
  }
  const col = attr.field ? columns[attr.field] : undefined;
  if (!col) throw new Error(`Atribut „${attr.key}“ nemá sloupec „${attr.field}“.`);
  // Datumový atribut nad sloupcem s časem (`timestamptz`) se porovnává a seskupuje podle místního dne v České republice:
  // 31. 10. 23:30 místního času je ještě říjen, i když v UTC je to už listopad (a přes přechod letního času se den neposune).
  const isTimestamp = /Timestamp/.test((col as { columnType?: string }).columnType ?? "");
  return {
    text: sql`(${col}::text)`,
    num: sql`(${col})`,
    date: isTimestamp ? sql`((${col} at time zone 'Europe/Prague')::date)` : sql`(${col})`,
    sort: sql`(${col})`,
    bool: sql`(${col})`,
    array: sql`(${col})`,
    arrayLength: sql`cardinality(${col})`,
  };
}
