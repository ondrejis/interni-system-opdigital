import path from "node:path";
import type { NextConfig } from "next";

/**
 * Image se staví per klient: `CLIENT=<slug>` vybere složku v `clients/`, ze které se
 * do aplikace vkompiluje konfigurace a rozšíření (ADR 001). Za běhu už se klient nemění.
 */
const client = process.env.CLIENT ?? "demo";
const root = path.resolve(import.meta.dirname, "../..");
const config = path.join(root, "clients", client, "config.ts");
const extensions = path.join(root, "clients", client, "extensions", "index.ts");

const nextConfig: NextConfig = {
  // vlastní složka sestavení (např. měření velikosti JS, aby se nepletlo do běžícího vývojového serveru)
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // plovoucí odznak vývojového serveru překrývá první položku spodní navigace na telefonu (chyby se hlásí dál)
  devIndicators: false,
  // Workspace balíčky se kompilují ze zdroje (TypeScript), ne z buildu.
  transpilePackages: [
    "@rebar/core",
    "@rebar/ui",
    "@rebar/kontakty",
    "@rebar/poptavky",
    "@rebar/zakazky",
    "@rebar/realizace",
    "@rebar/fakturace",
    "@rebar/dochazka",
    "@rebar/sklad",
    "@rebar/stroje",
    "@rebar/kalendar",
  ],
  outputFileTracingRoot: root,
  // Písma pro PDF se v kódu nikde neimportují, takže je trasování samo nenajde.
  outputFileTracingIncludes: {
    "/api/**": ["../../node_modules/.pnpm/pdfmake@*/node_modules/pdfmake/fonts/Roboto/*.ttf"],
  },
  // Balíčky s nativními částmi nebo vlastním připojením se do bundlu nebalí.
  serverExternalPackages: [
    "@node-rs/argon2",
    "sharp",
    "pg-boss",
    "postgres",
    "@sentry/node",
    "nodemailer",
    "pdfmake",
  ],
  env: { NEXT_PUBLIC_BUILT_FOR_CLIENT: client },
  turbopack: {
    root,
    // Turbopack bere aliasy relativně k adresáři aplikace, webpack absolutně.
    resolveAlias: {
      "@client/config": `../../clients/${client}/config.ts`,
      "@client/extensions": `../../clients/${client}/extensions/index.ts`,
    },
  },
  webpack(webpackConfig) {
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      "@client/config": config,
      "@client/extensions": extensions,
    };
    return webpackConfig;
  },
};

export default nextConfig;
