/**
 * CSV pro Excel: výchozí je středník (česká verze Excelu), UTF-8 s BOM, řádky CRLF. Klient může v konfiguraci zvolit
 * čárku (anglická verze Excelu, import do jiných systémů); s čárkou jako oddělovačem se desetinná čárka v číslech mění
 * na tečku, aby se sloupce nerozbily. Excel buňku začínající `=`, `+`, `-`, `@` (nebo tabulátorem / návratem vozíku)
 * vyhodnotí jako vzorec (CSV injection), proto se textům takové znaky neutralizují apostrofem (čísla se nepřepisují).
 */
export type CsvDelimiter = ";" | ",";

export type CsvFormat = {
  delimiter: CsvDelimiter;
};

export const DEFAULT_CSV_FORMAT: CsvFormat = { delimiter: ";" };

export function csvSafeText(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function csvCell(v: string, delimiter: CsvDelimiter = ";"): string {
  return v.includes(delimiter) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Číslo pro CSV: desetinná čárka při oddělovači `;`, tečka při `,`. */
export function csvNumber(n: number, format: CsvFormat = DEFAULT_CSV_FORMAT): string {
  const s = String(n);
  return format.delimiter === ";" ? s.replace(".", ",") : s;
}

/** Částka z haléřů na koruny se dvěma desetinnými místy (`12345` → `123,45`, nebo `123.45`). */
export function csvMoney(minor: number, format: CsvFormat = DEFAULT_CSV_FORMAT): string {
  const s = (Math.round(minor) / 100).toFixed(2);
  return format.delimiter === ";" ? s.replace(".", ",") : s;
}

/** CSV po částech (hlavička a řádky už jako řetězce; zabezpečení vzorců je na volajícím). */
export async function* csvLines(
  header: readonly string[],
  rows: AsyncIterable<readonly string[]> | Iterable<readonly string[]>,
  format: CsvFormat = DEFAULT_CSV_FORMAT,
): AsyncGenerator<Buffer> {
  const d = format.delimiter;
  yield Buffer.from("﻿" + header.map((h) => csvCell(csvSafeText(h), d)).join(d) + "\r\n", "utf8");
  let batch: string[] = [];
  for await (const row of rows as AsyncIterable<readonly string[]>) {
    batch.push(row.map((c) => csvCell(c, d)).join(d));
    if (batch.length >= 500) {
      yield Buffer.from(batch.join("\r\n") + "\r\n", "utf8");
      batch = [];
    }
  }
  if (batch.length) yield Buffer.from(batch.join("\r\n") + "\r\n", "utf8");
}
