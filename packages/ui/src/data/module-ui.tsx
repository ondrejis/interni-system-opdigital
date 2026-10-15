"use client";

import type { SlotMap, SlotName } from "@rebar/core/contracts";
import type {
  AttributeDescriptor,
  EntityDescriptor,
  Labels,
  QueryParams,
  RecordRow,
  StageDescriptor,
} from "@rebar/core/shared";
import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from "react";
import type { EntityApi } from "./api";

/** Záložka na detailu záznamu, kterou nabízí modul (např. Materiál na zakázce). */
export type RecordTab = {
  id: string;
  label: string;
  /** Zobrazí se jen uživateli s některým z oprávnění (UI pohodlí; skutečná kontrola je na serveru). */
  permission?: string | readonly string[];
  render: (p: {
    entity: EntityDescriptor;
    id: string;
    row: RecordRow;
    /** Přepne detail na jinou záložku (a podzáložku) bez navigace; adresu `?tab=` aktualizuje. */
    openTab?: (tab: string, sub?: string) => void;
  }) => ReactNode;
  /**
   * Skupina (`RecordTabGroup.id`), do které záložka patří: v liště je jedna záložka skupiny a uvnitř přepínač
   * jednotlivých záložek (Rozpočet, Náklady, Fakturace…). Bez skupiny je záložka samostatná.
   */
  group?: string;
  /** Pořadí v liště nebo ve skupině (nižší dřív, výchozí 100). */
  order?: number;
  /** Název ikony z `Icon` (jen u samostatných záložek). */
  icon?: string;
  /** Záložka se ukáže jen, když funkce vrátí `true` (např. podle fáze zakázky). */
  visible?: (row: RecordRow) => boolean;
};

/** Pás pod názvem záznamu (čísla, hlavní akce podle stavu…). */
export type RecordHeader = (p: {
  entity: EntityDescriptor;
  id: string;
  row: RecordRow;
  /** Popisky vazeb (firma, kontakt, vedoucí…) pro odkazy a jména. */
  labels: Labels;
}) => ReactNode;

/**
 * Karta na Přehledu záznamu. Karty z různých modulů se skládají pod sebe (podle `order`); modul tak přidá
 * „poslední zápis z deníku“, „nespárované náklady“ apod. bez zásahu do záložky Přehled.
 */
export type RecordOverviewCard = {
  id: string;
  /** Hlavní sloupec (výchozí), nebo pravý panel pod údaji (tým, sdílení…). */
  column?: "main" | "side";
  /** Pořadí v sloupci (nižší dřív, výchozí 100). */
  order?: number;
  permission?: string | readonly string[];
  /** Karta se ukáže jen, když funkce vrátí `true` (např. podle fáze zakázky). */
  visible?: (row: RecordRow) => boolean;
  render: (p: {
    entity: EntityDescriptor;
    id: string;
    row: RecordRow;
    /** Přepne detail na záložku (a podzáložku), např. z karty „Otevřené vady“ na Realizace → Vady. */
    openTab: (tab: string, sub?: string) => void;
  }) => ReactNode;
};

/** Co dostane vlastní hlavička a vlastní Přehled pop-upu (`RecordDialogExt`). */
export type RecordDialogParts = {
  entity: EntityDescriptor;
  id: string;
  row: RecordRow;
  labels: Labels;
  /** Zavře pop-up. */
  onClose: () => void;
  /** Přepne detail na záložku (a podzáložku), např. na Rozpočet. */
  openTab: (tab: string, sub?: string) => void;
  /** Smaže záznam (vratné toastem „Zpět“) a zavře pop-up; `undefined`, když to aktér nesmí. */
  remove: (() => void) | undefined;
};

/**
 * Vlastní podoba detailu v pop-upu (`RecordDialog`, `EntityList openMode="dialog"`): modul nahradí hlavičku a Přehled
 * a omezí lištu záložek. Stránka záznamu (`/zakazky/<id>`) se tím nemění. Komponenty smějí používat hooky.
 */
export type RecordDialogExt = {
  /** Nahradí hlavičku (název, akce, pás od modulu `recordHeader`). */
  header?: ComponentType<RecordDialogParts>;
  /** Nahradí obsah záložky Přehled; vyplní celou plochu pod lištou záložek (sám řeší posouvání sloupců). */
  overview?: ComponentType<RecordDialogParts>;
  /** Jen tyto záložky v liště (id: `prehled`, `soubory`, `rozpocet`…); bez seznamu všechny. */
  tabs?: readonly string[];
};

