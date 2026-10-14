import { getAccount } from "@rebar/core/auth";
import { vatChoices } from "@rebar/core/config-data";
import { VatRatesProvider } from "@rebar/ui";
import type { ReactNode } from "react";
import { requireCtx } from "@/server/request";
import { getServices } from "@/server/services";
import { loadShell } from "@/server/shell";
import { AppFrame } from "./app-frame";

export const dynamic = "force-dynamic";

/** Přihlášená část aplikace: postranní panel, hledání (Cmd+K) a zkratky obaluje každou stránku. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx({ allowRestricted: true });
  // Uživatel s povinným, ale nenastaveným 2FA vidí jen stránku zabezpečení (stránky samy ho jinam nepustí), bez navigace.
  if (ctx.actor.restriction) return <main className="mx-auto max-w-2xl p-6">{children}</main>;
  const [account, shell, branding, vat] = await Promise.all([
    getAccount(ctx),
    loadShell(ctx),
    getServices().getBranding(),
    // sazby DPH z Nastavení: moduly je nabízejí u položek dokladů a rozpočtu
    vatChoices(ctx.db, new Date().toISOString().slice(0, 10)),
  ]);
  return (
    <AppFrame
      brand={{
        name: branding.name,
        logoUrl: branding.logoFileId ? `/api/files/${branding.logoFileId}` : null,
      }}
      user={{ id: account.id, name: account.name, roleName: account.roleName }}
      shell={shell}
    >
      <VatRatesProvider value={vat}>{children}</VatRatesProvider>
    </AppFrame>
  );
}
