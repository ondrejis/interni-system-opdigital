import { Palette } from "lucide-react";
import { requireCtx } from "@/server/request";
import { SettingsPlaceholder } from "../_shared/settings-placeholder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vzhled" };

/** Zástupná stránka (kostra S0): Motiv a osobní nastavení vzhledu aplikace. */
export default async function Page() {
  await requireCtx();
  return (
    <SettingsPlaceholder
      title="Vzhled"
      description="Motiv a osobní nastavení vzhledu aplikace."
      icon={<Palette />}
    />
  );
}
