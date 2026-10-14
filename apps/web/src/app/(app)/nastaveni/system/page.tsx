import { Server } from "lucide-react";
import { requireCan } from "@/server/request";
import { SettingsPlaceholder } from "../_shared/settings-placeholder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Systém" };

/** Zástupná stránka (kostra S0): Stav systému, zálohy, chyby integrací a chybná doručení webhooků. */
export default async function Page() {
  await requireCan("settings.manage");
  return (
    <SettingsPlaceholder
      title="Systém"
      description="Stav systému, zálohy, chyby integrací a chybná doručení webhooků."
      icon={<Server />}
    />
  );
}
