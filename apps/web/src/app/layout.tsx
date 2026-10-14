import { brandStyle, themeScript } from "@rebar/ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { getServices } from "@/server/services";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getServices().getBranding();
  return { title: { default: name, template: `%s · ${name}` }, applicationName: name };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { accentColor } = await getServices().getBranding();
  return (
    <html lang="cs" style={brandStyle(accentColor)} suppressHydrationWarning>
      {/* Bez vlastního <head>: ruční <head> s inline skriptem v kořenovém layoutu způsoboval při prvním načtení trasy po startu
          serveru chybu hydratace (React #418, ~70 % prvních načtení). Skript motivu proto běží hned na začátku <body>. */}
      <body className="bg-bg text-fg antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
