import type { SavedViewInfo } from "./api";

/** Skupina uložených pohledů v nabídce pohledů (pořadí skupin určuje pořadí v poli `ViewLayout.groups`). */
export type ViewGroupDef = { id: string; label: string; hint?: string };

/** Zařazení jednoho uloženého pohledu: skupina, krátký popis, kratší název do nabídky a zda je mezi viditelnými záložkami. */
export type ViewMeta = {
  group: string;
  description?: string;
  /** Název v nabídce, když skupina už říká, o co jde (např. „Čištění: bez úpravy 90 dní“ → „Bez úpravy 90 dní“). */
  label?: string;
  pinned?: boolean;
};

/**
 * Uspořádání pohledů seznamu: nejčastější jsou záložky, ostatní jedna nabídka po skupinách. Bez tohoto nastavení
 * zůstává pás záložek se všemi pohledy.
 */
export type ViewLayout = {
  groups: readonly ViewGroupDef[];
  /** Zařazení pohledu podle názvu a vlastnictví; `undefined` = nezařazený (spadne do „Moje pohledy“ / „Sdílené pohledy“). */
  meta: (view: SavedViewInfo) => ViewMeta | undefined;
  /** Nejvíc viditelných záložek kromě výchozího pohledu (výchozí 3). */
  maxPinned?: number;
};

export const MINE_GROUP: ViewGroupDef = { id: "__mine", label: "Moje pohledy" };
export const SHARED_GROUP: ViewGroupDef = { id: "__shared", label: "Sdílené pohledy" };

/** Pohled v nabídce: název k zobrazení (může být kratší než název pohledu) a volitelný popis. */
export type ResolvedItem = { view: SavedViewInfo; label: string; description?: string };
/** Skupina pohledů v nabídce spolu se svými položkami. */
export type ResolvedGroup = ViewGroupDef & { items: ResolvedItem[] };
/** Výsledek `resolveViews`: viditelné záložky a skupiny pro nabídku s počtem skrytých. */
export type ResolvedViews = {
  /** Pohledy viditelné jako záložky (kromě výchozího „Všechny“). */
  pinned: SavedViewInfo[];
  groups: ResolvedGroup[];
  /** Kolik pohledů je jen v nabídce (nejsou záložkou). */
  hidden: number;
  /** Aktuální pohled, pokud není záložkou. */
  hiddenCurrent: SavedViewInfo | null;
};

/** Rozdělí uložené pohledy na viditelné záložky a skupiny pro nabídku. Nezařazené pohledy jdou do „Moje“ a „Sdílené“. */
export function resolveViews(
  views: readonly SavedViewInfo[],
  layout: ViewLayout,
  currentId: string | null,
): ResolvedViews {
  const max = layout.maxPinned ?? 3;
  const metas = views.map((v) => ({ view: v, meta: layout.meta(v) }));
  const wanted = metas.filter((m) => m.meta?.pinned || (!m.meta && m.view.favorite));
  const pinnedIds = new Set(wanted.slice(0, max).map((m) => m.view.id));
  const pinned = views.filter((v) => pinnedIds.has(v.id));

  const known = new Map<string, ResolvedGroup>(
    layout.groups.map((g) => [g.id, { ...g, items: [] }]),
  );
  const mine: ResolvedGroup = { ...MINE_GROUP, items: [] };
  const shared: ResolvedGroup = { ...SHARED_GROUP, items: [] };
  for (const { view, meta } of metas) {
    const item: ResolvedItem = {
      view,
      label: meta?.label ?? view.name,
      ...(meta?.description ? { description: meta.description } : {}),
    };
    const target = (meta && known.get(meta.group)) || (view.mine ? mine : shared);
    target.items.push(item);
  }
  const groups = [...known.values(), mine, shared].filter((g) => g.items.length > 0);
  const hiddenCurrent = currentId
    ? (views.find((v) => v.id === currentId && !pinnedIds.has(v.id)) ?? null)
    : null;
  return { pinned, groups, hidden: views.length - pinned.length, hiddenCurrent };
}
