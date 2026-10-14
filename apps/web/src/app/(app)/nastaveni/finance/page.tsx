import { Wallet } from "lucide-react";
import { requireCan } from "@/server/request";
import { SettingsPlaceholder } from "../_shared/settings-placeholder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance" };

/** Zástupná stránka (kostra S0): Základ salda a výchozí rozdělení plateb mezi partnery. */
export default async function Page() {
  await requireCan("finance.settings");
  return (
    <SettingsPlaceholder
      title="Finance"
      description="Základ salda a výchozí rozdělení plateb mezi partnery."
      icon={<Wallet />}
    />
  );
}
