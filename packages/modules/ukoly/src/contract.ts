/*
  Kontrakt příkazů oblasti „úkoly a aktivity“ modulu „ukoly“: zod vstupy a TypeScript tvary výstupů. Soubor je klientsky
  bezpečný (žádné importy serveru a databáze), čte ho server, UI (UKO-B) i testy: `@rebar/ukoly/contract`.
  Příkazy poznámek (`ukoly.note.*`) mají kontrakt v `src/notes/**` (UKO-N).
*/
import { z } from "zod";
import {
  ATTENDEE_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_VIEWS,
  type TaskPriority,
  type TaskStatus,
  type TaskView,
} from "./tasks/constants";
import type { DueState } from "./tasks/logic/due";
import type { QuickTaskParse } from "./tasks/logic/quick-parse";

export * from "./tasks/constants";
export type { DueState } from "./tasks/logic/due";
export type { QuickTaskParse, QuickTaskToken, QuickTaskType } from "./tasks/logic/quick-parse";

/* ---------- společné stavební kameny ---------- */

const id = z.object({ id: z.uuid() });
const isoDate = z.iso.date();
/** Čas „HH:mm“ v pražském čase. */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Čas zadejte jako HH:mm.");
/** Text, který smí chybět; prázdný řetězec se uloží jako „nic“ (`null`), nezadaný zůstane nezadaný (patch). */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

/** Účastník úkolu nebo schůzky: uživatel (`ref` = id), kontakt (`ref` = id), nebo e-mail (`ref` = adresa). */
export const attendeeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), ref: z.uuid() }),
  z.object({ kind: z.literal("person"), ref: z.uuid() }),
  z.object({ kind: z.literal("email"), ref: z.email().max(200) }),
]);
/** Účastník úkolu. */
export type TaskAttendee = z.infer<typeof attendeeSchema>;

/** Vazby úkolu (měkké odkazy): obchod, organizace, kontakt, zakázka a její fáze. */
export const taskLinksShape = {
  dealId: z.uuid().nullish(),
  companyId: z.uuid().nullish(),
  personId: z.uuid().nullish(),
  jobId: z.uuid().nullish(),
  jobPhaseId: z.uuid().nullish(),
};

/** Pole úkolu při zakládání a úpravě (UKO-03). */
export const taskFieldsShape = {
  title: z.string().trim().min(1, "Vyplňte název úkolu.").max(300),
  description: optText(20000),
  /** Klíč typu z `ukoly.type.list`; výchozí „task“. */
  typeKey: z.string().trim().min(1).max(40).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  /** Nezadáno = ten, kdo úkol zakládá; `null` = nepřiřazeno. */
  assigneeId: z.uuid().nullish(),
  dueDate: isoDate.nullish(),
  /** Čas termínu (hovor, schůzka); bez data se neukládá. */
  dueTime: hhmm.nullish(),
  durationMin: z.number().int().min(1).max(1440).nullish(),
  allDay: z.boolean().optional(),
  place: optText(300),
  estimateMin: z.number().int().min(0).max(100_000).nullish(),
  /** Podúkol (jen jedna úroveň): úkol nadřazený. */
  parentId: z.uuid().nullish(),
  ...taskLinksShape,
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  attendees: z.array(attendeeSchema).max(50).optional(),
  sendInvites: z.boolean().optional(),
  /** Soukromý úkol (jen majitel; partner ho nevidí). Bez hodnoty rozhodne zámek rodiče (obchod, zakázka, nadřazený úkol). */
  isPrivate: z.boolean().optional(),
};

/* ---------- vstupy příkazů ---------- */

/** `ukoly.create`: nový úkol nebo aktivita. */
export const createTaskInput = z.object({
  ...taskFieldsShape,
  outcome: optText(5000),
  /** Založí úkol rovnou jako hotový (zalogovaný hovor). */
  done: z.boolean().optional(),
});
/** Vstup `ukoly.create`. */
export type CreateTaskInput = z.input<typeof createTaskInput>;

