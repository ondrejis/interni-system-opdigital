"use client";

/*
  Společné stavební kameny UI úkolů (UKO-B): hooky příkazů, ikona typu, chipy priority a termínu, výběr řešitele
  a odkazů. Žádné závislosti mimo `@rebar/ui` a jádro (modul nemá vlastní `@tanstack/react-query`).
*/
import {
  Avatar,
  Chip,
  Combobox,
  Icon,
  cn,
  errorToast,
  successToast,
  undoToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { useEffect, useState } from "react";
import type {
  CompleteTaskResult,
  CreateTaskInput,
  QuickAddInput,
  QuickAddResult,
  TaskDto,
  TaskLinkDto,
  TaskTypeDto,
  UpdateTaskInput,
} from "../contract";
import { TASK_PRIORITY_LABELS, type TaskPriority, type TaskStatus } from "../tasks/constants";
import { dueState, formatDue, formatDuration } from "../tasks/logic/due";

/* ---------- drobné pomůcky ---------- */

/** Třída výběru `<select>` jako v ostatních formulářích aplikace. */
export const selectClass =
  "h-8 w-full rounded-md border border-line-strong bg-bg px-2 text-base text-fg transition-colors hover:border-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] disabled:opacity-50 pointer-coarse:h-11";

/** Zda je obrazovka užší než 768 px (telefon). Na serveru a při prvním vykreslení `false`. */
export function useIsMobile(query = "(max-width: 767px)"): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const read = () => setMatch(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [query]);
  return match;
}

/** Srozumitelná zpráva z chyby příkazu. */
export const messageOf = (e: unknown): string =>
  e instanceof Error && e.message ? e.message : "Akce se nepovedla. Zkuste to znovu.";

/** Kód chyby příkazu (`ApiError.code`), např. `private_assign`. */
export const codeOf = (e: unknown): string | undefined =>
  typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : undefined;

/** Spustí akci; chybu ukáže toastem a vrátí `undefined`. Volitelně oznámí úspěch. */
export async function guard<T>(p: Promise<T>, ok?: string): Promise<T | undefined> {
  try {
    const r = await p;
    if (ok) successToast(ok);
    return r;
  } catch (e) {
    errorToast(messageOf(e));
    return undefined;
  }
}

/* ---------- typy úkolů ---------- */

/** Typy úkolů v pořadí z Nastavení (Úkol, Hovor, Schůzka, E-mail, Termín a vlastní). */
export function useTaskTypes() {
  return useCommandQuery<TaskTypeDto[]>("ukoly.type.list", {});
}

/** Typ podle klíče. */
export const typeOf = (types: readonly TaskTypeDto[] | undefined, key: string) =>
  types?.find((t) => t.key === key);

/** Ikona typu v barevném čtverečku (barva a ikona z Nastavení → Typy aktivit). */
export function TypeBadge({
  icon,
  color,
  name,
  className,
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  name?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("chip shrink-0 justify-center !p-0", className)}
      data-color={color || "gray"}
      style={{ width: 22, height: 22 }}
      {...(name ? { title: name, role: "img", "aria-label": name } : { "aria-hidden": true })}
    >
      <Icon name={icon || "check-square"} className="size-3.5" />
    </span>
  );
}

/* ---------- příkazy ---------- */

/** Vstup `ukoly.complete`. */
type CompleteInput = { id: string; outcome?: string | null; next?: CreateTaskInput | null };
/** Vstup `ukoly.reschedule`. */
export type RescheduleInput = {
  id: string;
  dueDate?: string;
  dueTime?: string | null;
  durationMin?: number | null;
  allDay?: boolean;
  days?: number;
};

/** Všechny zápisové příkazy úkolů; po každém se zneplatní seznamy (`["command"]`, `["entity"]`). */
export function useTaskActions() {
  return {
    create: useCommandMutation<CreateTaskInput, TaskDto>("ukoly.create"),
    quickAdd: useCommandMutation<QuickAddInput, QuickAddResult>("ukoly.quickAdd"),
    update: useCommandMutation<UpdateTaskInput, TaskDto>("ukoly.update"),
    setStatus: useCommandMutation<{ id: string; status: TaskStatus }, TaskDto>("ukoly.setStatus"),
    complete: useCommandMutation<CompleteInput, CompleteTaskResult>("ukoly.complete"),
    reschedule: useCommandMutation<RescheduleInput, TaskDto>("ukoly.reschedule"),
    assign: useCommandMutation<{ id: string; assigneeId: string | null }, TaskDto>("ukoly.assign"),
    publishAndAssign: useCommandMutation<{ id: string; assigneeId: string }, TaskDto>(
      "ukoly.publishAndAssign",
    ),
    remove: useCommandMutation<{ id: string }, { id: string }>("ukoly.delete"),
  };
}

/** Akce úkolů (výsledek `useTaskActions`). */
export type TaskActions = ReturnType<typeof useTaskActions>;

/**
 * Znovu načte seznamy úkolů. Obnovení z koše jde mimo příkazy modulu, takže nic samo nezneplatní dotazy; krátký
 * příkaz `ukoly.counts` jako mutace to udělá (po úspěchu se zneplatní všechny dotazy příkazů a záznamů).
 */
export function useRefreshTasks() {
  const m = useCommandMutation<object, unknown>("ukoly.counts");
  return () => m.mutate({});
}

