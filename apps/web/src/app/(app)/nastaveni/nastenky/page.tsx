import { can } from "@rebar/core/rbac";
import { SettingsPage } from "@rebar/ui";
import { LayoutDashboard } from "lucide-react";
import { notFound } from "next/navigation";
import { requireCan } from "@/server/request";
import { dashboardsEnabled } from "@/server/dashboards";
import { BoardsAdmin } from "./boards-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nástěnky" };

export default async function DashboardsSettingsPage() {
  const ctx = await requireCan("dashboards.manage");
  if (!dashboardsEnabled()) notFound();
  return (
    <SettingsPage
      width="xl"
      title="Nástěnky"
      description="Všechny nástěnky v systému: kdo je založil, komu jsou sdílené a které jsou výchozí pro jednotlivé role."
      icon={<LayoutDashboard />}
    >
      <BoardsAdmin canClone={can(ctx, "dashboards.write")} />
    </SettingsPage>
  );
}