/** `ukoly.update`: změna jen zadaných polí (`null` hodnotu nebo vazbu odebere). Stav a řešitel mají vlastní příkazy. */
export const updateTaskInput = z
  .object({ ...taskFieldsShape, outcome: optText(5000) })
  .omit({ status: true, assigneeId: true, isPrivate: true })
  .partial()
  .extend({ id: z.uuid() });
/** Vstup `ukoly.update`. */
export type UpdateTaskInput = z.input<typeof updateTaskInput>;

/** `ukoly.get`. */
export const getTaskInput = id;

/** `ukoly.delete` (do koše). */
export const deleteTaskInput = id;

/** `ukoly.setStatus`: změna stavu bez nabídky výsledku (K řešení, Probíhá, Zrušeno, znovuotevření). */
export const setStatusInput = z.object({ id: z.uuid(), status: z.enum(TASK_STATUSES) });

/** `ukoly.complete`: dokončení; volitelně výsledek a rovnou naplánovaná další aktivita. Nic dalšího se nevytváří samo (UKO-07). */
export const completeTaskInput = z.object({
  id: z.uuid(),
  outcome: optText(5000),
  next: createTaskInput.nullish(),
});

/** `ukoly.reschedule`: nový termín (datum a čas), nebo odložení o dny od dneška. */
export const rescheduleTaskInput = z
  .object({
    id: z.uuid(),
    dueDate: isoDate.optional(),
    /** `null` odebere čas, nezadáno ho ponechá. */
    dueTime: hhmm.nullish(),
    durationMin: z.number().int().min(1).max(1440).nullish(),
    allDay: z.boolean().optional(),
    /** Odložení o dny od dneška (čas zůstává). */
    days: z.number().int().min(0).max(730).optional(),
  })
  .refine((v) => v.dueDate !== undefined || v.days !== undefined, "Zadejte nový termín.");

/** `ukoly.assign`: přiřazení řešitele (soukromý úkol nejde přiřadit uživateli bez práva na soukromé). */
export const assignTaskInput = z.object({ id: z.uuid(), assigneeId: z.uuid().nullable() });

/** `ukoly.publishAndAssign` (VID-06): „Zveřejnit a přiřadit“, jen vlastník soukromých záznamů. */
export const publishAndAssignInput = z.object({ id: z.uuid(), assigneeId: z.uuid() });

/** `ukoly.attendees.set`: nahradí účastníky úkolu/schůzky. */
export const setAttendeesInput = z.object({
  id: z.uuid(),
  attendees: z.array(attendeeSchema).max(50),
});

/** `ukoly.parse`: náhled rozpoznání rychlého zadání (bez uložení). */
export const parseTaskInput = z.object({ text: z.string().max(1000) });

/** `ukoly.quickAdd`: rychlé přidání z jednoho řádku; pole zadaná výslovně přebijí rozpoznaná. */
export const quickAddInput = z.object({
  text: z.string().trim().min(1, "Napište, co je potřeba udělat.").max(1000),
  /** Výslovně zadané hodnoty (UI je po náhledu upravil): přebijí to, co parser rozpoznal. */
  override: z
    .object({
      title: z.string().trim().min(1).max(300).optional(),
      typeKey: z.string().trim().min(1).max(40).optional(),
      dueDate: isoDate.nullish(),
      dueTime: hhmm.nullish(),
      durationMin: z.number().int().min(1).max(1440).nullish(),
      priority: z.enum(TASK_PRIORITIES).optional(),
    })
    .optional(),
  assigneeId: z.uuid().nullish(),
  isPrivate: z.boolean().optional(),
  ...taskLinksShape,
  parentId: z.uuid().nullish(),
});
/** Vstup `ukoly.quickAdd`. */
export type QuickAddInput = z.input<typeof quickAddInput>;

/** Třídění seznamu úkolů. */
export const TASK_SORTS = ["due", "priority", "created", "title", "updated"] as const;
/** Třídění seznamu úkolů. */
export type TaskSort = (typeof TASK_SORTS)[number];

