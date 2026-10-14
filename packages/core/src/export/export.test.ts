import { inflateRawSync, crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { csvLines, csvSafeText } from "./csv";
import { columnLetter, excelDate, sheetName, xlsxChunks } from "./xlsx";
import { zipChunks, zipToBuffer } from "./zip";

/** Rozbalí ZIP podle centrálního adresáře (ověřuje i CRC a velikosti, tedy že datové popisy sedí). */
function unzip(buf: Buffer): Map<string, Buffer> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(-1);
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const crc = buf.readUInt32LE(p + 16);
    const comp = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    expect(buf.readUInt32LE(offset)).toBe(0x04034b50);
    const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const data = inflateRawSync(buf.subarray(start, start + comp));
    expect(data.length).toBe(size);
    expect(crc32(data) >>> 0).toBe(crc);
    out.set(name, data);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

describe("zip", () => {
  it("zapíše a znovu přečte položky včetně češtiny v názvu a velkých dat", async () => {
    const big = Buffer.alloc(300_000, "abc");
    const zip = await zipToBuffer([
      { name: "faktury/FV-2026-0001.pdf", data: Buffer.from("%PDF-1.4 test") },
      { name: "přehled.csv", data: "a;b\r\n1;2\r\n" },
      { name: "velke.bin", data: big },
      { name: "prazdny.txt", data: "" },
    ]);
    const files = unzip(zip);
    expect([...files.keys()]).toEqual([
      "faktury/FV-2026-0001.pdf",
      "přehled.csv",
      "velke.bin",
      "prazdny.txt",
    ]);
    expect(files.get("přehled.csv")!.toString()).toBe("a;b\r\n1;2\r\n");
    expect(files.get("velke.bin")!.equals(big)).toBe(true);
    expect(files.get("prazdny.txt")!.length).toBe(0);
  });

  it("streamuje data z asynchronního generátoru bez předchozího načtení", async () => {
    async function* gen() {
      for (let i = 0; i < 1000; i++) yield `řádek ${i}\n`;
    }
    const files = unzip(await zipToBuffer([{ name: "x.txt", data: gen() }]));
    expect(files.get("x.txt")!.toString().split("\n")).toHaveLength(1001);
  });

  it("odmítne názvy mířící mimo archiv", async () => {
    await expect(zipToBuffer([{ name: "../x", data: "a" }])).rejects.toThrow(/Neplatný název/);
    await expect(zipToBuffer([{ name: "/x", data: "a" }])).rejects.toThrow(/Neplatný název/);
  });

  it("zipChunks vrací po částech", async () => {
    let n = 0;
    for await (const _c of zipChunks([{ name: "a", data: "a" }])) n++;
    expect(n).toBeGreaterThan(2);
  });
});

describe("xlsx", () => {
  it("sloupce, data a čísla", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(701)).toBe("ZZ");
    expect(columnLetter(702)).toBe("AAA");
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("2026-10-09")).toBe(46_304);
    expect(excelDate("špatně")).toBeNull();
    expect(sheetName("Faktury: [vydané]/přijaté", new Set())).toBe("Faktury   vydané  přijaté");
    expect(sheetName("A", new Set(["a"]))).toBe("A 2");
    expect(sheetName("x".repeat(40), new Set())).toHaveLength(31);
  });

  it("peníze jsou čísla v korunách s formátem, data jsou datová, texty se nikdy nevyhodnotí jako vzorec", async () => {
    async function* rows() {
      yield ["=1+1", 12_345_67, "2026-10-09", 12.5, true, null];
      yield ["A & B <c>", -50, new Date("2026-01-31T10:00:00Z"), 0, false, "x"];
    }
    const parts: Buffer[] = [];
    for await (const c of xlsxChunks([
      {
        name: "Test",
        title: "Titulek",
        columns: [
          { header: "Text", type: "text" },
          { header: "Částka", type: "money" },
          { header: "Datum", type: "date" },
          { header: "Podíl", type: "percent" },
          { header: "Ano", type: "bool" },
          { header: "Prázdné", type: "text" },
        ],
        rows: rows(),
        totals: ["Celkem", 12_295_67],
      },
    ]))
      parts.push(c);
    const files = unzip(Buffer.concat(parts));
    expect([...files.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    const sheet = files.get("xl/worksheets/sheet1.xml")!.toString();
    // vzorec v textu zůstává textem
    expect(sheet).toContain(
      '<c r="A3" t="inlineStr"><is><t xml:space="preserve">=1+1</t></is></c>',
    );
    expect(sheet).toContain("A &amp; B &lt;c&gt;");
    // peníze: haléře → koruny
    expect(sheet).toContain('<c r="B3" s="2"><v>12345.67</v></c>');
    expect(sheet).toContain('<c r="B4" s="2"><v>-0.5</v></c>');
    // data
    expect(sheet).toContain('<c r="C3" s="3"><v>46304</v></c>');
    expect(sheet).toContain('<c r="D3" s="4"><v>0.125</v></c>');
    expect(sheet).toContain('<c r="E3" t="b"><v>1</v></c>');
    expect(sheet).toContain('<autoFilter ref="A2:F4"/>');
    expect(sheet).toContain('<pane ySplit="2"');
    // řádek součtů
    expect(sheet).toContain('<c r="B5" s="7"><v>12295.67</v></c>');
    // dobře utvářené XML (každý otevřený prvek je zavřený)
    for (const [name, data] of files) {
      if (name.endsWith(".xml") || name.endsWith(".rels")) {
        const x = data.toString();
        expect(x.startsWith("<?xml")).toBe(true);
        const stack: string[] = [];
        for (const m of x.matchAll(/<(\/?)([\w:]+)([^>]*?)(\/?)>/g)) {
          if (m[4]) continue; // samozavřený prvek
          if (m[1]) expect(stack.pop(), name).toBe(m[2]);
          else stack.push(m[2]!);
        }
        expect(stack, name).toEqual([]);
      }
    }
  });

  it("zahodí znaky, které XML nepřipouští", async () => {
    const parts: Buffer[] = [];
    for await (const c of xlsxChunks([
      { name: "T", columns: [{ header: "H\u0001", type: "text" }], rows: [["a\u0000b\u000Bc"]] },
    ]))
      parts.push(c);
    const sheet = unzip(Buffer.concat(parts)).get("xl/worksheets/sheet1.xml")!.toString();
    expect(sheet).toContain(">abc<");
    expect(sheet).toContain(">H<");
  });
});

describe("csv", () => {
  it("neutralizuje vzorce jen u textů a escapuje oddělovače", async () => {
    expect(csvSafeText("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvSafeText("+420 123")).toBe("'+420 123");
    expect(csvSafeText("@x")).toBe("'@x");
    expect(csvSafeText("Novák")).toBe("Novák");
    const parts: Buffer[] = [];
    for await (const c of csvLines(["A", "B"], [['x;"y"', "1,50"]])) parts.push(c);
    const text = Buffer.concat(parts).toString("utf8");
    expect(text.startsWith("﻿A;B\r\n")).toBe(true);
    expect(text).toContain('"x;""y""";1,50\r\n');
  });
});
