import { getMyPreferences, listMyDeliveries } from "@rebar/core/notifications";
import { SettingsPage } from "@rebar/ui";
import { Bell } from "lucide-react";
import { requireCtx } from "@/server/request";
import { getServices } from "@/server/services";
import { NotificationSettings } from "./notification-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upozornění" };

/** Moje upozornění: zařízení, co chci dostávat, tiché hodiny, protokol doručení. Dostupné každému přihlášenému (i v terminálu). */
export default async function NotificationsPage() {
  const ctx = await requireCtx();
  const s = getServices();
  const [prefs, deliveries] = await Promise.all([getMyPreferences(ctx), listMyDeliveries(ctx)]);
  return (
    <SettingsPage
      width="lg"
      title="Upozornění"
      description="Co vám má systém hlásit, kam a kdy. Zvoneček v aplikaci funguje vždy; upozornění v telefonu si zapnete v každém zařízení zvlášť."
      icon={<Bell />}
    >
      <NotificationSettings
        pushEnabled={!!s.vapidPublicKey}
        publicKey={s.vapidPublicKey}
        initial={prefs}
        deliveries={deliveries.map((d) => ({
          ...d,
          createdAt: d.createdAt.toISOString(),
          sentAt: d.sentAt?.toISOString() ?? null,
        }))}
      />
    </SettingsPage>
  );
}
