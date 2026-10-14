import { Tag } from "lucide-react";
import { requireCan } from "@/server/request";
import { SettingsPlaceholder } from "../_shared/settings-placeholder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Štítky" };

/** Zástupná stránka (kostra S0): Štítky záznamů: názvy a barvy společné pro celý systém. */
export default async function Page() {
  await requireCan("settings.tags");
  return (
    <SettingsPlaceholder
      title="Štítky"
      description="Štítky záznamů: názvy a barvy společné pro celý systém."
      icon={<Tag />}
    />
  );
}
