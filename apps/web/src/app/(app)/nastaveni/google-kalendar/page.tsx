import { CalendarDays } from "lucide-react";
import { requireCan } from "@/server/request";
import { SettingsPlaceholder } from "../_shared/settings-placeholder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Google Kalendář" };

/** Zástupná stránka (kostra S0): Napojení vlastního Google účtu a výběr kalendářů. */
export default async function Page() {
  await requireCan("kalendar.read");
  return (
    <SettingsPlaceholder
      title="Google Kalendář"
      description="Napojení vlastního Google účtu a výběr kalendářů."
      icon={<CalendarDays />}
    />
  );
}
