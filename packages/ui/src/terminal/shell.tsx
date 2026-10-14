"use client";

import { ChevronLeft, CloudOff, UploadCloud } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "../lib/icons";
import { useNav } from "../nav";
import { usePendingUploads } from "../data/photo-capture";
import { useTerminalQueue } from "./queue-context";

export type TerminalNavItem = {
  id: string;
  label: string;
  icon: string;
  href: string;
};

/**
 * Samostatný rám terminálu řemeslníka: úzký sloupec pro jednu ruku, nahoře stav spojení a fronty zápisů, dole nejvýš
 * pět položek (Dnes, až tři dlaždice, Více). Nezná kancelářskou navigaci; na počítači je sloupec uprostřed (náhled).
 */
export function TerminalShell({
  brand,
  nav,
  pathname,
  banner,
  children,
}: {
  brand: { name: string; logoUrl: string | null };
  nav: readonly TerminalNavItem[];
  pathname: string;
  /** Pruh pod hlavičkou (např. „Náhled jako řemeslník“). */
  banner?: ReactNode;
  children: ReactNode;
}) {
  const { Link } = useNav();
  const active = (href: string) =>
    href === "/t" ? pathname === "/t" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <div className="flex h-dvh flex-col bg-subtle text-fg" data-testid="terminal">
      <header className="shrink-0 border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center gap-3 px-4">
          <Link
            href="/t"
            className="flex h-12 min-w-0 flex-1 items-center gap-2.5"
            aria-label={brand.name}
          >
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt="" className="size-8 rounded-lg" />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-fg">
                {brand.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-xl font-semibold">{brand.name}</span>
          </Link>
          <ConnectionChip />
        </div>
        {banner}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-xl px-4 py-4">{children}</div>
      </main>

      <nav
        aria-label="Terminál"
        data-testid="terminal-nav"
        className="shrink-0 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex w-full max-w-xl">
          {nav.map((it) => {
            const on = active(it.href);
            return (
              <li key={it.id} className="min-w-0 flex-1">
                <Link
                  href={it.href}
                  aria-current={on ? "page" : undefined}
                  aria-label={it.label}
                  className={cn(
                    "relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[12px] leading-tight",
                    on ? "font-semibold text-accent" : "text-muted",
                  )}
                >
                  <Icon name={it.icon} className="size-6" />
                  <span className="line-clamp-2 max-w-full text-center">{it.label}</span>
                  {it.id === "more" && <MoreBadge />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function MoreBadge() {
  const { pending, conflicts } = useTerminalQueue();
  const photos = usePendingUploads();
  const n = pending.length + conflicts.length + photos;
  if (!n) return null;
  return (
    <span
      data-testid="more-badge"
      className={cn(
        "absolute right-[calc(50%-1.75rem)] top-2 min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 text-white",
        conflicts.length ? "bg-danger" : "bg-warning",
      )}
    >
      {n}
    </span>
  );
}

/** Stav spojení a fronty v hlavičce; ťuknutí vede na seznam čekajících zápisů. */
function ConnectionChip() {
  const { Link } = useNav();
  const { online, pending, conflicts } = useTerminalQueue();
  const photos = usePendingUploads();
  const waiting = pending.length + photos;
  if (online && !waiting && !conflicts.length) return null;
  const text = conflicts.length
    ? `Konflikt: ${conflicts.length}`
    : waiting
      ? `Čeká na odeslání: ${waiting}`
      : "Bez připojení";
  return (
    <Link
      href="/t/vice#fronta"
      data-testid="queue-indicator"
      className={cn(
        "inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium",
        conflicts.length
          ? "bg-danger-soft text-danger"
          : online
            ? "bg-warning-soft text-warning"
            : "bg-hover text-muted",
      )}
    >
      {online ? <UploadCloud className="size-4" /> : <CloudOff className="size-4" />}
      {text}
    </Link>
  );
}

/** Nadpis obrazovky dlaždice se šipkou zpět na úvodní obrazovku terminálu. */
export function TerminalPageHeader({
  title,
  backHref = "/t",
}: {
  title: string;
  backHref?: string;
}) {
  const { Link } = useNav();
  return (
    <div className="mb-4 flex items-center gap-1">
      <Link
        href={backHref}
        aria-label="Zpět"
        className="-ml-3 inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-muted active:bg-hover"
      >
        <ChevronLeft className="size-6" />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">{title}</h1>
    </div>
  );
}
