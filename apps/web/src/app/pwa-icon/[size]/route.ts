import sharp from "sharp";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/** Velikosti ikony; `maskable` = 512 px s písmenem v bezpečné zóně (Android ji ořízne do kruhu nebo „squircle“). */
const SIZES: Record<string, { px: number; maskable: boolean }> = {
  "180": { px: 180, maskable: false }, // apple-touch-icon
  "192": { px: 192, maskable: false },
  "512": { px: 512, maskable: false },
  maskable: { px: 512, maskable: true },
};

/** Ikona aplikace pro telefon: barva a první písmeno názvu z nastavení klienta (v OPSYS „O“; bez nahraných souborů). */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const spec = SIZES[(await params).size];
  if (!spec) return new Response("Nenalezeno.", { status: 404 });
  const brand = await getServices().getBranding();
  const letter = (brand.name.trim()[0] ?? "S").toUpperCase().replace(/[<>&"']/g, "S");
  const color = /^#[0-9a-f]{6}$/i.test(brand.accentColor) ? brand.accentColor : "#2563eb";
  // maskable: celé pozadí plné barvy (okraje ořízne systém), písmeno menší, aby zůstalo v 80% bezpečné zóně
  const radius = spec.maskable ? 0 : 22;
  const font = spec.maskable ? 42 : 58;
  const y = spec.maskable ? 64 : 68;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.px}" height="${spec.px}" viewBox="0 0 100 100"><rect width="100" height="100" rx="${radius}" fill="${color}"/><text x="50" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${font}" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
  });
}