/** Smaže úkoly do koše a nabídne „Zpět“ (obnoví je z koše). Vrátí počet smazaných. */
export function useDeleteWithUndo() {
  const api = useEntityApi();
  const actions = useTaskActions();
  const refresh = useRefreshTasks();
  return async (ids: string[], label: string) => {
    const done: string[] = [];
    for (const id of ids) {
      const r = await guard(actions.remove.mutateAsync({ id }));
      if (r) done.push(id);
    }
    if (!done.length) return 0;
    undoToast(label, async () => {
      if (await guard(api.restore("task", done), "Úkol je zpátky.")) refresh();
    });
    return done.length;
  };
}

/* ---------- chipy a štítky ---------- */

/** Barvy priorit (chip). */
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  none: "gray",
  low: "blue",
  medium: "yellow",
  high: "orange",
  urgent: "red",
};

/** Chip priority; „Žádná“ se nezobrazuje, pokud není `always`. */
export function PriorityChip({
  priority,
  always,
  className,
}: {
  priority: TaskPriority;
  always?: boolean;
  className?: string;
}) {
  if (priority === "none" && !always) return null;
  return (
    <Chip color={PRIORITY_COLOR[priority]} className={className}>
      {priority === "urgent" && <Icon name="flame" className="size-3" />}
      {TASK_PRIORITY_LABELS[priority]}
    </Chip>
  );
}

const DUE_TONE = {
  overdue: "text-danger",
  today: "text-success",
  future: "text-muted",
  nodate: "text-faint",
  done: "text-faint",
} as const;

/** Termín úkolu česky („Dnes 14:30“, „Zítra“) v barvě stavu; délka za tečkou. */
export function DueText({
  task,
  className,
  withDuration = true,
}: {
  task: Pick<TaskDto, "status" | "dueDate" | "dueTime" | "durationMin">;
  className?: string;
  withDuration?: boolean;
}) {
  const state = dueState(task);
  const text = formatDue(task.dueDate, task.dueTime);
  const dur = withDuration && task.dueTime ? formatDuration(task.durationMin) : "";
  return (
    <span className={cn("tabular whitespace-nowrap", DUE_TONE[state], className)} data-due-state={state}>
      {text}
      {dur && <span className="text-faint"> · {dur}</span>}
    </span>
  );
}

const LINK_ICON = { deal: "handshake", company: "building", person: "user", job: "briefcase" } as const;
/** Entity jádra pro odkaz. */
export type LinkKind = keyof typeof LINK_ICON;
const LINK_ENTITY: Record<LinkKind, string> = {
  deal: "deal",
  company: "company",
  person: "person",
  job: "job",
};

/** Odkaz na obchod, organizaci, kontakt nebo zakázku; soukromý záznam (bez názvu) je jen popisek. */
export function LinkChip({
  kind,
  link,
  prefix,
  className,
}: {
  kind: LinkKind;
  link: TaskLinkDto;
  prefix?: string | null;
  className?: string;
}) {
  const api = useEntityApi();
  const { Link } = useNav();
  const href = link.title ? api.hrefFor(LINK_ENTITY[kind], link.id) : null;
  const inner = (
    <>
      <Icon name={LINK_ICON[kind]} className="size-3 shrink-0" />
      <span className="truncate">
        {prefix ? `${prefix} ` : ""}
        {link.title ?? "Soukromý záznam"}
      </span>
    </>
  );
  const cls = cn(
    "inline-flex max-w-[16rem] items-center gap-1 rounded-md bg-hover px-1.5 text-sm text-muted",
    href && "hover:bg-active hover:text-fg",
    className,
  );
  return href ? (
    <Link href={href} className={cls} onClick={(e) => e.stopPropagation()}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

/** Avatar řešitele s popiskem; „nepřiřazeno“ je prázdný kroužek. */
export function AssigneeAvatar({ name, size = 22 }: { name: string | null; size?: number }) {
  if (!name)
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-faint"
        style={{ width: size, height: size }}
        title="Nepřiřazeno"
      >
        <Icon name="user" className="size-3" />
      </span>
    );
  return (
    <span title={`Řeší: ${name}`} className="shrink-0">
      <Avatar name={name} size={size} />
    </span>
  );
}

/* ---------- výběry ---------- */

/** Výběr uživatele (řešitel); `trigger` nahradí výchozí tlačítko. */
export function AssigneePicker({
  value,
  name,
  onChange,
  trigger,
  disabled,
  label = "Řešitel",
}: {
  value: string | null;
  name: string | null;
  onChange: (id: string | null) => void;
  trigger?: React.ReactNode;
  disabled?: boolean;
  label?: string;
}) {
  const api = useEntityApi();
  return (
    <Combobox
      aria-label={label}
      load={api.lookups.users}
      value={value}
      selectedLabels={value && name ? { [value]: name } : {}}
      onChange={(v) => onChange((v as string | null) ?? null)}
      placeholder="Nepřiřazeno"
      searchPlaceholder="Hledat uživatele…"
      clearable
      {...(disabled ? { disabled } : {})}
      {...(trigger ? { trigger } : {})}
    />
  );
}

/** Výběr záznamu (obchod, organizace, kontakt, zakázka) s hledáním na serveru. */
export function RecordPicker({
  entity,
  label,
  value,
  title,
  onChange,
  disabled,
}: {
  entity: string;
  label: string;
  value: string | null;
  title: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const api = useEntityApi();
  return (
    <Combobox
      aria-label={label}
      load={(q) => api.lookups.records(entity, q)}
      value={value}
      selectedLabels={value ? { [value]: title ?? "Záznam" } : {}}
      onChange={(v) => onChange((v as string | null) ?? null)}
      placeholder="Bez vazby"
      searchPlaceholder="Hledat…"
      clearable
      {...(disabled ? { disabled } : {})}
    />
  );
}

/** Smí uživatel zakládat soukromé záznamy (jen vlastník). */
export const useCanPrivate = (): boolean => useCan()("private.read");