/** `ukoly.list`: seznam „Moje úkoly“ (UKO-04) a obecný výpis. Seskupení dělá UI nad vrácenými řádky. */
export const listTasksInput = z.object({
  /** Pohled: Dnes (vč. po termínu), Nadcházejících 7 dní, Bez termínu, Delegované, Hotové, Vše. Výchozí `today`. */
  view: z.enum(TASK_VIEWS).optional(),
  /** `mine` (výchozí) = přidělené mně, `all` = vše, co smím vidět (pohled Delegované je vždy „zadal jsem“). */
  scope: z.enum(["mine", "all"]).optional(),
  assigneeId: z.uuid().optional(),
  typeKey: z.string().trim().min(1).max(40).optional(),
  status: z.array(z.enum(TASK_STATUSES)).max(4).optional(),
  priority: z.array(z.enum(TASK_PRIORITIES)).max(5).optional(),
  dealId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  personId: z.uuid().optional(),
  jobId: z.uuid().optional(),
  jobPhaseId: z.uuid().optional(),
  /** Jen úkoly, které jsou v kalendáři (typ s příznakem „v kalendáři“). */
  calendarOnly: z.boolean().optional(),
  /** Hledání v názvu a popisu. */
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(60).optional(),
  /** Podúkoly jako samostatné řádky (výchozí ano; `false` vrátí jen nadřazené úkoly, podúkoly jsou pak v detailu). */
  includeSubtasks: z.boolean().optional(),
  sort: z.enum(TASK_SORTS).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
});
/** Vstup `ukoly.list`. */
export type ListTasksInput = z.input<typeof listTasksInput>;

