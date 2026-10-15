import type {
  EntityDescriptor,
  FilterGroup,
  GroupSummary,
  Labels,
  QueryPage,
  QueryParams,
  RecordRow,
} from "@rebar/core/shared";
import type { Lookups, ViewConfig } from "./types";

export type SavedViewInfo = {
  id: string;
  name: string;
  shared: boolean;
  mine: boolean;
  favorite: boolean;
  config: ViewConfig;
};

export type RecordResult = { row: RecordRow; labels: Labels };

export type TimelineItem =
  | {
      kind: "audit";
      id: string;
      at: string;
      actor: string;
      action: string;
      summary: string | null;
      changes: { field: string; old: unknown; new: unknown }[];
    }
  | {
      kind: "comment";
      id: string;
      at: string;
      actor: string;
      actorId: string;
      body: string;
      edited: boolean;
    };

export type FileItem = {
  id: string;
  fileId: string;
  name: string;
  mime: string;
  size: number;
  kind: string | null;
  width: number | null;
  height: number | null;
  hasThumb: boolean;
  createdAt: string;
};

export type ActivityResult = { timeline: TimelineItem[]; files: FileItem[] };

/**
 * Vše, co data-driven UI potřebuje od serveru. Komponenty ve `@rebar/ui` neznají Next.js ani server actions;
 * aplikace jim tohle rozhraní dodá (server actions, v testech atrapa). Chyby se hlásí výjimkou s čitelnou hláškou.
 */
export type EntityApi = {
  /** Popis entity (atributy, stavy, oprávnění) pro vložené seznamy. */
  describe(entity: string): Promise<EntityDescriptor>;
  query(entity: string, params: QueryParams): Promise<QueryPage>;
  groups(entity: string, group: string, params: QueryParams): Promise<GroupSummary[]>;
  get(entity: string, id: string): Promise<RecordResult>;
  create(entity: string, values: Record<string, unknown>): Promise<RecordResult>;
  update(
    entity: string,
    id: string,
    patch: Record<string, unknown>,
    expectedUpdatedAt?: string,
  ): Promise<RecordResult>;
  remove(entity: string, ids: string[]): Promise<void>;
  restore(entity: string, ids: string[]): Promise<void>;
  lookups: Lookups;
  /** Adresa záznamu v aplikaci (odkazy mezi záznamy); `null`, když pro daný typ stránka není. */
  hrefFor(entity: string, id: string): string | null;
  /** Příkaz modulu (`<modul>.<akce>`): pojmenovaná akce nebo dotaz na serveru. */
  command<I = unknown, O = unknown>(name: string, input?: I): Promise<O>;
  /** Kdo je přihlášen (smí mazat vlastní komentáře). */
  me: { id: string; name: string };
  activity(entity: string, id: string): Promise<ActivityResult>;
  addComment(entity: string, id: string, body: string): Promise<void>;
  deleteComment(id: string): Promise<void>;
  /** Nahraje soubor k záznamu a vrátí jeho id; `kind` rozlišuje fotky, podpisy a dokumenty. */
  uploadFile(
    entity: string,
    id: string,
    file: File,
    opts?: { kind?: string; takenAt?: string },
  ): Promise<{ id: string }>;
  detachFile(attachmentId: string): Promise<void>;
  /** Šablony exportů; bez nich export dialog šablony nenabízí. */
  exports?: {
    templates(entity: string): Promise<ExportTemplateInfo[]>;
    saveTemplate(t: {
      name: string;
      shared: boolean;
      spec: ExportTemplateInfo["spec"];
    }): Promise<{ id: string }>;
    deleteTemplate(id: string): Promise<void>;
  };
  views: {
    list(entity: string): Promise<SavedViewInfo[]>;
    save(
      entity: string,
      v: { name: string; shared: boolean; config: ViewConfig },
    ): Promise<{ id: string }>;
    update(
      entity: string,
      id: string,
      v: { name?: string; shared?: boolean; config?: ViewConfig },
    ): Promise<void>;
    remove(id: string): Promise<void>;
    favorite(id: string, favorite: boolean): Promise<void>;
  };
};

/** Šablona exportu (uložená sada sloupců a filtrů). */
export type ExportTemplateInfo = {
  id: string;
  name: string;
  shared: boolean;
  mine: boolean;
  ownerName: string;
  spec: {
    entity: string;
    format: "xlsx" | "csv" | "pdf";
    scope: "view" | "all";
    columns?: string[] | undefined;
    query?:
      | {
          filters?: FilterGroup | undefined;
          sort?: { attr: string; dir: "asc" | "desc" }[] | undefined;
          q?: string | undefined;
        }
      | undefined;
    fileName?: string | undefined;
  };
};

export type EntityContext = { entity: EntityDescriptor; api: EntityApi };

/** Chyba z `ActionResult` jako výjimka — TanStack Query a toasty s ní umí pracovat. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}
