import { PageHeader } from "@rebar/ui";
import type { ReactNode } from "react";
import { requireCtx } from "@/server/request";
import { getServices } from "@/server/services";
import { allowedSections, type SettingsFeature } from "./sections";
import { SettingsNav } from "./settings-nav";

export const dynamic = "force-dynamic";

/** Nastavení: vlevo oddíly podle oprávnění, vpravo obsah. Uživatel s nenastaveným 2FA vidí jen obsah (stránka zabezpečení). */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx({ allowRestricted: true });
  if (ctx.actor.restriction) return <>{children}</>;
  const enabled = new Set(getServices().runtime.modules.map((m) => m.id));
  // funkce vypnuté v konfiguraci klienta (nástěnky, exporty) se v nabídce nenabízejí
  const { config } = getServices().runtime;
  const disabled = new Set<SettingsFeature>([
    ...(config.dashboards.enabled ? [] : (["dashboards"] as const)),
    ...(config.exports.enabled ? [] : (["exports"] as const)),
  ]);
  const sections = allowedSections(ctx, enabled, disabled).map(({ href, label, icon, group }) => ({
    href,
    label,
    icon,
    group,
  }));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Nastavení" }]} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <SettingsNav sections={sections} />
        <div className="min-h-0 min-w-0 flex-1 bg-subtle">{children}</div>
      </div>
    </div>
  );
}