/** Skupina záložek na detailu (jedna záložka v liště, uvnitř přepínač). */
export type RecordTabGroup = {
  id: string;
  label: string;
  icon?: string;
  /** Pořadí v liště (výchozí 100; základní záložky: Přehled 0, Aktivita 800, Úkoly 810, Soubory 820). */
  order: number;
  permission?: string | readonly string[];
  /** Skupina se ukáže jen, když funkce vrátí `true` (např. podle fáze zakázky); platí pro všechny její záložky. */
  visible?: (row: RecordRow) => boolean;
};

/** Akce v hlavičce detailu (např. „Vytvořit fakturu“, „Převést na zakázku“). */
export type RecordAction = {
  id: string;
  label: string;
  permission?: string | readonly string[];
  primary?: boolean;
  visible?: (row: RecordRow) => boolean;
  /** Pořadí v hlavičce záznamu (nižší dřív, výchozí 100; stejné pořadí = podle pořadí modulů). */
  order?: number;
  /**
   * Vlastní vykreslení místo statického tlačítka (např. tlačítko, jehož popisek se mění podle stavu). Komponenta
   * dostane záznam; `run`/`dialog` se pak nepoužijí.
   */
  render?: ComponentType<{ entity: EntityDescriptor; id: string; row: RecordRow }>;
  /** Přímá akce. Buď `run`, nebo `dialog` (okno s vlastním obsahem, např. výběr důvodu). */
  run?: (p: RecordActionContext) => void | Promise<void>;
  dialog?: {
    title: string;
    render: (p: RecordActionContext & { close: () => void }) => ReactNode;
  };
};

export type RecordActionContext = {
  entity: EntityDescriptor;
  id: string;
  row: RecordRow;
  api: EntityApi;
  push: (href: string) => void;
  refresh: () => void;
};

/** Hromadná akce nad vybranými řádky seznamu (např. „Odeslat e-mailem“ u faktur); běží v okně, které modul vykreslí sám. */
export type BulkAction = {
  id: string;
  label: string;
  permission?: string | readonly string[];
  dialog: {
    title: string;
    description?: string;
    render: (p: { ids: string[]; close: () => void; refresh: () => void }) => ReactNode;
  };
};

/** Stránka modulu mimo seznamy entit (týdenní docházka, pohyby skladu, kalendář…). */
export type ModulePage = {
  /** Shodné s `pages[].path` v manifestu. */
  path: string;
  render: (p: { rest: string[]; query: Record<string, string> }) => ReactNode;
};

/** Co dostane rozšíření karty kanbanu: řádek, popisky vazeb a výchozí tělo, které může modul doplnit. */
export type KanbanCardContext = {
  /** Klíč entity (`job`). */
  entity: string;
  row: RecordRow;
  labels: Labels;
  titleKey: string;
  attributes: AttributeDescriptor[];
  /** Atributy, které má uživatel na kartě zapnuté. */
  cardAttributes: string[];
  /** Výchozí tělo karty (název a vybrané atributy); modul ho může obalit nebo doplnit. */
  defaultBody: ReactNode;
};

/**
 * Rozšíření karty kanbanu pro jednu entitu. Vše je nepovinné; co modul nedodá, vypadá jako dřív.
 * Komponenty se vykreslují jako prvky Reactu, takže smí používat hooky (dotaz, popover…).
 * Kliky a tažení uvnitř `topRight` / `bottomRight` kartu neotevírají ani nepřesouvají; ve `footer` je to na modulu
 * (interaktivní prvky obalí `KanbanInteractive`), aby šla celá řádka patičky použít i pro text.
 */
export type KanbanCardExtension = {
  /** Nahradí tělo karty (jinak název a vybrané atributy). */
  body?: ComponentType<KanbanCardContext>;
  /**
   * „Zhnilá“ karta: karta dostane `data-rotting` a text pro čtečky (barevně ji zvýrazní modul sám, např. čipem v patičce).
   * Vrátí-li funkce text, použije se jako popisek pro čtečky.
   */
  rotting?: (row: RecordRow) => boolean | string;
  /** Slot vpravo nahoře (např. ikona další aktivity s popoverem). */
  topRight?: ComponentType<KanbanCardContext>;
  /** Slot vpravo dole. */
  bottomRight?: ComponentType<KanbanCardContext>;
  /** Patička karty přes celou šířku pod tělem (stav další aktivity, čipy). */
  footer?: ComponentType<KanbanCardContext>;
};

