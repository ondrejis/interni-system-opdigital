"use client";

import {
  Clipboard,
  ExternalLink,
  HardDrive,
  Keyboard,
  Mail,
  Moon,
  Phone,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CommandPalette,
  type PaletteGroup,
  type PaletteItem,
  type PaletteRowAction,
} from "../components/command-palette";
import { successToast } from "../components/toast";
import { useCan, useModuleUi } from "../data/module-ui";
import { Icon } from "../lib/icons";
import { useNav } from "../nav";
import {
  coveredByModuleAction,
  createCommand,
  groupHits,
  hitActions,
  hitSubtitle,
  topCommands,
  type HitAction,
  type PaletteHit,
} from "./logic";
import { bumpUsage, readUsage } from "./usage";

/** Naposledy otevřený záznam (z `recent_record`). */
export type PaletteRecent = {
  entityType: string;
  id: string;
  title: string;
  label: string;
  url: string;
};

/** Vstupy palety Cmd+K: navigace, entity k zakládání, funkce hledání a nedávných záznamů. */
export type PaletteHostProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Položky navigace (Přejít na…). */
  navItems: { href: string; label: string; icon: string }[];
  /** Entity, které aktér smí zakládat (příkazy „Nový …“). */
  creatable: { key: string; label: string; listPath: string }[];
  /** Akce otevřeného záznamu (registrované přes `usePaletteActions`). */
  contextual?: PaletteItem[];
  /** Hledání na serveru (respektuje viditelnost). */
  search: (q: string) => Promise<PaletteHit[]>;
  /** Posledních 8 otevřených záznamů. */
  recent: () => Promise<PaletteRecent[]>;
  onHelp: () => void;
};

/** Přepne světlý a tmavý vzhled stejně jako přepínač v navigaci (`data-theme` a `localStorage`). */
function toggleTheme() {
  const root = document.documentElement;
  const current =
    root.getAttribute("data-theme") ??
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* bez uložení */
  }
}

const ACTION_ICON: Record<HitAction["kind"], React.ReactNode> = {
  call: <Phone />,
  copy: <Clipboard />,
  mail: <Mail />,
  drive: <HardDrive />,
};

/**
 * Paleta Cmd+K nad daty aplikace: příkazy z `paletteActions` zapnutých modulů (podle oprávnění), „Nový …“ pro entity,
 * které modul nedeklaroval, Přejít na…, Přepnout téma; nálezy ze serveru seskupené podle typu s podtitulkem a akcemi
 * (zavolat, zkopírovat telefon, napsat e-mail, otevřít Disk); bez zadání nedávné záznamy a nejčastější příkazy.
 */
