import { Notice, SettingsPage } from "@rebar/ui";
import type { ReactNode } from "react";

/** Zástupná stránka Nastavení pro část, která se teprve staví (kostra S0); skutečný obsah ji nahradí. */
export function SettingsPlaceholder({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <SettingsPage title={title} {...(description ? { description } : {})} icon={icon}>
      <Notice tone="info" title="Připravuje se">
        Tato část OPSYS se právě staví.
      </Notice>
    </SettingsPage>
  );
}
