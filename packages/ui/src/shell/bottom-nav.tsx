"use client";

import type { ReactNode } from "react";
import { Icon } from "../lib/icons";
import { cn } from "../lib/cn";
import { useNav } from "../nav";

export type BottomItem = {
  id: string;
  label: string;
  icon: string;
  /** Odkaz, nebo akce (Foto, Více). */
  href?: string;
  onSelect?: () => void;
  badge?: number;
};

/**
 * Spodní navigace pro práci jednou rukou na telefonu (jen pod šířkou `md`). Každá položka má dotykovou plochu
 * aspoň 56 px na výšku; aktivní položka je zvýrazněná i pro čtečky (`aria-current`).
 */
export function BottomNav({
  items,
  pathname,
}: {
  items: BottomItem[];
  pathname: string;
}): ReactNode {
  const { Link } = useNav();
  const active = (h?: string) =>
    !!h && (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`));
  return (
    <nav
      aria-label="Rychlá navigace"
      className="flex shrink-0 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden"
      data-testid="bottom-nav"
    >
      {items.map((it) => {
        const on = active(it.href);
        const cls = cn(
          "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px]",
          on ? "font-semibold text-accent" : "text-muted",
        );
        const body = (
          <>
            <Icon name={it.icon} className="size-6" />
            <span className="max-w-full truncate">{it.label}</span>
            {!!it.badge && (
              <span className="absolute right-[calc(50%-1.5rem)] top-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 text-white">
                {it.badge}
              </span>
            )}
          </>
        );
        return it.href ? (
          <Link key={it.id} href={it.href} className={cls} aria-current={on ? "page" : undefined}>
            {body}
          </Link>
        ) : (
          <button key={it.id} type="button" className={cls} onClick={it.onSelect}>
            {body}
          </button>
        );
      })}
    </nav>
  );
}
