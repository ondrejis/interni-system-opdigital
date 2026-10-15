import type { FilterGroup } from "@rebar/core/shared";
import type { SavedViewInfo, ViewLayout, ViewMeta } from "@rebar/ui";
import { HOSTING_VIEW_NAMES } from "../seed";

/** Výchozí pohled „Aktuální“: aktivní a pozastavené služby (zrušené jsou v pohledu Zrušené). */
export const HOSTING_DEFAULT_FILTER: FilterGroup = {
  op: "and",
  conditions: [{ attr: "status", op: "is_any_of", value: ["active", "paused"] }],
};

const BY_NAME: Record<string, ViewMeta> = {
  [HOSTING_VIEW_NAMES.renewal]: { group: "hosting", pinned: true },
  [HOSTING_VIEW_NAMES.byClient]: { group: "hosting", pinned: true },
  [HOSTING_VIEW_NAMES.canceled]: { group: "hosting", pinned: true },
};

/** Uspořádání pohledů hostingu: Obnova do 30 dní, Podle klienta a Zrušené jako záložky vedle výchozího „Aktuální“. */
export const HOSTING_VIEW_LAYOUT: ViewLayout = {
  groups: [{ id: "hosting", label: "Hosting a údržba" }],
  maxPinned: 4,
  meta: (v: SavedViewInfo) => (v.shared ? BY_NAME[v.name] : undefined),
};