/** Co dostane doplňující řádek v hlavičce sloupce kanbanu (vážený součet, počet po termínu…). */
export type KanbanColumnContext = {
  entity: string;
  stage: StageDescriptor;
  /** Počet záznamů ve sloupci (celkem, ne jen načtených). */
  count: number;
  /** Načtené karty sloupce (první stránka; pro celkové součty použij vlastní dotaz s `params`). */
  rows: RecordRow[];
  /** Součty atributů označených `aggregate` za celý sloupec (jsou-li k dispozici). */
  sums: Record<string, number> | undefined;
  /** Dotaz (filtry, hledání) nástěnky bez filtru stavu; modul ho smí použít v příkazu pro vlastní agregaci. */
  params: QueryParams;
  labels: Labels;
};

/**
 * Příkaz do palety (Cmd+K), který modul nabízí („Nový obchod“, „Zapsat hodiny“…). Buď `href` (přejít), nebo `run`.
 * Vykresluje paletu C3; typ je tady, aby moduly mohly akce deklarovat hned.
 */
export type PaletteAction = {
  id: string;
  label: string;
  /** Slova navíc, podle kterých jde akci najít. */
  keywords?: string;
  /** Název ikony z `Icon`. */
  icon?: string;
  /** Akce se nabízí jen s některým z oprávnění (UI pohodlí; server kontroluje vždy). */
  permission?: string | readonly string[];
  href?: string;
  run?: (p: { push: (href: string) => void }) => void | Promise<void>;
};

/** Dlaždice přehledu, kterou kreslí modul sám (data dodává `widgets` na serveru). */
export type ModuleUi = {
  /** Podle klíče entity. */
  recordTabs?: Record<string, readonly RecordTab[]>;
  recordActions?: Record<string, readonly RecordAction[]>;
  /** Hromadné akce v seznamu podle klíče entity (zobrazí se při výběru řádků). */
  bulkActions?: Record<string, readonly BulkAction[]>;
  /** Skupiny záložek podle klíče entity; záložky se do nich řadí přes `RecordTab.group`. */
  recordTabGroups?: Record<string, readonly RecordTabGroup[]>;
  /** Pás pod názvem záznamu (čísla zakázky, hlavní akce podle fáze…); platí první nalezený modul. */
  recordHeader?: Record<string, RecordHeader>;
  /** Karty na Přehledu záznamu podle klíče entity; skládají se ze všech zapnutých modulů. */
  recordOverview?: Record<string, readonly RecordOverviewCard[]>;
  /** Rozšíření karty kanbanu podle klíče entity (tělo, „zhnilá“, sloty vpravo); platí první nalezený modul. */
  kanbanCard?: Record<string, KanbanCardExtension>;
  /** Doplňující řádek pod názvem sloupce kanbanu podle klíče entity (vážený součet); platí první nalezený modul. */
  kanbanColumnHeader?: Record<string, ComponentType<KanbanColumnContext>>;
  /**
   * Vlastní podoba detailu v pop-upu (`RecordDialog`) podle klíče entity; platí první nalezený modul. Tím se každý seznam
   * s `openMode="dialog"` (nástěnka, seznam, archiv) otevře ve stejném pop-upu; `EntityList` prop `recordDialog` ji přebije.
   */
  recordDialog?: Record<string, RecordDialogExt>;
  /** Základní záložky, které se u entity nezobrazují (`activity`, `tasks`, `files`). */
  hiddenCoreTabs?: Record<string, readonly ("activity" | "tasks" | "files")[]>;
  pages?: readonly ModulePage[];
  /** Komponenty do slotů hostitele (`<Slot name="…" />`); kontrakt props je v `SlotMap` (`@rebar/core/contracts`). */
  slots?: { [K in SlotName]?: ComponentType<SlotMap[K]> };
  /** Příkazy do palety Cmd+K. */
  paletteActions?: readonly PaletteAction[];
};

export function defineModuleUi<const U extends ModuleUi>(ui: U): U {
  return ui;
}

type Registry = {
  /** Id zapnutých modulů; vypnutý modul se nezobrazí nikde. */
  modules: ReadonlyMap<string, ModuleUi>;
  permissions: ReadonlySet<string>;
};

const Ctx = createContext<Registry>({ modules: new Map(), permissions: new Set() });

