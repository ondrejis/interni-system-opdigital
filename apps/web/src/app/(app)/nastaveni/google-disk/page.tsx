import { DriveSettings } from "@rebar/disk/ui";
import { DesktopOnly } from "@rebar/ui";
import { requireCan } from "@/server/request";

export const dynamic = "force-dynamic";
export const metadata = { title: "Google Disk" };

/** Nastavení → Google Disk: stav napojení na n8n, test, strom složek klienta a typů zakázek, poslední požadavky. */
export default async function Page() {
  await requireCan("disk.manage");
  return (
    <DesktopOnly what="Editor struktury Disku">
      <DriveSettings />
    </DesktopOnly>
  );
}
