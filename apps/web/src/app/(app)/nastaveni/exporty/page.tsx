import { schema } from "@rebar/core/db";
import { listSchedules } from "@rebar/core/export";
import { can } from "@rebar/core/rbac";
import { SettingsPage } from "@rebar/ui";
import { eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { exportsEnabled } from "@/server/dashboards";
import { requireCtx } from "@/server/request";
import { getServices } from "@/server/services";
import { ExportsSettings } from "./exports-settings";
import type { TabKey } from "./labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exporty" };

/** Exporty dostupné každému přihlášenému; které záložky se ukážou, určují oprávnění. */
export default async function ExportsSettingsPage() {
  const ctx = await requireCtx();
  if (!exportsEnabled()) notFound();
  const { registry, runtime, exportRuntime } = getServices();
  const config = runtime.config.exports;
  const userId = ctx.actor.userId;
  if (!userId) notFound();

  const canManage = can(ctx, "exports.manage");
  const canSchedule = config.scheduled && can(ctx, "exports.schedule");
  // příjemce plánu bez práva plánovat vidí své odběry (a odkaz z e-mailu se mu otevře)
  const subscribed =
    config.scheduled && !canSchedule && !canManage
      ? (await listSchedules(ctx, exportRuntime)).some((s) => s.subscribed)
      : false;

  const tabs: TabKey[] = [
    "moje",
    "sablony",
    ...(config.scheduled && (canSchedule || canManage || subscribed) ? (["plany"] as const) : []),
    ...(canManage ? (["historie"] as const) : []),
    ...(can(ctx, "settings.manage") ? (["nastaveni"] as const) : []),
  ];

  const [me] = await ctx.db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, userId));

  return (
    <SettingsPage
      width="xl"
      title="Exporty"
      description="Vaše exporty ke stažení, uložené šablony a plánované exporty."
      icon={<Download />}
    >
      <ExportsSettings
        tabs={tabs}
        canSchedule={canSchedule}
        canManage={canManage}
        me={{ id: userId, name: me?.name ?? "Já" }}
        entityPaths={Object.fromEntries(registry.all().map((d) => [d.key, d.listPath]))}
        retentionDays={config.retentionDays}
      />
    </SettingsPage>
  );
}