export function ModuleUiProvider({
  all,
  enabled,
  permissions,
  children,
}: {
  all: Record<string, ModuleUi>;
  enabled: readonly string[];
  permissions: readonly string[];
  children: ReactNode;
}) {
  const value = useMemo<Registry>(
    () => ({
      modules: new Map(enabled.flatMap((id) => (all[id] ? [[id, all[id]!] as const] : []))),
      permissions: new Set(permissions),
    }),
    [all, enabled, permissions],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Zda má přihlášený uživatel oprávnění (jen pro skrývání prvků UI; server kontroluje vždy). */
export function useCan() {
  const { permissions } = useContext(Ctx);
  return (key: string | readonly string[] | undefined) =>
    key === undefined || [key].flat().some((k) => permissions.has(k));
}

export function useModuleUi() {
  return useContext(Ctx).modules;
}

/** Záložka v liště detailu: samostatná záložka modulu, nebo skupina záložek s přepínačem. */
export type TopTab = {
  id: string;
  label: string;
  icon?: string;
  order: number;
  tabs: RecordTab[];
};

/** Složí lištu záložek: skupiny a samostatné záložky seřazené podle `order` (stabilně). */
export function buildTopTabs(
  tabs: readonly RecordTab[],
  groups: readonly RecordTabGroup[],
  can: (k: string | readonly string[] | undefined) => boolean,
  row?: RecordRow,
): TopTab[] {
  const out: TopTab[] = [];
  const byGroup = new Map<string, TopTab>();
  // skupina skrytá oprávněním nebo fází: její záložky se nesmí objevit ani jako samostatné
  const hiddenGroups = new Set<string>();
  for (const g of groups) {
    if (!can(g.permission) || (row && g.visible && !g.visible(row))) {
      hiddenGroups.add(g.id);
      continue;
    }
    const top: TopTab = {
      id: g.id,
      label: g.label,
      order: g.order,
      tabs: [],
      ...(g.icon ? { icon: g.icon } : {}),
    };
    byGroup.set(g.id, top);
  }
  for (const t of tabs) {
    if (t.group && hiddenGroups.has(t.group)) continue;
    const top = t.group ? byGroup.get(t.group) : undefined;
    if (top) {
      top.tabs.push(t);
    } else {
      out.push({
        id: t.id,
        label: t.label,
        order: t.order ?? 100,
        tabs: [t],
        ...(t.icon ? { icon: t.icon } : {}),
      });
    }
  }
  for (const top of byGroup.values()) {
    top.tabs.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    if (top.tabs.length) out.push(top);
  }
  return out
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.order - b.t.order || a.i - b.i)
    .map((x) => x.t);
}

/** Hromadné akce modulů pro entitu, které aktér smí použít (UI pohodlí; skutečná kontrola je na serveru). */
export function useBulkActions(entityKey: string): BulkAction[] {
  const modules = useModuleUi();
  const can = useCan();
  return useMemo(
    () =>
      [...modules.values()]
        .flatMap((ui) => ui.bulkActions?.[entityKey] ?? [])
        .filter((a) => can(a.permission)),
    [modules, entityKey, can],
  );
}

export function useRecordExtensions(entityKey: string) {
  const modules = useModuleUi();
  const can = useCan();
  return useMemo(() => {
    const tabs: RecordTab[] = [];
    const actions: RecordAction[] = [];
    const groups: RecordTabGroup[] = [];
    const cards: RecordOverviewCard[] = [];
    const hidden = new Set<string>();
    let header: RecordHeader | undefined;
    for (const ui of modules.values()) {
      tabs.push(...(ui.recordTabs?.[entityKey] ?? []));
      actions.push(...(ui.recordActions?.[entityKey] ?? []));
      groups.push(...(ui.recordTabGroups?.[entityKey] ?? []));
      cards.push(...(ui.recordOverview?.[entityKey] ?? []));
      for (const h of ui.hiddenCoreTabs?.[entityKey] ?? []) hidden.add(h);
      header ??= ui.recordHeader?.[entityKey];
    }
    const allowed = tabs.filter((t) => can(t.permission));
    return {
      tabs: allowed,
      topTabs: (row?: RecordRow) =>
        buildTopTabs(
          allowed.filter((t) => !row || !t.visible || t.visible(row)),
          groups,
          can,
          row,
        ),
      actions: actions
        .filter((a) => can(a.permission))
        .map((a, i) => ({ a, i }))
        .sort((x, y) => (x.a.order ?? 100) - (y.a.order ?? 100) || x.i - y.i)
        .map((x) => x.a),
      overviewCards: (row?: RecordRow) =>
        cards
          .filter((c) => can(c.permission) && (!row || !c.visible || c.visible(row)))
          .map((c, i) => ({ c, i }))
          .sort((a, b) => (a.c.order ?? 100) - (b.c.order ?? 100) || a.i - b.i)
          .map((x) => x.c),
      header,
      hiddenCore: hidden as ReadonlySet<"activity" | "tasks" | "files">,
    };
  }, [modules, entityKey, can]);
}

/** Vlastní podoba pop-upu od zapnutých modulů pro entitu (první nalezená vyhrává). */
export function useRecordDialogExt(entityKey: string): RecordDialogExt | undefined {
  const modules = useModuleUi();
  return useMemo(() => {
    for (const ui of modules.values()) {
      const hit = ui.recordDialog?.[entityKey];
      if (hit) return hit;
    }
    return undefined;
  }, [modules, entityKey]);
}

/** Rozšíření kanbanu od zapnutých modulů pro entitu (první nalezené vyhrává, jako u `recordHeader`). */
export function useKanbanExtensions(entityKey: string): {
  card: KanbanCardExtension | undefined;
  columnHeader: ComponentType<KanbanColumnContext> | undefined;
} {
  const modules = useModuleUi();
  return useMemo(() => {
    let card: KanbanCardExtension | undefined;
    let columnHeader: ComponentType<KanbanColumnContext> | undefined;
    for (const ui of modules.values()) {
      card ??= ui.kanbanCard?.[entityKey];
      columnHeader ??= ui.kanbanColumnHeader?.[entityKey];
    }
    return { card, columnHeader };
  }, [modules, entityKey]);
}

/**
 * Složí UI oblastí modulu do jednoho `ModuleUi`. Mapy podle klíče entity se spojují (pole se zřetězí; u hlaviček
 * a hlaviček sloupců platí první oblast, která je dodá; karta kanbanu se skládá pole po poli), stránky a příkazy
 * palety se přidají za sebe.
 */
export function mergeModuleUi(...parts: ModuleUi[]): ModuleUi {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (value === undefined) continue;
      const current = out[key];
      if (current === undefined) {
        out[key] = Array.isArray(value) ? [...value] : { ...(value as object) };
      } else if (Array.isArray(value)) {
        out[key] = [...(current as unknown[]), ...value];
      } else {
        const merged = { ...(current as Record<string, unknown>) };
        for (const [entity, item] of Object.entries(value as Record<string, unknown>)) {
          const existing = merged[entity];
          merged[entity] =
            Array.isArray(item) && Array.isArray(existing)
              ? [...existing, ...item]
              : key === "kanbanCard" && existing
                ? { ...(item as object), ...(existing as object) } // karta: pole po poli, první oblast má přednost
                : (existing ?? item);
        }
        out[key] = merged;
      }
    }
  }
  return out as ModuleUi;
}

