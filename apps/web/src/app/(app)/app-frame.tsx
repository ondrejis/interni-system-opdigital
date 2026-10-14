"use client";

import {
  AppShell,
  CommandPalette,
  EntityApiProvider,
  Icon,
  PaletteActionsProvider,
  ModuleUiProvider,
  ShortcutsDialog,
  useHotkeys,
  useNav,
  type PaletteGroup,
  type PaletteItem,
  type ShortcutGroup,
} from "@rebar/ui";
import { Keyboard, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { makeEntityApi } from "@/lib/entity-api";
import { searchEntities } from "@/server/entity-actions";
import { authClient } from "@/lib/auth-client";
import type { ShellData } from "@/server/shell";
import { MODULE_UI } from "@/modules-ui";
import { MobileBottomNav } from "./mobile-nav";
import { readRecent } from "./recent";

type Props = {
  brand: { name: string; logoUrl: string | null };
  user: { id: string; name: string; roleName: string };
  shell: ShellData;
  children: ReactNode;
};

const SHORTCUTS: ShortcutGroup[] = [
  {
    heading: "Obecné",
    items: [
      { keys: ["Ctrl/⌘", "K"], label: "Hledání a příkazy" },
      { keys: ["?"], label: "Přehled zkratek" },
      { keys: ["g", "u"], label: "Přejít na Moje úkoly" },
    ],
  },
  {
    heading: "Seznamy",
    items: [
      { keys: ["c"], label: "Nový záznam" },
      { keys: ["/"], label: "Hledat v seznamu" },
      { keys: ["Esc"], label: "Zrušit výběr" },
    ],
  },
  {
    heading: "Tabulka",
    items: [
      { keys: ["↑", "↓", "←", "→"], label: "Pohyb mezi buňkami" },
      { keys: ["Enter"], label: "Upravit buňku" },
      { keys: ["Tab"], label: "Uložit a na další buňku" },
      { keys: ["Esc"], label: "Zrušit úpravu" },
      { keys: ["Mezerník"], label: "Vybrat řádek" },
      { keys: ["Shift", "Enter"], label: "Otevřít záznam" },
      { keys: ["písmeno"], label: "Přepsat hodnotu v buňce" },
    ],
  },
  {
    heading: "Nástěnka (kanban)",
    items: [
      { keys: ["↑", "↓", "←", "→"], label: "Pohyb mezi kartami" },
      { keys: ["Enter"], label: "Otevřít kartu" },
      { keys: ["A"], label: "Naplánovat aktivitu (nástěnka CRM)" },
      { keys: ["W"], label: "Označit jako vyhranou (nástěnka CRM)" },
      { keys: ["L"], label: "Označit jako prohranou (nástěnka CRM)" },
    ],
  },
  { heading: "Formuláře", items: [{ keys: ["Ctrl/⌘", "Enter"], label: "Odeslat / uložit" }] },
];

export function AppFrame(props: Props) {
  return (
    <PaletteActionsProvider>
      {(contextual) => <AppFrameInner {...props} contextual={contextual} />}
    </PaletteActionsProvider>
  );
}

function AppFrameInner({
  brand,
  user,
  shell,
  children,
  contextual,
}: Props & { contextual: PaletteItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = useNav();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);

  const api = useMemo(
    () => makeEntityApi({ id: user.id, name: user.name }, shell.entityPaths),
    [user.id, user.name, shell.entityPaths],
  );

  useHotkeys({
    "mod+k": () => setPalette((p) => !p),
    "?": () => setHelp(true),
    "g u": () => nav.push("/ukoly"),
  });

  const search = useCallback(
    async (q: string): Promise<PaletteItem[]> => {
      const res = await searchEntities({ q });
      if (!res.ok) return [];
      return res.data.map((h) => ({
        id: `${h.entityType}:${h.id}`,
        label: h.title,
        hint: [h.label, h.subtitle].filter(Boolean).join(" · "),
        onSelect: () => nav.push(h.url),
      }));
    },
    [nav],
  );

  const groups = useMemo<PaletteGroup[]>(() => {
    const recent = palette ? readRecent() : [];
    const navItems = [
      ...shell.top,
      ...shell.sections.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])])),
    ];
    return [
      ...(contextual.length ? [{ heading: "Tento záznam", items: contextual }] : []),
      ...(recent.length
        ? [
            {
              heading: "Nedávné",
              items: recent.map((r) => ({
                id: `recent:${r.href}`,
                label: r.title,
                hint: r.label,
                onSelect: () => nav.push(r.href),
              })),
            },
          ]
        : []),
      {
        heading: "Přejít na",
        items: navItems.map((n) => ({
          id: `nav:${n.href}`,
          label: n.label,
          icon: <Icon name={n.icon} className="size-4" />,
          onSelect: () => nav.push(n.href),
        })),
      },
      {
        heading: "Akce",
        items: [
          ...shell.creatable.map((c) => ({
            id: `new:${c.key}`,
            label: `Nový záznam: ${c.label.toLowerCase()}`,
            keywords: "přidat vytvořit nový",
            icon: <Plus className="size-4" />,
            onSelect: () => nav.push(`${c.listPath}?novy=1`),
          })),
          {
            id: "shortcuts",
            label: "Klávesové zkratky",
            shortcut: "?",
            icon: <Keyboard className="size-4" />,
            onSelect: () => setHelp(true),
          },
        ],
      },
    ];
  }, [shell, palette, nav, contextual]);

  return (
    <EntityApiProvider api={api}>
      <ModuleUiProvider
        all={MODULE_UI}
        enabled={shell.enabledModules}
        permissions={shell.permissions}
      >
        <AppShell
          brand={brand}
          user={{ name: user.name, roleName: user.roleName }}
          top={shell.top}
          sections={shell.sections}
          footer={shell.footer}
          pathname={pathname}
          onSearch={() => setPalette(true)}
          onLogout={async () => {
            await authClient.signOut();
            router.replace("/prihlaseni");
            router.refresh();
          }}
          settingsHref="/nastaveni"
          securityHref="/nastaveni/zabezpeceni"
          accountHref="/nastaveni/ucet"
          bottomNav={(openMenu) => (
            <MobileBottomNav
              shell={shell}
              pathname={pathname}
              openMenu={openMenu}
              openSearch={() => setPalette(true)}
            />
          )}
        >
          {children}
        </AppShell>
        <CommandPalette open={palette} onOpenChange={setPalette} groups={groups} search={search} />
        <ShortcutsDialog open={help} onOpenChange={setHelp} groups={SHORTCUTS} />
      </ModuleUiProvider>
    </EntityApiProvider>
  );
}
