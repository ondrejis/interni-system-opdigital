import type {
  AttributeDescriptor,
  Condition,
  FilterGroup,
  Labels,
  QueryParams,
} from "@rebar/core/shared";
import type { ComboOption } from "../components/combobox";

export type { AttributeDescriptor, Condition, FilterGroup, Labels, QueryParams };

/** Načítání možností pro výběr uživatele a odkazovaného záznamu (provádí aplikace přes server). */
export type Lookups = {
  records: (entity: string, q: string) => Promise<ComboOption[]>;
  users: (q: string) => Promise<ComboOption[]>;
};

export type ViewConfig = {
  viewType: "table" | "kanban";
  filters?: FilterGroup | undefined;
  sort?: { attr: string; dir: "asc" | "desc" }[] | undefined;
  group?: string | null | undefined;
  columns?: string[] | undefined;
  columnWidths?: Record<string, number> | undefined;
  cardAttributes?: string[] | undefined;
};
