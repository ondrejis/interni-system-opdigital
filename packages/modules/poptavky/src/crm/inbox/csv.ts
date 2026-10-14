/**
 * Import poptávek z CSV: čistá logika bez závislostí na serveru ani prohlížeči (běží na obou stranách).
 * Parser zvládne Excel (středník, BOM), uvozovky s odřádkováním i čárku nebo tabulátor jako oddělovač.
 */

/** Pole poptávky, do kterých jde sloupec CSV namapovat. */
export const IMPORT_FIELDS = [
  {
    key: "name",
    label: "Jméno kontaktu",
    aliases: ["jmeno", "jmeno kontaktu", "name", "kontakt", "osoba", "prijmeni"],
  },
  { key: "email", label: "E-mail", aliases: ["email", "e-mail", "mail", "e mail"] },
  { key: "phone", label: "Telefon", aliases: ["telefon", "tel", "phone", "mobil", "gsm"] },
  {
    key: "company",
    label: "Firma",
    aliases: ["firma", "company", "spolecnost", "organizace", "nazev firmy"],
  },
  {
    key: "title",
    label: "Název poptávky",
    aliases: ["nazev", "title", "predmet", "poptavka", "nazev poptavky"],
  },
  {
    key: "message",
    label: "Zpráva",
    aliases: ["zprava", "message", "poznamka", "popis", "text", "dotaz"],
  },
  { key: "source", label: "Zdroj", aliases: ["zdroj", "source"] },
  {
    key: "sourceChannel",
    label: "Kanál",
    aliases: ["kanal", "channel", "utm source", "utm_source", "medium"],
  },
  {
    key: "campaign",
    label: "Kampaň",
    aliases: ["kampan", "campaign", "utm campaign", "utm_campaign"],
  },
  {
    key: "value",
    label: "Odhad hodnoty (Kč)",
    aliases: ["hodnota", "odhad", "odhad hodnoty", "castka", "cena", "value"],
  },
] as const;
/** Klíč pole poptávky, do kterého se mapuje sloupec CSV. */
export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];

/** Největší soubor a počet řádků, které import přijme. */
export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_MAX_ROWS = 500;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Rozpozná oddělovač podle první řádky (mimo uvozovky): středník, čárka nebo tabulátor. */
export function detectDelimiter(text: string): ";" | "," | "\t" {
  const head = text.split(/\r?\n/, 1)[0] ?? "";
  let inQuotes = false;
  const count: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of head) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in count) count[ch]! += 1;
  }
  if (count[";"]! >= count[","]! && count[";"]! >= count["\t"]! && count[";"]! > 0) return ";";
  if (count["\t"]! > count[","]!) return "\t";
  return ",";
}

/** Rozdělí CSV na řádky a buňky (RFC 4180: uvozovky, zdvojené uvozovky, odřádkování v buňce). Prázdné řádky přeskočí. */
export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") inQuotes = true;
    else if (ch === d) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Navrhne mapování sloupců podle názvů v záhlaví (bez diakritiky, velikosti písmen a rozdílu mezera/podtržítko). */
export function guessMapping(headers: readonly string[]): (ImportFieldKey | null)[] {
  const used = new Set<ImportFieldKey>();
  return headers.map((h) => {
    const f = fold(h).replace(/[_-]+/g, " ");
    const hit = IMPORT_FIELDS.find(
      (field) =>
        !used.has(field.key) &&
        (fold(field.label) === f || field.aliases.some((a) => a.replace(/[_-]+/g, " ") === f)),
    );
    if (hit) used.add(hit.key);
    return hit?.key ?? null;
  });
}

/**
 * Ochrana před CSV injection: buňka začínající `=`, `+`, `-`, `@`, tabulátorem nebo CR by se po exportu a otevření v Excelu
 * vyhodnotila jako vzorec. Taková hodnota dostane apostrof. Telefon (`+420…`) a číslo (`-5`) se nezkracují, ale projdou
 * vlastní kontrolou tvaru; sem patří jen volný text.
 */
export function defuseCell(v: string): string {
  const s = stripControlChars(v).trim();
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Odstraní řídicí znaky; odřádkování a tabulátor nechá jen s `keepWhitespace`. */
export function stripControlChars(v: string, keepWhitespace = true): string {
  let out = "";
  for (const ch of v) {
    const c = ch.charCodeAt(0);
    const control = c < 32 || c === 127;
    if (!control || (keepWhitespace && (c === 9 || c === 10 || c === 13))) out += ch;
  }
  return out;
}

/** Částka z textu („150 000“, „150000,50 Kč“, „1.200.000“) v haléřích; neplatné nebo záporné `null`. */
export function parseMoneyMinor(v: string): number | null {
  const s = v.replace(/kč|czk|,-|\s/gi, "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  // poslední oddělovač se dvěma číslicemi za ním je desetinný; ostatní jsou oddělovače tisíců
  const m = s.match(/^(.*?)[.,](\d{1,2})$/);
  const whole = (m ? m[1]! : s).replace(/[.,]/g, "");
  const frac = m ? m[2]!.padEnd(2, "0") : "00";
  if (!/^\d+$/.test(whole)) return null;
  const n = Number(whole) * 100 + Number(frac);
  return Number.isSafeInteger(n) ? n : null;
}

/** Povolený tvar telefonu v importu: číslice, mezery, plus a běžná interpunkce. */
export const PHONE_RE = /^[+()\d][\d\s()./-]{4,}$/;
