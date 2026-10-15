"use client";

import { Icon } from "../lib/icons";
import { cn } from "../lib/cn";
import { contactActions, type ContactActionKind } from "./contact-actions";

/**
 * Velká tlačítka rychlých akcí pro telefon (MOB-03, MOB-04): Zavolat, SMS, WhatsApp, E-mail, Navigovat, Disk.
 * Každé tlačítko má výšku aspoň 48 px; chybí-li údaj, tlačítko se nezobrazí. Na šířce od `sm` se mřížka skryje
 * (počítač má vlastní odkazy v záhlaví a v kartách).
 */
export function ContactActionBar({
  phone,
  email,
  address,
  driveUrl,
  only,
  desktop = false,
  className,
}: {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  driveUrl?: string | null;
  only?: readonly ContactActionKind[];
  /** Zobrazit i na počítači (výchozí jen pod šířkou `sm`). */
  desktop?: boolean;
  className?: string;
}) {
  const actions = contactActions({ phone, email, address, driveUrl }, only);
  if (actions.length === 0) return null;
  return (
    <div
      className={cn("grid grid-cols-2 gap-2", !desktop && "sm:hidden", className)}
      data-testid="contact-action-bar"
    >
      {actions.map((a, i) => (
        <a
          key={a.kind}
          href={a.href}
          data-testid={`mobile-${a.kind}`}
          {...(a.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={cn(
            "flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line-strong bg-bg px-3 text-base font-medium text-fg active:bg-hover",
            a.kind === "call" && "border-accent bg-accent text-accent-fg active:opacity-90",
            // lichý poslední kus přes celou šířku
            actions.length % 2 === 1 && i === actions.length - 1 && "col-span-2",
          )}
        >
          <Icon name={a.icon} className="size-5 shrink-0" />
          {a.label}
        </a>
      ))}
    </div>
  );
}
