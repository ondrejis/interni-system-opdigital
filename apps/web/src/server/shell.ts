import "server-only";
import { collectNav } from "@rebar/core";
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
  /** Barva odznaku s počtem (`navBadges` modulů). */
  tone?: "warning" | "danger";
  /** Vedlejší stránky modulu; v panelu se rozbalí pod touto položkou. */
  children?: ShellNavItem[];
};
export type ShellData = {
  top: ShellNavItem[];
  /** Patička panelu nad Nastavením (Historie, Koš). */
  footer: ShellNavItem[];
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
  const { runtime, registry, collected, moduleDeps } = getServices();

  const nav = collectNav(runtime.modules).filter(
    (n) => n.permission === undefined || [n.permission].flat().some((p) => can(ctx, p)),
  );
  // odznaky modulů (po termínu, kritické domény…): chyba jednoho odznaku nesmí shodit celou navigaci
  const badges = new Map<string, { count: number; tone: "warning" | "danger" }>();
  await Promise.all(
    collected.navBadges
      .filter((b) => nav.some((n) => n.href === b.href))
      .map(async (b) => {
        try {
          const count = await b.count(ctx, moduleDeps);
          if (count > 0) badges.set(b.href, { count, tone: b.tone });
        } catch {
          /* odznak se nezobrazí */
        }
      }),
  );

  const entities = registry.all().filter((e) => scopeOf(ctx, e.permissions.read) !== null);
  const favorites = (
    await Promise.all(
      entities.map(async (e) =>
        (await listViews(ctx, e)).filter((v) => v.favorite).map((v) => ({ v, e })),
      ),
    )
  ).flat();

  const sections: ShellData["sections"] = groupNav(
    nav,
    runtime.config.navigation.groupOrder,
    badges,
  );
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
    // OPSYS nemá upozornění ani Inbox; „Moje úkoly“ je položka modulu `ukoly`
    top: [],
    footer: FOOTER.filter((f) => can(ctx, f.permission)).map(({ permission: _p, ...item }) => item),
    sections,
    entityPaths: Object.fromEntries(registry.all().map((e) => [e.key, e.listPath])),
    creatable: entities
      .filter((e) => scopeOf(ctx, e.permissions.create ?? e.permissions.write) !== null)
      .map((e) => ({ key: e.key, label: e.label.one, listPath: e.listPath })),
  };
}

const DEFAULT_GROUP = "Moduly";
/** Výchozí pořadí položky v sekci, když manifest nemá `order`. */
const DEFAULT_ORDER = 100;

/** Pevná patička panelu (stránky platformy): historie změn a koš. Zobrazí se podle oprávnění. */
const FOOTER: (ShellNavItem & { permission: string })[] = [
  { href: "/historie", label: "Historie", icon: "history", permission: "activity.read" },
  { href: "/kos", label: "Koš", icon: "trash", permission: "trash.read" },
];

/** Rozdělí položky modulů do sekcí a vedlejší stránky (`parent`) zanoří pod hlavní položku modulu. */
export function groupNav(
  nav: readonly NavItem[],
  groupOrder: readonly string[] = [],
  badges: ReadonlyMap<string, { count: number; tone: "warning" | "danger" }> = new Map(),
): ShellData["sections"] {
  const byHref = new Map<string, ShellNavItem>();
  const roots: { group: string; item: ShellNavItem; order: number; index: number }[] = [];
  for (const n of nav) {
    const badge = badges.get(n.href);
    const item: ShellNavItem = {
      href: n.href,
      label: n.label,
      icon: n.icon,
      ...(badge ? { count: badge.count, tone: badge.tone } : {}),
    };
    byHref.set(n.href, item);
  }
  nav.forEach((n, index) => {
    const item = byHref.get(n.href)!;
    const parent = n.parent ? byHref.get(n.parent) : undefined;
    if (parent) (parent.children ??= []).push(item);
    else
      roots.push({ group: n.group ?? DEFAULT_GROUP, item, order: n.order ?? DEFAULT_ORDER, index });
  });
  // v sekci podle `order`, při shodě podle pořadí modulů (stabilně)
  roots.sort((a, b) => a.order - b.order || a.index - b.index);
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
