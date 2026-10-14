"use client";

import { cn, useNav } from "@rebar/ui";
import {
  Bell,
  Blocks,
  Building2,
  Download,
  Hash,
  LayoutDashboard,
  ListChecks,
  Lock,
  Mail,
  Percent,
  Receipt,
  ShieldCheck,
  Smartphone,
  SlidersHorizontal,
  UserRound,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef } from "react";
import type { SectionIcon } from "./sections";

const ICONS: Record<SectionIcon, LucideIcon> = {
  building: Building2,
  users: Users,
  shield: ShieldCheck,
  bell: Bell,
  lock: Lock,
  user: UserRound,
  workflow: Workflow,
  lists: ListChecks,
  fields: SlidersHorizontal,
  hash: Hash,
  percent: Percent,
  modules: Blocks,
  mail: Mail,
  receipt: Receipt,
  phone: Smartphone,
  dashboard: LayoutDashboard,
  download: Download,
};

type Item = { href: string; label: string; icon: SectionIcon; group: string };

/**
 * Oddíly nastavení. Na počítači svislý seznam s nadpisy skupin, na telefonu
 * vodorovně posuvný pruh (aktivní položka se sama připosune do výhledu).
 */
export function SettingsNav({ sections }: { sections: Item[] }) {
  const pathname = usePathname();
  const { Link } = useNav();
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    nav.current
      ?.querySelector("[aria-current=page]")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <nav
      ref={nav}
      aria-label="Oddíly nastavení"
      className="shrink-0 border-b border-line bg-bg lg:w-60 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-3"
    >
      <div className="scrollbar-none flex gap-1 overflow-x-auto p-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-0">
        {sections.map((s, i) => {
          const I = ICONS[s.icon];
          const current = pathname === s.href;
          return (
            <Fragment key={s.href}>
              {sections[i - 1]?.group !== s.group && (
                <p className="hidden px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-faint first:pt-1 lg:block">
                  {s.group}
                </p>
              )}
              <Link
                href={s.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-base font-medium text-muted transition-colors duration-150 hover:bg-hover hover:text-fg lg:py-1.5",
                  current && "bg-active text-fg",
                )}
              >
                <I
                  className={cn("size-4 shrink-0", current ? "text-accent" : "text-faint")}
                  aria-hidden
                />
                {s.label}
              </Link>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}
