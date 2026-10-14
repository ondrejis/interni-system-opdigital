// Tvary dat oblasti Aktivity sdílené serverem a prohlížečem (jen typy a konstanty, žádné importy serveru).

/** Priorita aktivity. */
export const ACTIVITY_PRIORITIES = ["low", "normal", "high"] as const;
/** Priorita aktivity: nízká, běžná, vysoká. */
export type ActivityPriority = (typeof ACTIVITY_PRIORITIES)[number];
export const PRIORITY_LABELS: Record<ActivityPriority, string> = {
  low: "Nízká",
  normal: "Běžná",
  high: "Vysoká",
};

/** Rychlé časové filtry seznamu aktivit (`crm.activity.listMine`). */
export const ACTIVITY_RANGES = [
  "open",
  "overdue",
  "today",
  "tomorrow",
  "week",
  "nextWeek",
  "done",
] as const;
/** Rychlý časový filtr seznamu aktivit. */
export type ActivityRange = (typeof ACTIVITY_RANGES)[number];
export const RANGE_LABELS: Record<ActivityRange, string> = {
  open: "K dokončení",
  overdue: "Po termínu",
  today: "Dnes",
  tomorrow: "Zítra",
  week: "Tento týden",
  nextWeek: "Příští týden",
  done: "Hotové",
};

/** Stav aktivity vůči dnešku (pro barvu a pořadí). */
export type ActivityDueState = "done" | "overdue" | "today" | "future" | "nodate";

/** Typ aktivity (hovor, schůzka…), konfigurovatelný v Nastavení. */
export type ActivityTypeDto = {
  id: string;
  key: string;
  name: string;
  icon: string;
  defaultDurationMin: number | null;
};

/** Aktivita tak, jak ji dostane UI (jména a názvy vazeb jen z toho, co aktér smí vidět). */
export type ActivityDto = {
  id: string;
  typeId: string;
  typeKey: string;
  typeName: string;
  typeIcon: string;
  subject: string;
  /** ISO okamžik; u aktivity na celý den půlnoc pražského času. */
  dueAt: string | null;
  allDay: boolean;
  durationMin: number | null;
  priority: ActivityPriority;
  location: string | null;
  note: string | null;
  outcome: string | null;
  doneAt: string | null;
  doneById: string | null;
  doneByName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  jobId: string | null;
  jobTitle: string | null;
  jobNumber: string | null;
  companyId: string | null;
  companyName: string | null;
  personId: string | null;
  personName: string | null;
  state: ActivityDueState;
  createdAt: string;
  updatedAt: string;
};

/** Zadání nové aktivity (příkaz `crm.activity.create`, po průchodu schématem se `dueAt` posílá jako ISO text). */
export type ActivityDraft = {
  typeKey?: string;
  typeId?: string;
  subject: string;
  dueAt?: string | null;
  allDay?: boolean;
  durationMin?: number | null;
  priority?: ActivityPriority;
  location?: string | null;
  note?: string | null;
  assigneeId?: string | null;
  jobId?: string | null;
  companyId?: string | null;
  personId?: string | null;
  /** Aktivita se rovnou založí jako hotová (zalogovaný hovor). */
  done?: boolean;
  outcome?: string | null;
};

/** Návrh další aktivity po dokončení (stejný typ a vazby, předvyplněný termín). */
export type NextActivitySuggestion = {
  typeId: string;
  typeKey: string;
  subject: string;
  dueAt: string;
  allDay: boolean;
  durationMin: number | null;
  priority: ActivityPriority;
  location: string | null;
  assigneeId: string | null;
  jobId: string | null;
  companyId: string | null;
  personId: string | null;
};

/** Typ záznamu, ke kterému patří poznámka. */
export type NoteTarget = "job" | "company" | "person";

/** Poznámka u zakázky, firmy nebo osoby. */
export type NoteDto = {
  id: string;
  body: string;
  pinned: boolean;
  entityType: NoteTarget;
  entityId: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Komentář k poznámce na časové ose. */
export type NoteComment = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  edited: boolean;
};

/** Jedna změna pole v protokolu změn. */
export type TimelineChange = { field: string; old: unknown; new: unknown };

/** Jedna položka časové osy (aktivity, poznámky, komentáře, soubory a protokol změn v jednom proudu). */
export type TimelineEntry =
  | { kind: "activity"; id: string; at: string; activity: ActivityDto }
  | { kind: "note"; id: string; at: string; note: NoteDto; comments: NoteComment[] }
  | {
      kind: "comment";
      id: string;
      at: string;
      actor: string;
      actorId: string;
      body: string;
      edited: boolean;
      entityType: string;
      entityId: string;
    }
  | {
      kind: "file";
      id: string;
      at: string;
      name: string;
      mime: string;
      size: number;
      fileId: string;
      hasThumb: boolean;
      entityType: string;
      entityId: string;
    }
  | {
      kind: "audit";
      id: string;
      at: string;
      actor: string;
      action: string;
      summary: string | null;
      changes: TimelineChange[];
      entityType: string;
      entityId: string;
    };

/** Filtry časové osy. */
export const TIMELINE_FILTERS = ["all", "activity", "note", "file", "audit"] as const;
/** Filtr časové osy. */
export type TimelineFilter = (typeof TIMELINE_FILTERS)[number];
export const TIMELINE_FILTER_LABELS: Record<TimelineFilter, string> = {
  all: "Vše",
  activity: "Aktivity",
  note: "Poznámky",
  file: "Soubory",
  audit: "Protokol změn",
};

/** Odpověď příkazu `crm.timeline.get`: položky osy, názvy zdrojových záznamů a příznak zkrácení. */
export type TimelineResult = {
  items: TimelineEntry[];
  /** Názvy záznamů, ze kterých položky pocházejí (`labels.job[id]`), pro popisek u souhrnné osy. */
  labels: Record<NoteTarget, Record<string, string>>;
  /** Osa byla zkrácena na nejnovější položky. */
  truncated: boolean;
};

/** Odpověď „Dalších kroků“: nadcházející aktivity a připnuté poznámky. */
export type UpcomingResult = { activities: ActivityDto[]; notes: NoteDto[] };

/** Stránka seznamu aktivit s celkovým počtem. */
export type ListMineResult = { rows: ActivityDto[]; total: number };

/** Odpověď dokončení aktivity: dokončená aktivita, návrh další a případně rovnou založená další. */
export type CompleteResult = {
  activity: ActivityDto;
  /** Návrh další aktivity; UI po dokončení vždy nabídne její naplánování. */
  suggestion: NextActivitySuggestion;
  /** Další aktivita, pokud byla zadána rovnou (`next`). */
  next: ActivityDto | null;
};
