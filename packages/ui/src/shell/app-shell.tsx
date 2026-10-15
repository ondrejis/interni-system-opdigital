"use client";

import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, Kbd } from "../components/badges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/overlay";
import { modKey } from "../hooks/use-hotkeys";
import { Icon } from "../lib/icons";
import { cn } from "../lib/cn";
import { useNav } from "../nav";
import { ThemeSwitch } from "./theme";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  count?: number;
  /** Barva odznaku s počtem (výchozí akcentová). */
  tone?: "warning" | "danger";
  /** Vedlejší stránky modulu, rozbalují se pod položkou. */
  children?: NavItem[];
};
export type NavSection = { heading?: string; items: NavItem[] };

export type ShellProps = {
  brand: { name: string; logoUrl?: string | null };
  user: { name: string; roleName: string };
  /** Pevné položky nahoře (Inbox, Moje úkoly) s počty. */
  top: NavItem[];
  /** Sekce Záznamy a Pohledy. */
  sections: NavSection[];
  /** Položky patičky nad Nastavením (Historie, Koš). */
  footer?: NavItem[];
  pathname: string;
  onSearch: () => void;
  onLogout: () => void;
  settingsHref?: string | null;
  securityHref?: string;
  /** Stránka Můj účet (profil, heslo, přihlášená zařízení); položka v nabídce uživatele. */
  accountHref?: string;
  /** Spodní navigace na telefonu; dostane funkci, která otevře celé menu. */
  bottomNav?: (openMenu: () => void) => ReactNode;
  children: ReactNode;
};

const STORAGE = "sidebar-collapsed";

export function AppShell({
  brand,
  user,
  top,
  sections,
  footer,
  pathname,
  onSearch,
  onLogout,
  settingsHref,
  securityHref,
  accountHref,
  bottomNav,
  children,
}: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  // Po kliknutí se položka zvýrazní hned, ne až když dorazí nová stránka (navigace pak působí plynule).
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE) === "1");
    } catch {
      /* bez uložení */
    }
  }, []);
  useEffect(() => {
    setDrawer(false);
    setPending(null);
  }, [pathname]);

  // Menu na telefonu je dialog: zachytí focus, Esc ho zavře a focus se vrátí na tlačítko, které ho otevřelo
  useEffect(() => {
    if (!drawer) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      [
        ...(drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((e) => e.offsetParent !== null);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setDrawer(false);
      } else if (e.key === "Tab") {
        const f = focusables();
        const first = f[0];
        const last = f[f.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [drawer]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE, c ? "0" : "1");
      } catch {
        /* bez uložení */
      }
      return !c;
    });
  };

  const sidebar = (compact: boolean, touch = false) => (
    <Sidebar
      {...{
        brand,
        user,
        top,
        sections,
        footer,
        onSearch,
        onLogout,
        settingsHref,
        securityHref,
        accountHref,
      }}
      pathname={pending ?? pathname}
      onNavigate={setPending}
      compact={compact}
      touch={touch}
      onToggle={toggle}
    />
  );

  return (
    <div className="flex h-dvh bg-subtle text-fg">
      <aside
        className={cn(
          "hidden shrink-0 border-r border-line bg-subtle transition-[width] duration-150 md:block",
          collapsed ? "w-14" : "w-60",
        )}
      >
        {sidebar(collapsed)}
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-[var(--bg-overlay)] anim-fade"
            onClick={() => setDrawer(false)}
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigace"
            className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] border-r border-line bg-subtle pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] anim-slide-in"
            data-testid="more-menu"
          >
            {sidebar(false, true)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[calc(3rem+env(safe-area-inset-top))] items-center gap-2 border-b border-line bg-bg px-3 pt-[env(safe-area-inset-top)] md:hidden">
          <button
            type="button"
            aria-label="Otevřít menu"
            onClick={() => setDrawer(true)}
            className="-ml-2 inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-hover"
          >
            {drawer ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <span className="flex-1 truncate font-semibold">{brand.name}</span>
          <button
            type="button"
            aria-label="Hledat"
            onClick={onSearch}
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-hover"
          >
            <Search className="size-5" />
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden bg-bg md:m-1.5 md:rounded-lg md:border md:border-line">
          <div key={pathname} className="anim-fade h-full">
            {children}
          </div>
        </main>
        {bottomNav?.(() => setDrawer(true))}
      </div>
    </div>
  );
}