/**
 * Komponenty všech zapnutých modulů pro slot hostitele (v pořadí modulů). Hostitel o přispěvatelích neví; bez
 * přispěvatele je výsledek prázdný.
 */
export function useSlotComponents<K extends SlotName>(name: K): ComponentType<SlotMap[K]>[] {
  const modules = useModuleUi();
  return useMemo(
    () =>
      [...modules.values()].flatMap((ui) => {
        const c = ui.slots?.[name];
        return c ? [c as ComponentType<SlotMap[K]>] : [];
      }),
    [modules, name],
  );
}

/** Vykreslí komponenty, které moduly přispěly do slotu `name`, se stejnými props: `<Slot name="task.dialog.extras" taskId={id} />`. */
export function Slot<K extends SlotName>({ name, ...props }: { name: K } & SlotMap[K]): ReactNode {
  const parts = useSlotComponents(name);
  return (
    <>
      {parts.map((C, i) => {
        const Part = C as ComponentType<Record<string, unknown>>;
        return <Part key={i} {...(props as Record<string, unknown>)} />;
      })}
    </>
  );
}

export function findModulePage(
  modules: ReadonlyMap<string, ModuleUi>,
  path: string,
): ModulePage | undefined {
  for (const ui of modules.values()) {
    const hit = ui.pages?.find((p) => p.path === path);
    if (hit) return hit;
  }
  return undefined;
}
