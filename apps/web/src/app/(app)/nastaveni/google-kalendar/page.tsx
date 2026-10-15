import { GoogleCalendarSettings } from "@rebar/kalendar/ui";
import { requireCan } from "@/server/request";

export const dynamic = "force-dynamic";
export const metadata = { title: "Google Kalendář" };

/** Nastavení → Google Kalendář: připojení vlastního účtu, zobrazované kalendáře, kalendář pro zápis, stav synchronizace. */
export default async function Page() {
  await requireCan("kalendar.read");
  return <GoogleCalendarSettings />;
}