function NavLink({
  item,
  active,
  compact,
  nested,
  touch,
  onNavigate,
  trailing,
}: {
  item: NavItem;
  active: boolean;
  compact: boolean;
  nested?: boolean;
  /** Menu na telefonu: řádek aspoň 44 px. */
  touch?: boolean;
  onNavigate: (href: string) => void;
  trailing?: ReactNode;
}) {
  const { Link } = useNav();
  return (
    <Link
      href={item.href}
      title={compact ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      onClick={() => onNavigate(item.href)}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 font-medium text-muted transition-colors hover:bg-hover hover:text-fg",
        touch ? "h-11 text-base" : nested ? "h-7 text-[13px]" : "h-8 text-base",
        active && "bg-active text-fg",
        compact && "justify-center px-0",
      )}
    >
      <Icon
        name={item.icon}
        className={cn("shrink-0", nested ? "size-3.5" : "size-4", active && "text-accent")}
      />
      {!compact && <span className="flex-1 truncate">{item.label}</span>}
      {!compact && item.count ? (
        <span
          className={cn(
            "rounded-full px-1.5 text-xs font-semibold leading-5",
            item.tone === "danger"
              ? "bg-danger text-white"
              : item.tone === "warning"
                ? "bg-warning-soft text-warning"
                : "bg-accent text-accent-fg",
          )}
        >
          {item.count}
        </span>
      ) : null}
      {!compact && trailing}
    </Link>
  );
}

