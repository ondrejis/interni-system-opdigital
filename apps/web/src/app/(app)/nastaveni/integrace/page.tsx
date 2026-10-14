import { Plug } from "lucide-react";
import { requireCan } from "@/server/request";
import { SettingsPlaceholder } from "../_shared/settings-placeholder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrace" };

/** Zástupná stránka (kostra S0): Webhooky do n8n, příchozí napojení a stav integrací (ARES, Meta, Fakturoid). */
export default async function Page() {
  await requireCan("settings.integrations");
  return (
    <SettingsPlaceholder
      title="Integrace"
      description="Webhooky do n8n, příchozí napojení a stav integrací (ARES, Meta, Fakturoid)."
      icon={<Plug />}
    />
  );
}
