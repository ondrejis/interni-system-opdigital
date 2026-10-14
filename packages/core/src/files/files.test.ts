import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { UserError } from "../rbac/errors";
import { normalizeImage, makeThumbnail } from "./images";
import { LocalDiskStorage, storageKey } from "./storage";
import { contentDisposition, detectFile, sanitizeFileName } from "./validate";

const png = () =>
  sharp({ create: { width: 10, height: 10, channels: 3, background: "#336699" } })
    .png()
    .toBuffer();
const jpeg = () =>
  sharp({ create: { width: 10, height: 10, channels: 3, background: "#336699" } })
    .jpeg()
    .toBuffer();

describe("detectFile", () => {
  it("pozná typ podle obsahu a ověří příponu", async () => {
    expect(detectFile("foto.PNG", await png())).toEqual({
      mime: "image/png",
      kind: "image",
      ext: "png",
    });
    expect(detectFile("foto.jpeg", await jpeg())).toMatchObject({ mime: "image/jpeg", ext: "jpg" });
    expect(detectFile("smlouva.pdf", Buffer.from("%PDF-1.7\n..."))).toMatchObject({
      mime: "application/pdf",
      kind: "document",
    });
    expect(detectFile("export.csv", Buffer.from("a;b\n1;2\n", "utf8"))).toMatchObject({
      mime: "text/csv",
    });
    expect(
      detectFile("tabulka.xlsx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])),
    ).toMatchObject({ kind: "document", ext: "xlsx" });
  });

  it("odmítne příponu, která neodpovídá obsahu (jpg s PDF uvnitř i naopak)", async () => {
    expect(() => detectFile("foto.jpg", Buffer.from("%PDF-1.7"))).toThrow(/neodpovídá/);
    expect(() => detectFile("dokument.pdf", await0(png))).toThrow(/neodpovídá/);
  });

  it("odmítne SVG, HTML, skripty, archivy a binární „text“", () => {
    expect(() => detectFile("logo.svg", Buffer.from("<svg onload=alert(1)></svg>"))).toThrow(
      UserError,
    );
    expect(() => detectFile("index.html", Buffer.from("<script>alert(1)</script>"))).toThrow(
      UserError,
    );
    expect(() => detectFile("run.exe", Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toThrow(UserError);
    expect(() => detectFile("a.zip", Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toThrow(/Archivy/);
    expect(() => detectFile("a.txt", Buffer.from([0x61, 0x00, 0x62]))).toThrow(/neodpovídá/);
  });

  it("odmítne prázdný a příliš velký soubor", () => {
    expect(() => detectFile("a.txt", Buffer.alloc(0))).toThrow(/prázdný/);
    expect(() =>
      detectFile("a.pdf", Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(26 * 1024 * 1024)])),
    ).toThrow(/příliš velký/);
  });
});

// pomocník: synchronní Buffer z PNG signatury (stačí pro rozpoznání)
function await0(_f: unknown) {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

describe("názvy souborů", () => {
  it("odstraní cestu, řídicí znaky a tečky na začátku", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\x\\foto.jpg")).toBe("foto.jpg");
    expect(sanitizeFileName("..skryte")).toBe("skryte");
    expect(sanitizeFileName("a\u0000b<c>.pdf")).toBe("abc.pdf");
    expect(sanitizeFileName("")).toBe("soubor");
    expect(sanitizeFileName("x".repeat(300) + ".pdf").length).toBeLessThanOrEqual(150);
  });

  it("Content-Disposition nese český název přes RFC 5987 a neprodukuje vkládání hlaviček", () => {
    const h = contentDisposition('Předávací protokol "A".pdf', true);
    expect(h).toContain("inline;");
    expect(h).toContain("filename*=UTF-8''P%C5%99ed%C3%A1vac%C3%AD%20protokol%20A.pdf");
    expect(h).not.toMatch(/[\r\n]/);
    expect(contentDisposition("a.pdf", false)).toContain("attachment;");
  });
});

describe("obrázky", () => {
  it("zmenší velkou fotku na 2560 px a natočí podle EXIF", async () => {
    const big = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: "#aa5500" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await normalizeImage(big, "image/jpeg");
    expect(out.height).toBe(2560); // po natočení je delší strana svislá
    expect(out.width).toBe(853);
    const meta = await sharp(out.data).metadata();
    expect(meta.orientation).toBeUndefined();
  });

  it("odstraní metadata včetně polohy", async () => {
    const withGps = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#000" },
    })
      .jpeg()
      .withExif({
        IFD0: { Copyright: "tajne" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 0/1 0/1" },
      })
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const out = await normalizeImage(withGps, "image/jpeg");
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
  });

  it("malý obrázek nezvětšuje; náhled má nejvýš 320 px a je WebP", async () => {
    const out = await normalizeImage(await png(), "image/png");
    expect([out.width, out.height]).toEqual([10, 10]);
    const big = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const thumb = await makeThumbnail(big);
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBe(320);
  });
});

describe("LocalDiskStorage", () => {
  const withRoot = async () =>
    new LocalDiskStorage(await fs.mkdtemp(path.join(os.tmpdir(), "files-")));

  it("uloží, přečte a smaže soubor", async () => {
    const s = await withRoot();
    await s.put("ab/cd/soubor", Buffer.from("obsah"));
    expect(await s.exists("ab/cd/soubor")).toBe(true);
    const chunks: Buffer[] = [];
    for await (const c of await s.get("ab/cd/soubor")) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("obsah");
    await s.delete("ab/cd/soubor");
    expect(await s.exists("ab/cd/soubor")).toBe(false);
  });

  it("odmítne klíče vedoucí mimo úložiště a neumožní přepsání", async () => {
    const s = await withRoot();
    for (const key of ["../ven", "ab/../../ven", "/etc/passwd", "ab//cd", "A/B", ""]) {
      await expect(s.put(key, Buffer.from("x"))).rejects.toThrow(/Neplatný klíč/);
    }
    await s.put("ab/jedna", Buffer.from("1"));
    await expect(s.put("ab/jedna", Buffer.from("2"))).rejects.toThrow(); // flag wx
  });

  it("soubory mají práva jen pro vlastníka a úložiště nejde zřídit ve veřejné složce", async () => {
    const s = await withRoot();
    await s.put("ab/prava", Buffer.from("x"));
    const root = (s as unknown as { root: string }).root;
    expect((await fs.stat(path.join(root, "ab/prava"))).mode & 0o777).toBe(0o600);
    expect(() => new LocalDiskStorage(path.join(process.cwd(), "public", "soubory"))).toThrow(
      /veřejné složce/,
    );
  });

  it("storageKey rozdělí id do podsložek", () => {
    expect(storageKey("0198f0c0-1111-7222-8333-444455556666")).toBe(
      "01/98/0198f0c0-1111-7222-8333-444455556666",
    );
    expect(storageKey("0198f0c0-1111-7222-8333-444455556666", ".thumb")).toMatch(/\.thumb$/);
  });
});