/** `ukoly.forRecord`: úkoly u obchodu, organizace, kontaktu nebo zakázky (záložka „Úkoly a aktivity“). */
export const tasksForRecordInput = z
  .object({
    dealId: z.uuid().optional(),
    companyId: z.uuid().optional(),
    personId: z.uuid().optional(),
    jobId: z.uuid().optional(),
    /** U organizace sbírá i úkoly jejích obchodů, zakázek a kontaktů (podle vazeb úkolu na organizaci). */
    include: z.enum(["open", "done", "all"]).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .refine(
    (v) => !!(v.dealId || v.companyId || v.personId || v.jobId),
    "Zadejte obchod, firmu, kontakt nebo zakázku.",
  );

/** `ukoly.counts`: počty pro záložky „Moje úkoly“. */
export const countsInput = z.object({});

/** Typ úkolu: vstup `ukoly.type.save` (klíč se po založení nemění). */
export const saveTypeInput = z.object({
  id: z.uuid().optional(),
  key: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "Klíč smí obsahovat malá písmena bez diakritiky, číslice a podtržítko.",
    ),
  name: z.string().trim().min(1, "Vyplňte název typu.").max(60),
  icon: z.string().trim().min(1).max(40).nullish(),
  color: z.string().trim().min(1).max(40).nullish(),
  isCalendarEvent: z.boolean().optional(),
  position: z.number().int().min(0).max(10_000).optional(),
});
/** `ukoly.type.list`: typy pro výběr (a správu v Nastavení). */
export const listTypesInput = z.object({});
/** `ukoly.type.delete`: smaže vlastní typ, který žádný úkol nepoužívá. */
export const deleteTypeInput = id;
/** `ukoly.type.reorder`: pořadí typů v nabídkách. */
export const reorderTypesInput = z.object({ ids: z.array(z.uuid()).min(1).max(100) });

/* ---------- výstupy příkazů ---------- */

/** Typ úkolu pro UI (ikona a barva z Nastavení). */
export type TaskTypeDto = {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  color: string | null;
  isCalendarEvent: boolean;
  isSystem: boolean;
  position: number;
  /** Kolik úkolů typ používá (u správy typů). */
  usage?: number;
};

/** Odkaz na jiný záznam s názvem (jen z toho, co aktér smí vidět; soukromý nebo cizí záznam má `title: null`). */
export type TaskLinkDto = { id: string; title: string | null };

/** Úkol tak, jak ho dostane UI. */
export type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  typeKey: string;
  typeName: string;
  typeIcon: string | null;
  typeColor: string | null;
  isCalendarEvent: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string | null;
  createdByName: string | null;
  dueDate: string | null;
  /** „HH:mm“ pražského času, nebo `null` (termín jen dnem). */
  dueTime: string | null;
  durationMin: number | null;
  allDay: boolean;
  place: string | null;
  estimateMin: number | null;
  outcome: string | null;
  /** ISO okamžik dokončení (hotovo nebo zrušeno). */
  completedAt: string | null;
  parentId: string | null;
  /** Název nadřazeného úkolu (podúkol v plochém seznamu), je-li vidět. */
  parentTitle: string | null;
  /** Podúkoly (jen u nadřazeného úkolu): kolik jich je a kolik z nich je hotových. */
  subtasks: { total: number; done: number };
  deal: TaskLinkDto | null;
  company: TaskLinkDto | null;
  person: TaskLinkDto | null;
  job: TaskLinkDto | null;
  /** Číslo zakázky (`Z-2026-001`), je-li zakázka vidět. */
  jobNumber: string | null;
  jobPhaseId: string | null;
  /** Název fáze zakázky; `null` = úkol je ve skupině „Bez fáze“ (UKO-08). */
  jobPhaseName: string | null;
  tags: string[];
  sendInvites: boolean;
  /** Stav termínu vůči teď (barva a pořadí). */
  state: DueState;
  isPrivate: boolean;
  /** Úkol v seznamu je vidět jen díky tomu, že ho zadal (neřeší ho). */
  delegated: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Úkol s podúkoly a účastníky (detail). */
export type TaskDetailDto = TaskDto & {
  subtaskList: TaskDto[];
  attendees: (TaskAttendee & { label: string | null })[];
};

/** Stránka seznamu úkolů s celkovým počtem. */
export type ListTasksResult = { rows: TaskDto[]; total: number };

/** Odpověď `ukoly.counts`. */
export type TaskCounts = {
  /** Dnes včetně po termínu (otevřené, přidělené mně). */
  today: number;
  overdue: number;
  next7: number;
  nodate: number;
  /** Zadal jsem, řeší jiný (otevřené). */
  delegated: number;
};

/** Odpověď `ukoly.forRecord`. */
export type RecordTasksResult = {
  open: TaskDto[];
  done: TaskDto[];
  counts: { open: number; overdue: number; done: number };
};

/** Náhled `ukoly.parse`: rozpoznané části a typ ze systému (ikona, název). */
export type ParsedQuickTask = QuickTaskParse & {
  type: {
    key: string;
    name: string;
    icon: string | null;
    color: string | null;
    isCalendarEvent: boolean;
  };
  /** Název prázdný: po odstranění data a času nezbylo, co se má udělat. */
  needsTitle: boolean;
};

/** Návrh další aktivity po dokončení hovoru nebo schůzky (UKO-07): stejný typ a vazby, předvyplněný termín. Nic se nevytvoří. */
export type NextTaskSuggestion = {
  typeKey: string;
  title: string;
  dueDate: string;
  dueTime: string | null;
  durationMin: number | null;
  priority: TaskPriority;
  assigneeId: string | null;
  dealId: string | null;
  companyId: string | null;
  personId: string | null;
  jobId: string | null;
  jobPhaseId: string | null;
};

/** Odpověď `ukoly.complete`: dokončený úkol, nabídka (výsledek a další aktivita, jen u hovoru a schůzky) a případně založená další. */
export type CompleteTaskResult = {
  task: TaskDto;
  offer: { outcome: boolean; next: NextTaskSuggestion | null };
  next: TaskDto | null;
};

/** Odpověď `ukoly.quickAdd`. */
export type QuickAddResult = { task: TaskDto; parsed: QuickTaskParse };

/** Nabídka pohledů pro UI (kód pohledu → počet). */
export type TaskViewCount = { view: TaskView; count: number };

export { ATTENDEE_KINDS };
