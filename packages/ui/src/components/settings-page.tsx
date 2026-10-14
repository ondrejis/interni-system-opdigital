import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { RiseStyle } from "./rise";

const WIDTH = {
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-6xl",
} as const;

/**
 * Stránka nastavení: posuvná plocha s jednotným záhlavím (ikona, nadpis, popis, akce vpravo)
 * a obsahem ve sloupci. Plocha je o stupeň tmavší než karty (`bg-sunken`), aby se karty odlišily od podkladu.
 */
export function SettingsPage({
  title,
  description,
  icon,
  actions,
  width = "md",
  children,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  width?: keyof typeof WIDTH;
  children: ReactNode;
}) {
  return (
    <div className="scrollbar-thin h-full overflow-y-auto bg-sunken">
      <RiseStyle />
      <div className={cn("@container ui-rise mx-auto w-full p-4 md:p-6 lg:p-8", WIDTH[width])}>
        <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
            {icon && (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent ring-1 ring-inset ring-[var(--accent-line)] [&_svg]:size-5">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              {description && (
                <p className="mt-1 max-w-prose text-base text-muted">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * Karta sekce nastavení: záhlaví, tělo a volitelná patička s akcemi (primární vpravo).
 * `flush` odstraní odsazení těla, např. pro tabulku nebo seznam přes celou šířku karty.
 */
export function FormSection({
  title,
  description,
  icon,
  badge,
  footer,
  flush,
  tone = "default",
  className,
  children,
  ...rest
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Štítek vpravo v záhlaví (např. stav). */
  badge?: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  tone?: "default" | "danger";
  className?: string;
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  const hasBody = children !== undefined && children !== null;
  return (
    <section
      className={cn(
        "rounded-xl border bg-card",
        tone === "danger" ? "border-danger/30" : "border-line",
        className,
      )}
      {...rest}
    >
      {/* na úzké obrazovce štítek spadne pod nadpis, místo aby ho stlačil do úzkého sloupce */}
      <header
        className={cn(
          "flex flex-wrap items-start gap-x-3 gap-y-2 px-5 pt-5",
          hasBody ? "border-b border-line-soft pb-4" : "pb-5",
        )}
      >
        {icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
              tone === "danger" ? "bg-danger-soft text-danger" : "bg-hover text-muted",
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1 basis-56">
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-base text-muted">{description}</p>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </header>
      {hasBody && <div className={cn(flush ? "" : "px-5 pb-5 pt-4")}>{children}</div>}
      {footer && (
        <footer className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-line bg-subtle px-5 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}
