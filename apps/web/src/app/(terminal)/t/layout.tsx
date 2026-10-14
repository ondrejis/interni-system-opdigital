import { getAccount } from "@rebar/core/auth";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { requireCtx } from "@/server/request";
import { getServices } from "@/server/services";
import { getTerminalState } from "@/server/terminal";
import { TerminalFrame } from "./terminal-frame";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  manifest: "/t/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default" },
  other: { "mobile-web-app-capable": "yes" },
};
export const viewport: Viewport = { viewportFit: "cover", width: "device-width", initialScale: 1 };

/**
 * Mobilní terminál řemeslníka: samostatný rám (jiná navigace než kancelář), nahoře stav fronty zápisů, dole nejvýš pět
 * položek. Smí do něj každý přihlášený; co v něm uvidí, určují zapnuté moduly, oprávnění role a nastavení klienta.
 */
export default async function TerminalLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx({ allowTerminalOnly: true });
  const state = await getTerminalState(ctx);
  if (!state.config.enabled) notFound();
  const { runtime, registry, getBranding } = getServices();
  const [account, branding] = await Promise.all([getAccount(ctx), getBranding()]);
  return (
    <TerminalFrame
      brand={{
        name: branding.name,
        logoUrl: branding.logoFileId ? `/api/files/${branding.logoFileId}` : null,
      }}
      user={{ id: account.id, name: account.name, roleName: account.roleName }}
      terminalOnly={state.terminalOnly}
      bottom={state.bottom.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
      enabledModules={runtime.modules.map((m) => m.id)}
      permissions={[...ctx.actor.permissions.keys()]}
      entityPaths={Object.fromEntries(registry.all().map((e) => [e.key, e.listPath]))}
    >
      {children}
    </TerminalFrame>
  );
}
