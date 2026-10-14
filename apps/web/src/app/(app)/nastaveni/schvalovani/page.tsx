import { SettingsPage } from "@rebar/ui";
import { ClipboardCheck } from "lucide-react";
import { requireCan } from "@/server/request";
import { ApprovalRules } from "./approval-rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schvalování" };

export default async function ApprovalSettingsPage() {
  await requireCan("zakazky.approve_all");
  return (
    <SettingsPage
      width="lg"
      title="Schvalování"
      description="Kdo schvaluje změny, soupisy prací, objednávky a přijaté faktury podle výše částky."
      icon={<ClipboardCheck />}
    >
      <ApprovalRules />
    </SettingsPage>
  );
}
