"use client";

import { DeliveryLog, type DeliveryRow } from "./delivery-log";
import { DeviceSection } from "./device-section";
import { PreferencesSection, type Prefs } from "./preferences-section";

/** Nastavení → Upozornění: zařízení, předvolby událostí, tiché hodiny a protokol doručení. */
export function NotificationSettings({
  pushEnabled,
  publicKey,
  initial,
  deliveries,
}: {
  pushEnabled: boolean;
  publicKey: string | null;
  initial: Prefs;
  deliveries: DeliveryRow[];
}) {
  return (
    <div className="space-y-6">
      <DeviceSection pushEnabled={pushEnabled} publicKey={publicKey} />
      <PreferencesSection initial={initial} />
      <DeliveryLog rows={deliveries} />
    </div>
  );
}
