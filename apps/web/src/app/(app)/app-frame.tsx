"use client";

import {
  AppShell,
  EntityApiProvider,
  PaletteActionsProvider,
  PaletteHost,
  ModuleUiProvider,
  RealtimeBridge,
  ShortcutsDialog,
  useHotkeys,
  useNav,
  useUndoShortcut,
  type PaletteItem,
  type ShortcutGroup,
} from "@rebar/ui";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { makeEntityApi } from "@/lib/entity-api";
import { paletteRecent, paletteSearch } from "@/server/palette-actions";
import { authClient } from "@/lib/auth-client";
import type { ShellData } from "@/server/shell";
import { MODULE_UI } from "@/modules-ui";
import { MobileBottomNav } from "./mobile-nav";

type Props = {
  brand: { name: string; logoUrl: string | null };
  user: { id: string; name: string; roleName: string };
  shell: ShellData;
  children: ReactNode;
};

/** Přechod „g + písmeno“ (přehled, obchody, kontakty, zakázky, úkoly, finance, historie). */
const GO_KEYS: Record<string, string> = {
  p: "/prehled",
  o: "/obchody",
  k: "/kontakty",
  z: "/zakazky",
  u: "/ukoly",
  f: "/finance",
  h: "/historie",
};

const SHORTCUTS: ShortcutGroup[] = [
  {
    heading: "Obecné",
    items: [
      { keys: ["Ctrl/⌘", "K"], label: "Hledání a příkazy" },
      { keys: ["Ctrl/⌘", "Z"], label: "Vrátit poslední smazání nebo hromadnou změnu (10 s)" },
      { keys: ["?"], label: "Přehled zkratek" },
      { keys: ["g", "p"], label: "Přejít na Přehled (g o obchody, g k kontakty, g z zakázky)" },
      { keys: ["g", "u"], label: "Přejít na úkoly (g f finance, g h historie)" },
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

  useUndoShortcut();

  const search = useCallback(async (q: string) => {
    const res = await paletteSearch({ q });
    return res.ok ? res.data : [];
  }, []);
  const recent = useCallback(async () => {
    const res = await paletteRecent({});
    return res.ok ? res.data : [];
  }, []);
  const onHelp = useCallback(() => setHelp(true), []);

  const navItems = useMemo(
    () =>
      [
        ...shell.top,
        ...shell.sections.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])])),
      ].map((n) => ({ href: n.href, label: n.label, icon: n.icon })),
    [shell],
  );

  // Cmd/Ctrl+K, ? a „g + písmeno“ pro přechod na modul (jen na položky, které v navigaci jsou)
  const goKeys = useMemo(() => {
    const target = (href: string) =>
      href === "/historie"
        ? href
        : navItems.find((n) => n.href === href || n.href.startsWith(`${href}/`))?.href;
    return Object.fromEntries(
      Object.entries(GO_KEYS).flatMap(([k, href]) => {
        const to = target(href);
        return to ? [[`g ${k}`, () => nav.push(to)] as const] : [];
      }),
    );
  }, [navItems, nav]);
  useHotkeys({ "mod+k": () => setPalette((p) => !p), "?": () => setHelp(true), ...goKeys });

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
        <PaletteHost
          open={palette}
          onOpenChange={setPalette}
          navItems={navItems}
          creatable={shell.creatable}
          contextual={contextual}
          search={search}
          recent={recent}
          onHelp={onHelp}
        />
        {/* změna u druhého uživatele je vidět do 2 s; serverově vykreslený Přehled se obnoví router.refresh */}
        <RealtimeBridge
          onChange={() => {
            if (pathname === "/prehled" || pathname === "/") router.refresh();
          }}
        />
        <ShortcutsDialog open={help} onOpenChange={setHelp} groups={SHORTCUTS} />
      </ModuleUiProvider>
    </EntityApiProvider>
  );
}
