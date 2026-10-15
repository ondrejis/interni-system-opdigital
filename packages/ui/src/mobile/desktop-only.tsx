"use client";

import type { ReactNode } from "react";
import { Monitor } from "lucide-react";
import { useIsMobile } from "../hooks/use-media";

/**
 * Záměrně omezené na mobilu (MOB-09): editor oprávnění, editor šablon, editor struktury Disku a úpravy přehledu
 * (na telefonu jen pořadí widgetů) se na telefonu nezobrazují; místo nich je jasná zpráva. Komponentu obalí
 * vlastník editoru: `<DesktopOnly what="Editor šablon">…editor…</DesktopOnly>`. Na počítači vykreslí obsah beze změny.
 */
export function DesktopOnly({
  what,
  children,
  hint,
}: {
  /** Co se na telefonu nedá dělat („Editor šablon zakázek“). */
  what: string;
  children: ReactNode;
  /** Doplňující věta (výchozí: otevřít na počítači). */
  hint?: string;
}) {
  const mobile = useIsMobile();
  if (!mobile) return <>{children}</>;
  return (
    <div
      className="m-4 flex items-start gap-3 rounded-lg border border-line bg-subtle p-4"
      data-testid="desktop-only"
      role="note"
    >
      <Monitor className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
      <div className="space-y-1">
        <p className="text-base font-medium">{what} je dostupný jen na počítači</p>
        <p className="text-sm text-muted">
          {hint ?? "Na telefonu se tahle úprava záměrně nenabízí. Otevřete OPSYS na počítači."}
        </p>
      </div>
    </div>
  );
}
