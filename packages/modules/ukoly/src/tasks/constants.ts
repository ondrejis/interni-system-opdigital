/*
  Konstanty úkolů a aktivit sdílené serverem, schématem a prohlížečem (`@rebar/ukoly/contract`). Žádné importy
  serveru ani databáze: soubor se dostane i do UI.
*/

/** Stav úkolu: K řešení, Probíhá, Hotovo, Zrušeno. */
export const TASK_STATUSES = ["todo", "in_progress", "done", "canceled"] as const;
/** Stav úkolu. */
export type TaskStatus = (typeof TASK_STATUSES)[number];
/** Otevřené stavy (úkol se ještě řeší). */
export const OPEN_STATUSES = ["todo", "in_progress"] as const satisfies readonly TaskStatus[];
/** Uzavřené stavy (hotovo nebo zrušeno). */
export const CLOSED_STATUSES = ["done", "canceled"] as const satisfies readonly TaskStatus[];

/** Priorita úkolu: Žádná, Nízká, Střední, Vysoká, Urgentní. */
export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
/** Priorita úkolu. */
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Druh účastníka úkolu/schůzky: uživatel systému, kontakt, nebo prosté e-mailové adresy. */
export const ATTENDEE_KINDS = ["user", "person", "email"] as const;
/** Druh účastníka. */
export type AttendeeKind = (typeof ATTENDEE_KINDS)[number];

/** Popisky stavů úkolu. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "K řešení",
  in_progress: "Probíhá",
  done: "Hotovo",
  canceled: "Zrušeno",
};
/** Popisky priorit úkolu. */
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "Žádná",
  low: "Nízká",
  medium: "Střední",
  high: "Vysoká",
  urgent: "Urgentní",
};

/** Klíče systémových typů (seed). Systémový typ nejde smazat ani přejmenovat jeho klíč. */
export const SYSTEM_TYPE_KEYS = ["task", "call", "meeting", "email", "deadline"] as const;
/** Klíč systémového typu. */
export type SystemTypeKey = (typeof SYSTEM_TYPE_KEYS)[number];

/** Výchozí (seedované) typy aktivit: Úkol, Hovor, Schůzka, E-mail, Termín. */
export const SYSTEM_TYPES: readonly {
  key: SystemTypeKey;
  name: string;
  icon: string;
  color: string;
  isCalendarEvent: boolean;
  position: number;
}[] = [
  {
    key: "task",
    name: "Úkol",
    icon: "check-square",
    color: "gray",
    isCalendarEvent: false,
    position: 10,
  },
  { key: "call", name: "Hovor", icon: "phone", color: "blue", isCalendarEvent: true, position: 20 },
  {
    key: "meeting",
    name: "Schůzka",
    icon: "users",
    color: "teal",
    isCalendarEvent: true,
    position: 30,
  },
  {
    key: "email",
    name: "E-mail",
    icon: "mail",
    color: "indigo",
    isCalendarEvent: false,
    position: 40,
  },
  {
    key: "deadline",
    name: "Termín",
    icon: "flag",
    color: "red",
    isCalendarEvent: true,
    position: 50,
  },
];

/** Pohledy „Moje úkoly“ (UKO-04). */
export const TASK_VIEWS = ["today", "next7", "nodate", "delegated", "done", "all"] as const;
/** Pohled „Moje úkoly“: Dnes (vč. po termínu), Nadcházejících 7 dní, Bez termínu, Delegované, Hotové, Vše. */
export type TaskView = (typeof TASK_VIEWS)[number];
/** Popisky pohledů. */
export const TASK_VIEW_LABELS: Record<TaskView, string> = {
  today: "Dnes",
  next7: "Nadcházejících 7 dní",
  nodate: "Bez termínu",
  delegated: "Delegované",
  done: "Hotové",
  all: "Vše",
};
