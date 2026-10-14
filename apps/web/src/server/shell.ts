import "server-only";
import { collectNav } from "@rebar/core";
import { listMyTasks, unreadCount } from "@rebar/core/collab";
import { listViews } from "@rebar/core/views";
import { can, scopeOf } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import type { NavItem } from "@rebar/core";
import { getServices } from "./services";

export type ShellNavItem = {
  href: string;
  label: string;
  icon: string;
  count?: number;
  /** Vedlejší stránky modulu; v panelu se rozbalí pod touto položkou. */
  children?: ShellNavItem[];
};
export type ShellData = {
  top: ShellNavItem[];
  sections: { heading?: string; items: ShellNavItem[] }[];
  /** Typ záznamu → adresa seznamu (odkazy mezi záznamy, paleta). */
  entityPaths: Record<string, string>;
  /** Entity, které smí aktér zakládat (akce „Nový…“ v paletě). */
  creatable: { key: string; label: string; listPath: string }[];
  /** Položky spodní lišty mobilní navigace (z manifestů, `bottom: true`; jen co uživatel smí vidět). */
  bottom: ShellNavItem[];
  /** Id zapnutých modulů a oprávnění přihlášeného (UI skrývá prvky; server kontroluje vždy). */
  enabledModules: string[];
  permissions: string[];
};

/** Navigace podle zapnutých modulů a oprávnění aktéra, počty v Inboxu a oblíbené pohledy. */
export async function loadShell(ctx: Ctx): Promise<ShellData> {
  const { runtime, registry } = getServices();
  const [unread, tasks] = await Promise.all([unreadCount(ctx), listMyTasks(ctx)]);

  const nav = collectNav(runtime.modules).filter(
    (n) => n.permission === undefined || [n.permission].flat().some((p) => can(ctx, p)),
  );

  const entities = registry.all().filter((e) => scopeOf(ctx, e.permissions.read) !== null);
  const favorites = (
    await Promise.all(
      entities.map(async (e) =>
        (await listViews(ctx, e)).filter((v) => v.favorite).map((v) => ({ v, e })),
      ),
    )
  ).flat();

  const sections: ShellData["sections"] = groupNav(nav, runtime.config.navigation.groupOrder);
  if (favorites.length)
    sections.push({
      heading: "Pohledy",
      items: favorites.map(({ v, e }) => ({
        href: `${e.listPath}?pohled=${v.id}`,
        label: `${v.name} · ${e.label.many}`,
        icon: "star",
      })),
    });

  return {
    enabledModules: runtime.modules.map((m) => m.id),
    permissions: [...ctx.actor.permissions.keys()],
    bottom: nav
      .filter((n) => n.bottom)
      .slice(0, 3)
      .map((n) => ({ href: n.href, label: n.label, icon: n.icon })),
    top: [
      { href: "/inbox", label: "Inbox", icon: "inbox", count: unread },
      { href: "/ukoly", label: "Moje úkoly", icon: "check-square", count: tasks.length },
    ],
    sections,
    entityPaths: Object.fromEntries(registry.all().map((e) => [e.key, e.listPath])),
    creatable: entities
      .filter((e) => scopeOf(ctx, e.permissions.create ?? e.permissions.write) !== null)
      .map((e) => ({ key: e.key, label: e.label.one, listPath: e.listPath })),
  };
}

const DEFAULT_GROUP = "Moduly";

/** Rozdělí položky modulů do sekcí a vedlejší stránky (`parent`) zanoří pod hlavní položku modulu. */
export function groupNav(
  nav: readonly NavItem[],
  groupOrder: readonly string[] = [],
): ShellData["sections"] {
  const byHref = new Map<string, ShellNavItem>();
  const roots: { group: string; item: ShellNavItem }[] = [];
  for (const n of nav) {
    const item: ShellNavItem = { href: n.href, label: n.label, icon: n.icon };
    byHref.set(n.href, item);
  }
  for (const n of nav) {
    const item = byHref.get(n.href)!;
    const parent = n.parent ? byHref.get(n.parent) : undefined;
    if (parent) (parent.children ??= []).push(item);
    else roots.push({ group: n.group ?? DEFAULT_GROUP, item });
  }
  const groups = [...new Set(roots.map((r) => r.group))].sort((a, b) => {
    const ia = groupOrder.indexOf(a);
    const ib = groupOrder.indexOf(b);
    return (ia < 0 ? groupOrder.length : ia) - (ib < 0 ? groupOrder.length : ib);
  });
  return groups.map((heading) => ({
    heading,
    items: roots.filter((r) => r.group === heading).map((r) => r.item),
  }));
}
