import { HardDrive } from "lucide-react";
import { requireCan } from "@/server/request";
import { SettingsPlaceholder } from "../_shared/settings-placeholder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Google Disk" };

/** Zástupná stránka (kostra S0): Strom složek klienta na sdíleném Google Disku a test napojení. */
export default async function Page() {
  await requireCan("disk.manage");
  return (
    <SettingsPlaceholder
      title="Google Disk"
      description="Strom složek klienta na sdíleném Google Disku a test napojení."
      icon={<HardDrive />}
    />
  );
}
