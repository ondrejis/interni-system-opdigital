import { SettingsPage } from "@rebar/ui";
import { BellRing } from "lucide-react";
import { requireCan } from "@/server/request";
import { NotificationRules } from "./notification-rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pravidla upozornění" };

/** Pravidla upozornění firmy: které události se hlásí, komu, kudy a jakým textem; povinné události, tiché hodiny. */
export default async function NotificationRulesPage() {
  await requireCan("settings.manage");
  return (
    <SettingsPage
      width="xl"
      title="Pravidla upozornění"
      description="Které události systém hlásí, komu, kudy a jakým textem. Každý uživatel si ještě může nastavit vlastní předvolby (kromě povinných událostí)."
      icon={<BellRing />}
    >
      <NotificationRules />
    </SettingsPage>
  );
}
