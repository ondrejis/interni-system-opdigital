"use client";

import { ChevronDown, Layers, Star } from "lucide-react";
import { Fragment, useMemo, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../components/overlay";
import { cn } from "../lib/cn";
import type { SavedViewInfo } from "./api";
import { MenuRadioGroup, MenuRadioItem } from "./menu-parts";
import { resolveViews, type ViewLayout } from "./view-layout";

const ALL = "__all";

type Props = {
  /** Název výchozího pohledu bez uložení („Všechny“, „Otevřené obchody“). */
  allLabel: string;
  views: readonly SavedViewInfo[] | undefined;
  viewId: string | null;
  onSelect: (id: string | null) => void;
  /** Bez uspořádání zůstane pás záložek se všemi pohledy. */
  layout?: ViewLayout | undefined;
  /** Telefon: jedno tlačítko s nabídkou místo pásu záložek. */
  isMobile: boolean;
  /** Nastavení aktuálního pohledu (oblíbený, přejmenovat, smazat); vykreslí se vedle záložek. */
  settings?: ReactNode;
  /** Vložený seznam (compact) pohledy nemá. */
  hidden?: boolean | undefined;
};

/**
 * Přepínač uložených pohledů seznamu. S `layout` jsou viditelné jen nejčastější pohledy jako záložky a ostatní jedna
 * nabídka po skupinách (s názvem aktuálního pohledu a počtem skrytých); bez něj pás záložek jako dřív.
 */
export function ViewSwitcher({
  allLabel,
  views,
  viewId,
  onSelect,
  layout,
  isMobile,
  settings,
  hidden,
}: Props) {
  const resolved = useMemo(
    () => (layout && views ? resolveViews(views, layout, viewId) : null),
    [layout, views, viewId],
  );

  if (hidden) return null;

  if (!layout || !resolved) {
    return (
      <div
        className="flex items-center gap-1 overflow-x-auto border-b border-line px-1 pt-1.5"
        role="tablist"
        aria-label="Pohledy"
      >
        <ViewTab active={viewId === null} onClick={() => onSelect(null)}>
          {allLabel}
        </ViewTab>
        {views?.map((v) => (
          <ViewTab key={v.id} active={viewId === v.id} onClick={() => onSelect(v.id)}>
            {v.favorite && <Star className="size-3 fill-current text-warning" />}
            {v.name}
          </ViewTab>
        ))}
        {settings}
      </div>
    );
  }

  const current = viewId ? views?.find((v) => v.id === viewId) : undefined;
  const menu = (
    <ViewsMenu
      allLabel={allLabel}
      viewId={viewId}
      onSelect={onSelect}
      resolved={resolved}
      isMobile={isMobile}
      currentName={viewId === null ? allLabel : (current?.name ?? null)}
    />
  );

  if (isMobile)
    return (
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <div className="min-w-0 flex-1">{menu}</div>
        {settings}
      </div>
    );

  return (
    <div className="flex items-center gap-1 border-b border-line px-1 pt-1.5">
      <div
        className="scrollbar-none flex min-w-0 items-center gap-1 overflow-x-auto"
        role="tablist"
        aria-label="Pohledy"
      >
        <ViewTab active={viewId === null} onClick={() => onSelect(null)}>
          {allLabel}
        </ViewTab>
        {resolved.pinned.map((v) => (
          <ViewTab key={v.id} active={viewId === v.id} onClick={() => onSelect(v.id)}>
            {v.favorite && <Star className="size-3 fill-current text-warning" />}
            {v.name}
          </ViewTab>
        ))}
      </div>
      {menu}
      {settings}
    </div>
  );
}

function ViewsMenu({
  allLabel,
  viewId,
  onSelect,
  resolved,
  isMobile,
  currentName,
}: {
  allLabel: string;
  viewId: string | null;
  onSelect: (id: string | null) => void;
  resolved: ReturnType<typeof resolveViews>;
  isMobile: boolean;
  currentName: string | null;
}) {
  const inMenu = !!resolved.hiddenCurrent;
  const count = isMobile
    ? resolved.groups.reduce((n, g) => n + g.items.length, 0)
    : resolved.hidden;
  const label = isMobile
    ? (currentName ?? "Pohled")
    : inMenu
      ? resolved.hiddenCurrent!.name
      : "Další pohledy";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="views-menu"
          aria-label={
            isMobile
              ? `Pohled: ${currentName ?? ""}. Změnit pohled`
              : inMenu
                ? `Pohled: ${label}. Další pohledy`
                : `Další pohledy: ${count}`
          }
          className={
            isMobile
              ? "flex h-8 w-full items-center gap-2 rounded-md border border-line-strong bg-bg px-2.5 text-left text-base font-medium hover:border-faint"
              : cn(
                  "-mb-px flex max-w-64 shrink-0 items-center gap-1.5 border-b-2 px-3 py-1.5 text-base font-medium transition-colors",
                  inMenu ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
                )
          }
        >
          {isMobile && <Layers className="size-4 shrink-0 text-faint" aria-hidden />}
          <span className="min-w-0 flex-1 truncate md:flex-none">{label}</span>
          {count > 0 && (
            <span className="tabular rounded-full bg-hover px-1.5 text-xs font-medium text-muted">
              {count}
            </span>
          )}
          <ChevronDown className="size-3.5 shrink-0 text-faint" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="scrollbar-thin max-h-[min(34rem,var(--radix-dropdown-menu-content-available-height))] w-[min(22rem,calc(100vw-1.5rem))] overflow-auto p-1"
      >
        <MenuRadioGroup
          value={viewId ?? ALL}
          onValueChange={(v) => onSelect(v === ALL ? null : v)}
          aria-label="Pohled"
        >
          <MenuRadioItem value={ALL}>{allLabel}</MenuRadioItem>
          {resolved.groups.map((g) => (
            <Fragment key={g.id}>
              <div
                role="presentation"
                className="mx-1 mb-0.5 mt-2 flex items-baseline gap-2 border-t border-line px-1 pt-2"
              >
                <span className="text-xs font-medium uppercase tracking-wide text-faint">
                  {g.label}
                </span>
                <span className="tabular text-xs text-faint">{g.items.length}</span>
              </div>
              {g.hint && <p className="px-2 pb-1 text-sm text-faint">{g.hint}</p>}
              {g.items.map((i) => (
                <MenuRadioItem key={i.view.id} value={i.view.id}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {i.view.favorite && (
                        <Star className="!size-3 shrink-0 fill-current !text-warning" />
                      )}
                      <span className="truncate">{i.label}</span>
                    </span>
                    {i.description && (
                      <span className="block text-sm text-faint">{i.description}</span>
                    )}
                  </span>
                </MenuRadioItem>
              ))}
            </Fragment>
          ))}
        </MenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-1.5 text-base font-medium transition-colors",
        active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
