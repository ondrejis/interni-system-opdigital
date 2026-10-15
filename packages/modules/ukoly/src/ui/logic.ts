/*
  Čistá logika UI úkolů (UKO-B): seskupení, board, pohledy „Moje úkoly“ ↔ uložené pohledy jádra, náhled rychlého
  přidání s ručními opravami, gesta swipe a zvýraznění zmínek. Žádné React ani server, čas se předává parametrem,
  takže se vše testuje jednotkově (`logic.test.ts`).
*/
import type { FilterGroup } from "@rebar/core/shared";
import { addDaysIso, diffDaysIso, isoWeekday, localParts, todayIso } from "@rebar/core/time";
import type { ListTasksInput, ParsedQuickTask, TaskDto } from "../contract";
import {
  CLOSED_STATUSES,
  OPEN_STATUSES,
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskStatus,
  type TaskView,
} from "../tasks/constants";
import { daysToNextMonday } from "../tasks/logic/due";
import type { QuickTaskParse } from "../tasks/logic/quick-parse";

/* ---------- seskupení ---------- */

/** Seskupení seznamu úkolů (UKO-04): podle data, zakázky, klienta nebo priority. */
export const GROUP_MODES = ["date", "job", "company", "priority", "none"] as const;
/** Způsob seskupení. */
export type GroupMode = (typeof GROUP_MODES)[number];

/** Popisky seskupení v nabídce. */
export const GROUP_LABELS: Record<GroupMode, string> = {
  date: "Podle data",
  job: "Podle zakázky",
  company: "Podle klienta",
  priority: "Podle priority",
  none: "Bez seskupení",
};

/** Skupina řádků v seznamu. `title` prázdný = bez záhlaví (jediná skupina). */
export type TaskGroup = {
  key: string;
  title: string;
  /** Druhý řádek záhlaví (fáze zakázky). */
  subtitle?: string;
  tone: "danger" | "accent" | "muted" | "normal";
  rows: TaskDto[];
};

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

