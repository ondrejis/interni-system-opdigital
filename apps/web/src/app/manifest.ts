import type { MetadataRoute } from "next";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/** Aplikace jde přidat na plochu telefonu; název a barva z nastavení klienta. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getServices().getBranding();
  return {
    name: brand.name,
    short_name: brand.name.length > 12 ? brand.name.slice(0, 12) : brand.name,
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "cs",
    background_color: "#ffffff",
    theme_color: /^#[0-9a-f]{6}$/i.test(brand.accentColor) ? brand.accentColor : "#2563eb",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