export function PaletteHost(p: PaletteHostProps) {
  const nav = useNav();
  const can = useCan();
  const modules = useModuleUi();
  const [recent, setRecent] = useState<PaletteRecent[]>([]);
  const [usage, setUsage] = useState(readUsage);

  useEffect(() => {
    if (!p.open) return;
    setUsage(readUsage());
    let cancelled = false;
    p.recent()
      .then((r) => !cancelled && setRecent(r))
      .catch(() => !cancelled && setRecent([]));
    return () => {
      cancelled = true;
    };
    // `p.recent` je stabilní
  }, [p.open]);

  const commands = useMemo<PaletteItem[]>(() => {
    const moduleActions = [...modules.values()]
      .flatMap((m) => m.paletteActions ?? [])
      .filter((a) => can(a.permission));
    const hrefs = moduleActions.map((a) => a.href);
    const fromModules = moduleActions.map((a): PaletteItem => ({
      id: `cmd:${a.id}`,
      label: a.label,
      ...(a.keywords ? { keywords: a.keywords } : {}),
      icon: <Icon name={a.icon ?? "plus"} className="size-4" />,
      onSelect: () => {
        if (a.href) nav.push(a.href);
        else void a.run?.({ push: nav.push });
      },
    }));
    const declared = new Set(moduleActions.map((a) => a.label.toLowerCase()));
    const generic = p.creatable.flatMap((c): PaletteItem[] => {
      const cmd = createCommand(c.key, c.label);
      if (!cmd || coveredByModuleAction(c.listPath, hrefs) || declared.has(cmd.label.toLowerCase()))
        return [];
      return [
        {
          id: `new:${c.key}`,
          label: cmd.label,
          keywords: cmd.keywords,
          icon: <Plus className="size-4" />,
          onSelect: () => nav.push(`${c.listPath}?novy=1`),
        },
      ];
    });
    return [
      ...fromModules,
      ...generic,
      {
        id: "theme",
        label: "Přepnout téma",
        keywords: "tmavý světlý vzhled režim dark light",
        icon: <Moon className="size-4" />,
        onSelect: toggleTheme,
      },
      {
        id: "shortcuts",
        label: "Klávesové zkratky",
        shortcut: "?",
        icon: <Keyboard className="size-4" />,
        onSelect: p.onHelp,
      },
    ];
  }, [modules, can, p.creatable, p.onHelp, nav]);

  const groups = useMemo<PaletteGroup[]>(
    () => [
      ...(p.contextual?.length ? [{ heading: "Tento záznam", items: p.contextual }] : []),
      { heading: "Příkazy", items: commands },
      {
        heading: "Přejít na",
        items: p.navItems.map((n) => ({
          id: `nav:${n.href}`,
          label: `Přejít na ${n.label}`,
          keywords: n.label,
          icon: <Icon name={n.icon} className="size-4" />,
          onSelect: () => nav.push(n.href),
        })),
      },
    ],
    [p.contextual, p.navItems, commands, nav],
  );

  const idleGroups = useMemo<PaletteGroup[]>(
    () => [
      ...(recent.length
        ? [
            {
              heading: "Naposledy otevřené",
              items: recent.map((r): PaletteItem => ({
                id: `recent:${r.entityType}:${r.id}`,
                label: r.title || "Bez názvu",
                hint: r.label,
                onSelect: () => nav.push(r.url),
              })),
            },
          ]
        : []),
      {
        heading: "Nejčastější příkazy",
        items: topCommands(
          commands.filter((c) => c.id !== "theme" && c.id !== "shortcuts"),
          usage,
          5,
        ),
      },
    ],
    [recent, commands, usage, nav],
  );

  const search = useCallback(
    async (q: string): Promise<PaletteGroup[]> => {
      const hits = await p.search(q);
      return groupHits(hits).map((g) => ({
        heading: g.heading,
        items: g.hits.map((h): PaletteItem => {
          const sub = hitSubtitle(h);
          return {
            id: `${h.entityType}:${h.id}`,
            label: h.title,
            ...(sub ? { subtitle: sub } : {}),
            ...(h.isPrivate ? { hint: "soukromé" } : {}),
            actions: hitActions(h).map((a): PaletteRowAction => ({
              id: a.kind,
              label: a.label,
              icon: a.kind === "drive" ? <ExternalLink /> : ACTION_ICON[a.kind],
              ...(a.kind === "copy"
                ? {
                    onRun: () => {
                      void navigator.clipboard
                        ?.writeText(a.value)
                        .then(() => successToast("Telefon zkopírován."));
                    },
                  }
                : { href: a.href }),
              ...(a.kind === "drive" ? { external: true } : {}),
            })),
            onSelect: () => nav.push(h.url),
          };
        }),
      }));
    },
    // `p.search` je stabilní
    [nav],
  );

  return (
    <CommandPalette
      open={p.open}
      onOpenChange={p.onOpenChange}
      groups={groups}
      idleGroups={idleGroups}
      search={search}
      onRun={(item) =>
        item.id.startsWith("cmd:") || item.id.startsWith("new:") ? bumpUsage(item.id) : undefined
      }
    />
  );
}
