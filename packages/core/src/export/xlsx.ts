import { zipChunks, type ZipEntry } from "./zip";

/**
 * Streamovaný zápis XLSX (OOXML) bez závislostí: řádky se serializují a komprimují postupně, takže export
 * velké tabulky nenačítá celou sadu do paměti. Texty jsou `inlineStr` (nikdy se nevyhodnotí jako vzorec),
 * čísla jsou čísla, data mají datový formát, peníze formát měny.
 */
export type XlsxColumnType = "text" | "number" | "money" | "date" | "percent" | "bool";

export type XlsxColumn = {
  header: string;
  type: XlsxColumnType;
  /** Šířka sloupce ve znacích (výchozí podle typu). */
  width?: number;
};

export type XlsxSheet = {
  /** Název listu (Excel: nejvýš 31 znaků, bez `[]:*?/\`). */
  name: string;
  columns: readonly XlsxColumn[];
  /**
   * Řádky; hodnoty podle typu sloupce: `text` řetězec, `number` číslo, `money` číslo v haléřích (zapíše se jako koruny
   * s formátem měny), `date` řetězec `YYYY-MM-DD` nebo `Date`, `percent` číslo v procentech (12,5 = 12,5 %), `bool` boolean.
   * `null` a `undefined` = prázdná buňka.
   */
  rows: AsyncIterable<readonly unknown[]> | Iterable<readonly unknown[]>;
  /** Řádek s popisem nad hlavičkou (období, filtr…); nepovinné. */
  title?: string;
  /** Řádek součtů pod daty: hodnoty podle sloupců (`money` v haléřích). */
  totals?: readonly unknown[];
};

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Styly (indexy `cellXfs`). */
const S = {
  general: 0,
  header: 1,
  money: 2,
  date: 3,
  percent: 4,
  title: 5,
  totalLabel: 6,
  totalMoney: 7,
};

const escapeXml = (s: string) =>
  s
    // znaky, které XML 1.0 nepřipouští, by Excelu zneplatnily celý soubor
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Číslo sloupce → písmeno (0 → A, 26 → AA). */
export function columnLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Datum → pořadové číslo dne v Excelu (1900 systém). Čas se zahodí. */
export function excelDate(v: string | Date): number | null {
  const iso = typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Math.round((Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

export function sheetName(raw: string, used: ReadonlySet<string>): string {
  const base =
    raw
      .replace(/[[\]:*?/\\]/g, " ")
      .trim()
      .slice(0, 31) || "List";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
  return name;
}

function cell(ref: string, type: XlsxColumnType, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  switch (type) {
    case "number":
    case "percent": {
      const n = Number(value);
      if (!Number.isFinite(n)) return "";
      // procenta jako skutečný zlomek s formátem „%“ (12,5 → 0,125), ať je zápis jednoznačný v Excelu i jinde
      return type === "percent"
        ? `<c r="${ref}" s="${S.percent}"><v>${Number((n / 100).toPrecision(12))}</v></c>`
        : `<c r="${ref}"><v>${n}</v></c>`;
    }
    case "money": {
      const n = Number(value);
      if (!Number.isFinite(n)) return "";
      // haléře → koruny; zaokrouhlení na 2 místa odstraní chybu plovoucí čárky (12345/100)
      return `<c r="${ref}" s="${S.money}"><v>${Math.round(n) / 100}</v></c>`;
    }
    case "date": {
      const d = excelDate(value as string | Date);
      return d === null
        ? textCell(ref, String(value))
        : `<c r="${ref}" s="${S.date}"><v>${d}</v></c>`;
    }
    case "bool":
      return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
    default:
      return textCell(ref, String(value));
  }
}

function textCell(ref: string, text: string, style?: number): string {
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

const defaultWidth: Record<XlsxColumnType, number> = {
  text: 24,
  number: 12,
  money: 16,
  date: 12,
  percent: 10,
  bool: 8,
};

async function* sheetXml(sheet: XlsxSheet): AsyncGenerator<string> {
  const cols = sheet.columns;
  const headerRow = sheet.title ? 2 : 1;
  yield `${XML}<worksheet ${NS}><sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>`;
  yield `<cols>${cols
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? defaultWidth[c.type]}" customWidth="1"/>`,
    )
    .join("")}</cols><sheetData>`;
  let r = 0;
  if (sheet.title) {
    r++;
    yield `<row r="${r}">${textCell(`A${r}`, sheet.title, S.title)}</row>`;
  }
  r++;
  yield `<row r="${r}">${cols.map((c, i) => textCell(`${columnLetter(i)}${r}`, c.header, S.header)).join("")}</row>`;
  let count = 0;
  for await (const row of sheet.rows as AsyncIterable<readonly unknown[]>) {
    r++;
    count++;
    let xml = `<row r="${r}">`;
    for (let i = 0; i < cols.length; i++)
      xml += cell(`${columnLetter(i)}${r}`, cols[i]!.type, row[i]);
    yield `${xml}</row>`;
  }
  if (sheet.totals) {
    r++;
    let xml = `<row r="${r}">`;
    sheet.totals.forEach((v, i) => {
      const c = cols[i];
      if (!c || v === null || v === undefined || v === "") return;
      const ref = `${columnLetter(i)}${r}`;
      xml +=
        c.type === "money"
          ? `<c r="${ref}" s="${S.totalMoney}"><v>${Math.round(Number(v)) / 100}</v></c>`
          : typeof v === "number"
            ? `<c r="${ref}" s="${S.totalLabel}"><v>${v}</v></c>`
            : textCell(ref, String(v), S.totalLabel);
    });
    yield `${xml}</row>`;
  }
  yield `</sheetData>`;
  if (count > 0)
    yield `<autoFilter ref="A${headerRow}:${columnLetter(cols.length - 1)}${headerRow + count}"/>`;
  yield `</worksheet>`;
}

const STYLES = `${XML}<styleSheet ${NS}>
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd\\.mm\\.yyyy"/><numFmt numFmtId="166" formatCode="0.00%"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEFF2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF9CA3AF"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="right"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Souborová struktura XLSX jako položky ZIP (jeden list = jeden soubor `sheetN.xml`, streamovaný). */
export function* xlsxEntries(sheets: readonly XlsxSheet[]): Generator<ZipEntry> {
  if (!sheets.length) throw new Error("Sešit musí mít aspoň jeden list.");
  const used = new Set<string>();
  const names = sheets.map((s) => {
    const n = sheetName(s.name, used);
    used.add(n.toLowerCase());
    return n;
  });
  yield {
    name: "[Content_Types].xml",
    data: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("")}</Types>`,
  };
  yield {
    name: "_rels/.rels",
    data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  };
  yield {
    name: "xl/workbook.xml",
    data: `${XML}<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  };
  yield {
    name: "xl/_rels/workbook.xml.rels",
    data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join(
        "",
      )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  };
  yield { name: "xl/styles.xml", data: STYLES };
  for (let i = 0; i < sheets.length; i++)
    yield { name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheets[i]!) };
}

/** XLSX po částech (pro stream odpovědi). */
export function xlsxChunks(sheets: readonly XlsxSheet[]): AsyncGenerator<Buffer> {
  return zipChunks(xlsxEntries(sheets));
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
