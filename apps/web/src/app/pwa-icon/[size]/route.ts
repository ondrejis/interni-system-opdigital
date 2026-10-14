import sharp from "sharp";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

const SIZES = new Set([192, 512]);

/** Ikona aplikace pro telefon: barva a první písmeno názvu z nastavení klienta (bez nahraných souborů). */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Nenalezeno.", { status: 404 });
  const brand = await getServices().getBranding();
  const letter = (brand.name.trim()[0] ?? "S").toUpperCase().replace(/[<>&"']/g, "S");
  const color = /^#[0-9a-f]{6}$/i.test(brand.accentColor) ? brand.accentColor : "#2563eb";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${color}"/><text x="50" y="68" font-family="Helvetica, Arial, sans-serif" font-size="58" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
  });
}