/** „Pá 16. 10.“ pro záhlaví skupiny podle dne. */
export function dayTitle(iso: string): string {
  const [, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS[isoWeekday(iso) - 1]} ${d}. ${m}.`;
}

type Bucket = { order: number; key: string; title: string; tone: TaskGroup["tone"] };

function dateBucket(t: TaskDto, today: string): Bucket {
  if ((CLOSED_STATUSES as readonly string[]).includes(t.status)) {
    const day = t.completedAt ? localParts(new Date(t.completedAt)).date : "";
    if (!day) return { order: 900, key: "done:", title: "Dokončeno", tone: "muted" };
    const ago = diffDaysIso(day, today);
    const title =
      ago === 0 ? "Dokončeno dnes" : ago === 1 ? "Dokončeno včera" : `Dokončeno ${dayTitle(day)}`;
    return { order: 300 + Math.max(0, ago), key: `done:${day}`, title, tone: "muted" };
  }
  if (!t.dueDate) return { order: 200, key: "nodate", title: "Bez termínu", tone: "muted" };
  const diff = diffDaysIso(today, t.dueDate);
  if (diff < 0) return { order: -1, key: "overdue", title: "Po termínu", tone: "danger" };
  if (diff === 0) return { order: 0, key: "today", title: "Dnes", tone: "accent" };
  if (diff === 1) return { order: 1, key: "tomorrow", title: "Zítra", tone: "normal" };
  if (diff < 7)
    return { order: diff, key: `d:${t.dueDate}`, title: dayTitle(t.dueDate), tone: "normal" };
  return { order: 100, key: "later", title: "Později", tone: "normal" };
}

const PRIORITY_TITLES: Record<TaskPriority, string> = {
  urgent: "Urgentní",
  high: "Vysoká priorita",
  medium: "Střední priorita",
  low: "Nízká priorita",
  none: "Bez priority",
};
const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low", "none"];

/** Zakázka v záhlaví skupiny: „Z-2026-001 Web pro Nováka“. */
export function jobTitle(t: TaskDto): string {
  if (!t.job) return "Bez zakázky";
  const name = t.job.title ?? "Soukromý záznam";
  return t.jobNumber ? `${t.jobNumber} ${name}` : name;
}

/**
 * Rozdělí řádky do skupin. Pořadí řádků uvnitř skupiny zůstává podle serveru. Podle zakázky se řadí fáze:
 * úkol v zakázce bez fáze je ve skupině „Bez fáze“ (UKO-08), úkoly bez zakázky jsou nakonec.
 */
export function groupTasks(
  rows: readonly TaskDto[],
  mode: GroupMode,
  now: Date = new Date(),
): TaskGroup[] {
  if (mode === "none") return rows.length ? [{ key: "all", title: "", tone: "normal", rows: [...rows] }] : [];
  const today = todayIso("Europe/Prague", now);
  const groups = new Map<string, TaskGroup & { order: number; sort: string }>();
  const add = (
    key: string,
    init: Omit<TaskGroup, "key" | "rows"> & { order: number; sort?: string },
    row: TaskDto,
  ) => {
    let g = groups.get(key);
    if (!g) {
      const { order, sort, ...rest } = init;
      g = { key, rows: [], order, sort: sort ?? "", ...rest };
      groups.set(key, g);
    }
    g.rows.push(row);
  };

  for (const t of rows) {
    if (mode === "date") {
      const b = dateBucket(t, today);
      add(b.key, { order: b.order, title: b.title, tone: b.tone }, t);
    } else if (mode === "priority") {
      const i = PRIORITY_ORDER.indexOf(t.priority);
      add(t.priority, { order: i, title: PRIORITY_TITLES[t.priority], tone: "normal" }, t);
    } else if (mode === "company") {
      const id = t.company?.id ?? "none";
      const title = t.company ? (t.company.title ?? "Soukromý záznam") : "Bez klienta";
      add(
        `c:${id}`,
        { order: t.company ? 0 : 1, sort: title, title, tone: t.company ? "normal" : "muted" },
        t,
      );
    } else {
      const phase = t.job ? (t.jobPhaseName ?? "") : "";
      const title = jobTitle(t);
      add(
        `j:${t.job?.id ?? "none"}|${phase}`,
        {
          order: t.job ? (phase ? 0 : 1) : 2,
          sort: `${title}|${phase || "￿"}`,
          title,
          ...(t.job ? { subtitle: phase || "Bez fáze" } : {}),
          tone: t.job ? "normal" : "muted",
        },
        t,
      );
    }
  }
  const list = [...groups.values()];
  if (mode === "job") {
    // zakázky podle názvu, uvnitř zakázky fáze (pojmenované před „Bez fáze“); úkoly bez zakázky nakonec
    list.sort(
      (a, b) =>
        Number(a.order === 2) - Number(b.order === 2) ||
        a.sort.localeCompare(b.sort, "cs", { sensitivity: "base" }),
    );
  } else if (mode === "company") {
    list.sort(
      (a, b) => a.order - b.order || a.sort.localeCompare(b.sort, "cs", { sensitivity: "base" }),
    );
  } else {
    list.sort((a, b) => a.order - b.order);
  }
  return list.map(({ order: _o, sort: _s, ...g }) => g);
}

/* ---------- board podle stavu ---------- */

/** Sloupce boardu úkolů (UKO-04, SPOL-07). */
export const BOARD_COLUMNS = ["todo", "in_progress", "done", "canceled"] as const satisfies readonly TaskStatus[];

/** Rozdělí řádky do sloupců podle stavu (sloupce bez řádků zůstávají prázdné). */
export function boardColumns(rows: readonly TaskDto[]): Record<TaskStatus, TaskDto[]> {
  const out: Record<TaskStatus, TaskDto[]> = { todo: [], in_progress: [], done: [], canceled: [] };
  for (const t of rows) out[t.status].push(t);
  return out;
}

/** Je stav otevřený (úkol se ještě řeší)? */
export const isOpen = (status: TaskStatus): boolean =>
  (OPEN_STATUSES as readonly string[]).includes(status);

/* ---------- přesun termínu ---------- */

/** Rychlé volby přesunu termínu: dnes, zítra, nejbližší pondělí, za týden. */
export function datePresets(now: Date = new Date()): { key: string; label: string; date: string }[] {
  const today = todayIso("Europe/Prague", now);
  const monday = addDaysIso(today, daysToNextMonday(now));
  return [
    { key: "today", label: "Dnes", date: today },
    { key: "tomorrow", label: "Zítra", date: addDaysIso(today, 1) },
    { key: "monday", label: "Příští pondělí", date: monday },
    { key: "week", label: "Za týden", date: addDaysIso(today, 7) },
  ];
}

/* ---------- stav seznamu ↔ uložený pohled jádra ---------- */

/** Rozložení „Moje úkoly“: seznam, nebo board podle stavu. */
export type Layout = "list" | "board";

/** Co uživatel v „Moje úkoly“ zvolil; z toho vzniká dotaz `ukoly.list` i uložený pohled. */
export type ListState = {
  view: TaskView;
  /** `mine` = přidělené mně, `all` = vše, co smím vidět (Delegované se řídí samo). */
  scope: "mine" | "all";
  group: GroupMode;
  layout: Layout;
  typeKey: string;
  priority: TaskPriority[];
  q: string;
};

/** Výchozí seskupení podle pohledu: Bez termínu bez skupin, ostatní podle data. */
export const defaultGroupFor = (view: TaskView): GroupMode => (view === "nodate" ? "none" : "date");

/** Výchozí stav stránky: Dnes, moje, podle data, seznam. */
export const DEFAULT_STATE: ListState = {
  view: "today",
  scope: "mine",
  group: "date",
  layout: "list",
  typeKey: "",
  priority: [],
  q: "",
};

/** Vstup `ukoly.list` ze stavu stránky. */
export function listInput(s: ListState, limit = 500): ListTasksInput {
  return {
    view: s.view,
    ...(s.view === "delegated" ? {} : { scope: s.scope }),
    ...(s.typeKey ? { typeKey: s.typeKey } : {}),
    ...(s.priority.length ? { priority: s.priority } : {}),
    ...(s.q.trim() ? { q: s.q.trim() } : {}),
    limit,
  };
}

/** Atributy entity `task`, podle kterých se seskupuje v uloženém pohledu jádra. */
const GROUP_ATTR: Record<GroupMode, string | null> = {
  date: "dueDate",
  job: "job",
  company: "company",
  priority: "priority",
  none: null,
};

/** Uložený pohled jádra (`saved_view`, entita `task`): jen skutečné atributy, takže ho pochopí i obecný seznam úkolů. */
export type SavedConfig = {
  viewType: "table" | "kanban";
  filters?: FilterGroup;
  group?: string | null;
};

type Cond = { attr: string; op: string; value?: unknown };

/** Podmínky filtru pro pohled „Moje úkoly“ (relativní operátory, ať se pohled nezastará). */
function viewConditions(view: TaskView): (Cond | FilterGroup)[] {
  const open: Cond = { attr: "status", op: "is_any_of", value: [...OPEN_STATUSES] };
  switch (view) {
    case "today":
      return [
        open,
        {
          op: "or",
          conditions: [
            { attr: "dueDate", op: "in_next_days", value: 0 },
            { attr: "dueDate", op: "older_than_days", value: 0 },
          ],
        },
      ];
    case "next7":
      return [open, { attr: "dueDate", op: "in_next_days", value: 7 }];
    case "nodate":
      return [open, { attr: "dueDate", op: "empty" }];
    case "delegated":
      return [open, { attr: "assignee", op: "is_not_me" }];
    case "done":
      return [{ attr: "status", op: "is_any_of", value: ["done"] }];
    case "all":
      return [];
  }
}

/** Stav stránky → konfigurace uloženého pohledu jádra. */
export function toSavedConfig(s: ListState): SavedConfig {
  const conditions: (Cond | FilterGroup)[] = [...viewConditions(s.view)];
  if (s.view !== "delegated" && s.scope === "mine")
    conditions.push({ attr: "assignee", op: "is_me" });
  if (s.typeKey) conditions.push({ attr: "type", op: "equals", value: s.typeKey });
  if (s.priority.length) conditions.push({ attr: "priority", op: "is_any_of", value: s.priority });
  if (s.q.trim()) conditions.push({ attr: "title", op: "contains", value: s.q.trim() });
  const group = GROUP_ATTR[s.group];
  return {
    viewType: s.layout === "board" ? "kanban" : "table",
    ...(conditions.length ? { filters: { op: "and", conditions } as FilterGroup } : {}),
    ...(group ? { group } : { group: null }),
  };
}

const flat = (g: FilterGroup | undefined): Cond[] =>
  (g?.conditions ?? []).flatMap((c) => ("conditions" in c ? flat(c) : [c as Cond]));

/** Uložený pohled jádra → stav stránky (co pohled neobsahuje, zůstane výchozí). */
export function fromSavedConfig(cfg: SavedConfig): ListState {
  const conds = flat(cfg.filters);
  const find = (attr: string, op: string) => conds.find((c) => c.attr === attr && c.op === op);
  let view: TaskView = "all";
  if (find("dueDate", "older_than_days")) view = "today";
  else if (find("dueDate", "in_next_days")?.value === 7) view = "next7";
  else if (find("dueDate", "empty")) view = "nodate";
  else if (find("assignee", "is_not_me")) view = "delegated";
  else {
    const st = find("status", "is_any_of")?.value;
    if (Array.isArray(st) && st.length === 1 && st[0] === "done") view = "done";
  }
  const group = (Object.keys(GROUP_ATTR) as GroupMode[]).find((k) => GROUP_ATTR[k] === (cfg.group ?? null));
  const pr = find("priority", "is_any_of")?.value;
  return {
    view,
    scope: find("assignee", "is_me") || view === "delegated" ? "mine" : "all",
    group: group ?? defaultGroupFor(view),
    layout: cfg.viewType === "kanban" ? "board" : "list",
    typeKey: typeof find("type", "equals")?.value === "string" ? String(find("type", "equals")!.value) : "",
    priority: Array.isArray(pr) ? (pr.filter((p) => (TASK_PRIORITIES as readonly unknown[]).includes(p)) as TaskPriority[]) : [],
    q: typeof find("title", "contains")?.value === "string" ? String(find("title", "contains")!.value) : "",
  };
}

/* ---------- rychlé přidání: náhled a ruční opravy ---------- */

/** Ruční opravy rozpoznaného v náhledu (jen to, čeho se uživatel dotkl). */
export type QuickOverride = {
  typeKey?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: TaskPriority;
};

/** Platné hodnoty po opravách: rozpoznané přepsané tím, co uživatel opravil. Čas bez data se zahodí. */
export function effectiveQuick(
  parse: Pick<QuickTaskParse, "typeKey" | "dueDate" | "dueTime" | "priority" | "title" | "durationMin">,
  o: QuickOverride,
) {
  const dueDate = o.dueDate !== undefined ? o.dueDate : parse.dueDate;
  const dueTime = dueDate ? (o.dueTime !== undefined ? o.dueTime : parse.dueTime) : null;
  return {
    title: parse.title,
    typeKey: o.typeKey ?? parse.typeKey,
    dueDate,
    dueTime,
    durationMin: dueTime ? parse.durationMin : null,
    priority: o.priority ?? parse.priority,
  };
}

/** Vstup `override` příkazu `ukoly.quickAdd`: jen hodnoty, které se liší od rozpoznaných. */
export function quickOverridePayload(parse: ParsedQuickTask | QuickTaskParse, o: QuickOverride) {
  const out: {
    typeKey?: string;
    dueDate?: string | null;
    dueTime?: string | null;
    priority?: TaskPriority;
  } = {};
  if (o.typeKey !== undefined && o.typeKey !== parse.typeKey) out.typeKey = o.typeKey;
  if (o.dueDate !== undefined && o.dueDate !== parse.dueDate) out.dueDate = o.dueDate;
  if (o.dueTime !== undefined && o.dueTime !== parse.dueTime) out.dueTime = o.dueTime;
  if (o.priority !== undefined && o.priority !== parse.priority) out.priority = o.priority;
  return out;
}

/* ---------- swipe (mobil) ---------- */

/** Šířka odkryté lišty akcí (Odložit + Hotovo) a práh, od kterého se lišta ponechá odkrytá. */
export const SWIPE_REVEAL = 160;
/** Posun doleva (px), od kterého se lišta ponechá odkrytá. */
export const SWIPE_OPEN_AT = 56;
/** Posun doleva (px), od kterého se úkol rovnou označí jako hotový. */
export const SWIPE_COMMIT_AT = 240;

/** Co udělat po puštění prstu po posunu `dx` (záporné = doleva). */
export function swipeOutcome(dx: number): "none" | "open" | "done" {
  if (dx <= -SWIPE_COMMIT_AT) return "done";
  if (dx <= -SWIPE_OPEN_AT) return "open";
  return "none";
}

/** Posun obsahu řádku při tažení: doleva po lištu, dál s odporem; doprava nic. */
export function swipeOffset(dx: number): number {
  if (dx >= 0) return 0;
  if (dx >= -SWIPE_REVEAL) return dx;
  return -SWIPE_REVEAL + (dx + SWIPE_REVEAL) * 0.4;
}

/* ---------- zmínky v komentářích ---------- */

/** Rozdělí komentář na text a zmínky `@jméno` (jen zvýraznění, nic se neposílá; UKO-10). */
export function splitMentions(body: string): { text: string; mention: boolean }[] {
  const out: { text: string; mention: boolean }[] = [];
  const re = /(^|[\s(])(@[\p{L}][\p{L}\p{N}._-]*)/gu;
  let last = 0;
  for (const m of body.matchAll(re)) {
    const start = m.index + (m[1]?.length ?? 0);
    if (start > last) out.push({ text: body.slice(last, start), mention: false });
    out.push({ text: m[2]!, mention: true });
    last = start + m[2]!.length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out.length ? out : [{ text: body, mention: false }];
}

/* ---------- odhad času ---------- */

/** Minuty → „1 h 30 min“ pro odhad (0 = nic). */
export function estimateLabel(min: number | null | undefined): string {
  if (!min || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Text zadaný do pole odhadu („90“, „1,5 h“, „1:30“, „45 min“) → minuty; neplatné je `undefined`, prázdné `null`. */
export function parseEstimate(text: string): number | null | undefined {
  const s = text.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  let m = /^(\d+):([0-5]\d)$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:\.\d+)?)\s*(h|hod|hodin|hodiny|hodina)$/.exec(s);
  if (m) return Math.round(Number(m[1]) * 60);
  m = /^(\d+)\s*(m|min|minut|minuty)?$/.exec(s);
  if (m) return Number(m[1]);
  return undefined;
}
