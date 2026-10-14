import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * Manifest aplikace „terminál“: po instalaci na plochu se otevře rovnou terminál (`/t`), ne kancelářské rozhraní.
 * Název a barva jsou z nastavení klienta; hlavní manifest aplikace zůstává beze změny.
 */
export async function GET() {
  const brand = await getServices().getBranding();
  const body = {
    name: `${brand.name} – terminál`,
    short_name: brand.name.length > 12 ? brand.name.slice(0, 12) : brand.name,
    id: "/t",
    start_url: "/t",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "cs",
    background_color: "#ffffff",
    theme_color: /^#[0-9a-f]{6}$/i.test(brand.accentColor) ? brand.accentColor : "#2563eb",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
