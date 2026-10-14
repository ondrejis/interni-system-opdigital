import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

/**
 * Generování PDF (pdfmake, čistý JS, bez prohlížeče — vejde se do 1 vCPU / 4 GB). Písmo Roboto s českou diakritikou
 * je součástí balíčku pdfmake. Přístup k souborům a síti je zakázaný, takže definice dokumentu (včetně textů od
 * uživatelů) nemůže načíst cizí soubor ani URL. Adresář s písmy lze přepsat proměnnou `PDF_FONTS_DIR` (image bez
 * zdrojových cest).
 */

type PdfMake = {
  setFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(fn: (url: string) => boolean): void;
  setLocalAccessPolicy(fn: (path: string) => boolean): void;
  createPdf(def: TDocumentDefinitions): { getBuffer(): Promise<Buffer> };
};

let lib: PdfMake | undefined;

/**
 * Kde jsou písma: 1) `PDF_FONTS_DIR`, 2) balíček pdfmake vedle zdrojů (vývoj, testy), 3) nahoru od pracovní složky
 * (standalone build, kde zdrojové cesty už neexistují a pdfmake leží v `node_modules/.pnpm`).
 */
function fontsDir(): string {
  if (process.env.PDF_FONTS_DIR) return path.resolve(process.env.PDF_FONTS_DIR);
  try {
    const require = createRequire(import.meta.url);
    const dir = path.join(path.dirname(require.resolve("pdfmake/package.json")), "fonts", "Roboto");
    if (fs.existsSync(path.join(dir, "Roboto-Regular.ttf"))) return dir;
  } catch {
    /* zkusíme další místa */
  }
  for (let base = process.cwd(), i = 0; i < 7; base = path.dirname(base), i++) {
    const direct = path.join(base, "node_modules", "pdfmake", "fonts", "Roboto");
    if (fs.existsSync(path.join(direct, "Roboto-Regular.ttf"))) return direct;
    const pnpm = path.join(base, "node_modules", ".pnpm");
    if (fs.existsSync(pnpm)) {
      const hit = fs.readdirSync(pnpm).find((d) => d.startsWith("pdfmake@"));
      const dir = hit && path.join(pnpm, hit, "node_modules", "pdfmake", "fonts", "Roboto");
      if (dir && fs.existsSync(path.join(dir, "Roboto-Regular.ttf"))) return dir;
    }
  }
  throw new Error(
    "Nenašel jsem písma pro PDF. Nastavte PDF_FONTS_DIR na složku s Roboto-Regular.ttf.",
  );
}

function pdfmake(): PdfMake {
  if (lib) return lib;
  const require = createRequire(import.meta.url);
  const pm = require("pdfmake") as PdfMake;
  const dir = fontsDir();
  pm.setUrlAccessPolicy(() => false);
  pm.setLocalAccessPolicy((p) => path.resolve(p).startsWith(dir + path.sep));
  pm.setFonts({
    Roboto: {
      normal: path.join(dir, "Roboto-Regular.ttf"),
      bold: path.join(dir, "Roboto-Medium.ttf"),
      italics: path.join(dir, "Roboto-Italic.ttf"),
      bolditalics: path.join(dir, "Roboto-MediumItalic.ttf"),
    },
  });
  lib = pm;
  return pm;
}

/** Vykreslí definici dokumentu do PDF (A4, Roboto 9,5 pt, pokud definice neřekne jinak). */
export async function renderPdf(def: TDocumentDefinitions): Promise<Buffer> {
  return pdfmake()
    .createPdf({
      pageSize: "A4",
      pageMargins: [40, 40, 40, 50],
      ...def,
      defaultStyle: { font: "Roboto", fontSize: 9.5, ...def.defaultStyle },
    })
    .getBuffer();
}
