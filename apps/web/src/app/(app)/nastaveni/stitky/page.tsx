import { SettingsPage } from "@rebar/ui";
import { Tag } from "lucide-react";
import { requireCan } from "@/server/request";
import { TagsAdmin } from "./tags-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Štítky" };

/** Štítky záznamů: názvy, barvy a rozsah použití (které entity je nabízejí), společné pro celý systém. */
export default async function Page() {
  await requireCan("settings.tags");
  return (
    <SettingsPage
      width="xl"
      title="Štítky"
      description="Štítky s barvou pro firmy, kontakty, obchody, zakázky a úkoly. Štítek se dá omezit jen na některé typy záznamů."
      icon={<Tag />}
    >
      <TagsAdmin />
    </SettingsPage>
  );
}