/** Modul s vedlejšími stránkami: hlavní odkaz a rozbalovací seznam podstránek. */
function NavGroup({
  item,
  isActive,
  compact,
  touch,
  onNavigate,
}: {
  item: NavItem;
  isActive: (href: string) => boolean;
  compact: boolean;
  touch?: boolean;
  onNavigate: (href: string) => void;
}) {
  const children = item.children ?? [];
  const within = isActive(item.href) || children.some((c) => isActive(c.href));
  const [open, setOpen] = useState(within);
  useEffect(() => {
    if (within) setOpen(true);
  }, [within]);
  if (!children.length)
    return (
      <NavLink
        item={item}
        active={isActive(item.href)}
        compact={compact}
        touch={touch}
        onNavigate={onNavigate}
      />
    );
  // Hlavní stránka modulu je aktivní jen tehdy, když není aktivní žádná z podstránek.
  const own = isActive(item.href) && !children.some((c) => isActive(c.href));
  return (
    <div>
      <div className="relative">
        <NavLink item={item} active={own} compact={compact} touch={touch} onNavigate={onNavigate} />
        {!compact && (
          <button
            type="button"
            aria-label={open ? `Sbalit: ${item.label}` : `Rozbalit: ${item.label}`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              "absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded text-faint transition-colors hover:bg-active hover:text-fg",
              touch ? "size-11" : "size-6",
            )}
          >
            <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
          </button>
        )}
      </div>
      {open && !compact && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-line pl-2">
          {children.map((c) => (
            <NavLink
              key={c.href}
              item={c}
              nested
              active={isActive(c.href)}
              compact={false}
              touch={touch}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  brand,
  user,
  top,
  sections,
  footer,
  pathname,
  onSearch,
  onLogout,
  settingsHref,
  securityHref,
  accountHref,
  compact,
  touch,
  onToggle,
  onNavigate,
}: Omit<ShellProps, "children" | "bottomNav"> & {
  compact: boolean;
  /** Menu na telefonu (Více): větší dotykové plochy. */
  touch: boolean;
  onToggle: () => void;
  onNavigate: (href: string) => void;
}) {
  const { Link } = useNav();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-12 items-center gap-2 px-3", compact && "justify-center px-0")}>
        <Link
          href="/"
          className={cn("flex min-w-0 items-center gap-2", touch && "min-h-11")}
          aria-label={brand.name}
        >
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt="" className="size-6 rounded" />
          ) : (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-bold text-accent-fg">
              {brand.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          {!compact && <span className="truncate font-semibold">{brand.name}</span>}
        </Link>
      </div>

      <div className="px-2">
        <button
          type="button"
          onClick={onSearch}
          title={compact ? "Hledat (Cmd+K)" : undefined}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border border-line bg-bg px-2 text-muted transition-colors hover:border-line-strong hover:text-fg",
            compact && "justify-center px-0",
          )}
        >
          <Search className="size-4 shrink-0" strokeWidth={1.5} />
          {!compact && (
            <>
              <span className="flex-1 text-left">Hledat…</span>
              <Kbd>{modKey()} K</Kbd>
            </>
          )}
        </button>
      </div>

      <nav
        aria-label="Hlavní navigace"
        className="scrollbar-thin mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto px-2"
      >
        <div className="space-y-0.5">
          {top.map((i) => (
            <NavLink
              key={i.href}
              item={i}
              active={isActive(i.href)}
              compact={compact}
              touch={touch}
              onNavigate={onNavigate}
            />
          ))}
        </div>
        {sections.map((s, idx) => (
          <div key={s.heading ?? idx} className="space-y-0.5">
            {s.heading && !compact && (
              <h2 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-faint">
                {s.heading}
              </h2>
            )}
            {s.items.map((i) => (
              <NavGroup
                key={i.href}
                item={i}
                isActive={isActive}
                compact={compact}
                touch={touch}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-line p-2">
        {footer?.map((i) => (
          <NavLink
            key={i.href}
            item={i}
            active={isActive(i.href)}
            compact={compact}
            touch={touch}
            onNavigate={onNavigate}
          />
        ))}
        {settingsHref && (
          <NavLink
            item={{ href: settingsHref, label: "Nastavení", icon: "settings" }}
            active={isActive(settingsHref)}
            compact={compact}
            touch={touch}
            onNavigate={onNavigate}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors hover:bg-hover",
                compact && "justify-center",
              )}
            >
              <Avatar name={user.name} size={24} />
              {!compact && (
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate font-medium">{user.name}</span>
                  <span className="block truncate text-xs text-faint">{user.roleName}</span>
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-60">
            <DropdownMenuLabel>Vzhled</DropdownMenuLabel>
            <div className="px-1.5 pb-1.5">
              <ThemeSwitch />
            </div>
            <DropdownMenuSeparator />
            {accountHref && (
              <DropdownMenuItem asChild>
                <Link href={accountHref}>
                  <UserRound /> Profil
                </Link>
              </DropdownMenuItem>
            )}
            {securityHref && (
              <DropdownMenuItem asChild>
                <Link href={securityHref}>
                  <ShieldCheck /> Zabezpečení účtu
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onLogout}>
              <LogOut /> Odhlásit se
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={onToggle}
          title={compact ? "Rozbalit panel" : "Sbalit panel"}
          className={cn(
            "hidden h-7 w-full items-center gap-2 rounded-md px-2 text-faint transition-colors hover:bg-hover hover:text-fg md:flex",
            compact && "justify-center px-0",
          )}
        >
          {compact ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!compact && <span className="text-sm">Sbalit</span>}
        </button>
      </div>
    </div>
  );
}

/** Hlavička stránky: drobečky, přepínač pohledů a akce. */
export function PageHeader({
  breadcrumbs,
  actions,
  children,
}: {
  breadcrumbs: { label: string; href?: string }[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { Link } = useNav();
  return (
    <div className="border-b border-line">
      <div className="flex h-11 items-center justify-between gap-3 px-4">
        <nav
          aria-label="Drobečková navigace"
          className="flex min-w-0 items-center gap-1.5 text-base"
        >
          {breadcrumbs.map((b, i) => (
            <span key={`${b.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className="text-faint">/</span>}
              {b.href && i < breadcrumbs.length - 1 ? (
                <Link href={b.href} className="truncate text-muted hover:text-fg">
                  {b.label}
                </Link>
              ) : (
                <h1 className="truncate text-base font-semibold">{b.label}</h1>
              )}
            </span>
          ))}
        </nav>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
