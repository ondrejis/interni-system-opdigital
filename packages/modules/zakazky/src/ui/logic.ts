/*
  Čistá logika UI modulu „zakazky“ (ZAK-B): pás fází, board, seznam, úkoly po fázích, dialogy dokončení a retaineru,
  řádky dialogu „Založit zakázky z obchodu“ a úpravy obsahu šablony. Bez Reactu a bez serveru, aby šla testovat samostatně
  (`logic.test.ts`). Komponenty jsou tenká vrstva nad těmito funkcemi.
*/
import type {
  BillingModel,
  JobStatus,
  MarketingStage,
  RetainerSetup,
  ServiceType,
  SplitRuleInput,
  YearMonth,
} from "@rebar/core/contracts";
import type {
  BoardCard,
  BoardColumn,
  BoardResult,
  CompletePreview,
  PhasePreview,
  PhaseView,
  PrefillRow,
  TemplatePayloadData,
} from "../contract";
import type { JobFromDealRow } from "../contract";
import { JOB_TYPE_LABELS, addDays, daysBetween, todayPrague, type PhaseRole } from "../shared";
import type { BoardCardX, TaskLite, TaskGroup } from "./types";

/* ---------- společné pomůcky ---------- */

/** Česká množná čísla: 1 → `one`, 2–4 → `few`, jinak `many` („1 úkol“, „3 úkoly“, „5 úkolů“). */
export function plural(n: number, one: string, few: string, many: string): string {
  const k = Math.abs(Math.trunc(n));
  return `${n} ${k === 1 ? one : k >= 2 && k <= 4 ? few : many}`;
}

/** Text bez diakritiky a velkých písmen pro hledání v seznamu. */
export function fold(text: string | null | undefined): string {
  return (text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Barva štítku typu zakázky (názvy z palety `@rebar/ui`). */
export const TYPE_COLORS: Record<ServiceType, string> = {
  web: "blue",
  marketing: "orange",
  systemy: "purple",
};

/* ---------- varování po termínu ---------- */

/** Výstražná ikona zakázky: po termínu, nebo ve skluzu (úkoly po termínu). */
export type JobWarning = { kind: "overdue" | "slipping"; label: string };

/** Varování zakázky pro seznam, board a hlavičku; `null`, když je vše v pořádku. */
export function jobWarning(
  card: Pick<BoardCard, "overdue" | "slipping" | "dueDate">,
  formatDate: (iso: string) => string = (s) => s,
): JobWarning | null {
  if (card.overdue)
    return {
      kind: "overdue",
      label: card.dueDate ? `Po termínu (termín ${formatDate(card.dueDate)})` : "Po termínu",
    };
  if (card.slipping) return { kind: "slipping", label: "Má úkoly po termínu" };
  return null;
}

/** Popis termínu: „dnes“, „za 3 dny“, „před 2 dny“ a tón (`danger` po termínu, `warning` do 3 dnů). */
export function dueLabel(
  due: string | null,
  today: string = todayPrague(),
): { text: string; tone: "none" | "normal" | "warning" | "danger" } {
  if (!due) return { text: "", tone: "none" };
  const d = daysBetween(today, due);
  if (d === 0) return { text: "dnes", tone: "warning" };
  if (d === 1) return { text: "zítra", tone: "warning" };
  if (d > 1)
    return { text: `za ${plural(d, "den", "dny", "dní")}`, tone: d <= 3 ? "warning" : "normal" };
  if (d === -1) return { text: "včera", tone: "danger" };
  return { text: `před ${-d} dny`, tone: "danger" };
}

/* ---------- pás fází ---------- */

/** Fáze pro `PipelineStepper` (id, název, barva podle zvláštní role). */
export function stripStages(phases: readonly PhaseView[]): {
  id: string;
  name: string;
  color?: string;
  kind: "open";
}[] {
  return [...phases]
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      id: p.id,
      name: p.name,
      kind: "open" as const,
      ...(p.role === "retainer"
        ? { color: "purple" }
        : p.role === "intro_evaluation"
          ? { color: "orange" }
          : {}),
    }));
}

/**
 * Důvod, proč na fázi nejde přejít klikem: u marketingu před rozhodnutím se na fázi Retainer nepřechází klikem, ale
 * volbou „Pokračovat na retainer“ (nastavení částky a plateb).
 */
export function stripBlockedReason(
  job: { type: ServiceType; marketingStage: MarketingStage | null },
  phase: Pick<PhaseView, "role">,
): string | null {
  if (
    job.type === "marketing" &&
    phase.role === "retainer" &&
    (job.marketingStage === "intro" ||
      job.marketingStage === "decision" ||
      job.marketingStage === null)
  )
    return "Na Retainer přejdete volbou „Pokračovat na retainer“ po vyhodnocení úvodní fáze.";
  return null;
}

/** Co udělat po kliknutí na fázi podle náhledu ze serveru. */
export type PhaseChangePlan =
  | { kind: "blocked"; reason: string }
  | { kind: "direct" }
  | {
      kind: "ask";
      phases: { id: string; name: string; openTasks: number }[];
      totalOpenTasks: number;
    };

/**
 * Z náhledu `zakazky.phase.preview` určí postup: blokováno, rovnou změnit, nebo se zeptat, zda dokončit i otevřené
 * úkoly fází, které se tím uzavírají (R-38). Neznámý počet úkolů (modul Úkoly vypnutý) se bere jako nula.
 */
export function planPhaseChange(p: PhasePreview): PhaseChangePlan {
  if (p.blockedReason) return { kind: "blocked", reason: p.blockedReason };
  const withTasks = p.completing
    .filter((c) => (c.openTasks ?? 0) > 0)
    .map((c) => ({ id: c.id, name: c.name, openTasks: c.openTasks ?? 0 }));
  if (!withTasks.length) return { kind: "direct" };
  return {
    kind: "ask",
    phases: withTasks,
    totalOpenTasks: withTasks.reduce((n, c) => n + c.openTasks, 0),
  };
}

/** Věta pro toast po změně fáze (kolik fází se dokončilo, kolik úkolů). */
export function phaseChangeMessage(
  name: string,
  r: { completedPhaseIds: string[]; completedTasks: number },
): string {
  const parts = [`Zakázka je ve fázi „${name}“.`];
  if (r.completedPhaseIds.length)
    parts.push(`Dokončeno: ${plural(r.completedPhaseIds.length, "fáze", "fáze", "fází")}.`);
  if (r.completedTasks)
    parts.push(`Dokončeno: ${plural(r.completedTasks, "úkol", "úkoly", "úkolů")}.`);
  return parts.join(" ");
}

/** Následující nehotová fáze po aktuální (pro „Dokončit fázi a posunout dál“); `null` u poslední. */
export function nextPhase(
  phases: readonly PhaseView[],
  currentId: string | null,
): PhaseView | null {
  const sorted = [...phases].sort((a, b) => a.position - b.position);
  const at = currentId ? sorted.findIndex((p) => p.id === currentId) : -1;
  return sorted[at + 1] ?? null;
}

/** Počet dokončených fází z celku, např. „3/6“. */
export function phaseProgress(phases: readonly PhaseView[]): { done: number; total: number } {
  return {
    done: phases.filter((p) => p.status === "done" || p.status === "skipped").length,
    total: phases.length,
  };
}

/* ---------- ukončení zakázky ---------- */

/** Věty upozornění při dokončení zakázky (upozorní, nezablokuje, ZAK-18). */
export function completeWarnings(
  p: Pick<CompletePreview, "openTasks" | "unpaidPayments">,
): string[] {
  const out: string[] = [];
  if (p.openTasks > 0)
    out.push(
      `Zakázka má ještě ${plural(p.openTasks, "otevřený úkol", "otevřené úkoly", "otevřených úkolů")}.`,
    );
  if (p.unpaidPayments > 0)
    out.push(
      `Zakázka má ${plural(p.unpaidPayments, "neuhrazenou platbu", "neuhrazené platby", "neuhrazených plateb")}.`,
    );
  return out;
}

/** Zda se má při přechodu do stavu otevřít dialog dokončení (Dokončená a Zrušená). */
export function isClosingStatus(status: JobStatus): boolean {
  return status === "done" || status === "cancelled";
}

/** Důvod dokončení podle cílového stavu (a typu: u retaineru `retainer_ended`). */
export function reasonForStatus(
  status: "done" | "cancelled",
  job: { type: ServiceType; marketingStage: MarketingStage | null },
): "finished" | "retainer_ended" | "cancelled" {
  if (status === "cancelled") return "cancelled";
  return job.type === "marketing" && job.marketingStage === "retainer"
    ? "retainer_ended"
    : "finished";
}

/* ---------- board a seznam ---------- */

/** Všechny karty výsledku boardu (každá zakázka jednou, i kdyby ležela ve více sloupcích). */
export function cardsOf(result: BoardResult | undefined): BoardCardX[] {
  const seen = new Set<string>();
  const out: BoardCardX[] = [];
  for (const col of result?.columns ?? [])
    for (const card of col.cards) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      out.push(card as BoardCardX);
    }
  return out;
}

/** Co udělá přetažení karty do sloupce. */
export type DropOutcome =
  { kind: "noop" } | { kind: "status"; status: JobStatus } | { kind: "phase"; phaseName: string };

/** Výsledek přetažení karty do sloupce: změna stavu, změna fáze, nebo nic (karta už ve sloupci je). */
export function dropOutcome(
  by: "status" | "phase",
  column: Pick<BoardColumn, "status" | "phaseName">,
  card: Pick<BoardCard, "status" | "currentPhaseName">,
): DropOutcome {
  if (by === "status") {
    if (!column.status || column.status === card.status) return { kind: "noop" };
    return { kind: "status", status: column.status };
  }
  if (!column.phaseName || column.phaseName === card.currentPhaseName) return { kind: "noop" };
  return { kind: "phase", phaseName: column.phaseName };
}

/** Filtry seznamu zakázek. */
export type ListFilter = {
  q: string;
  type: ServiceType | "all";
  /** Živé (plánované, aktivní, pozastavené), uzavřené (dokončené, zrušené), nebo všechny. */
  scope: "live" | "closed" | "all";
  /** Jen zakázky, které vlastním; `null` = všechny. */
  mineUserId: string | null;
  onlyWarning: boolean;
};

/** Výchozí filtr seznamu: živé zakázky všech typů. */
export const DEFAULT_FILTER: ListFilter = {
  q: "",
  type: "all",
  scope: "live",
  mineUserId: null,
  onlyWarning: false,
};

/** Filtruje karty seznamu podle hledání (kód, název, klient, vlastník, fáze, členové), typu, rozsahu a vlastníka. */
export function filterCards(cards: readonly BoardCardX[], f: ListFilter): BoardCardX[] {
  const q = fold(f.q);
  return cards.filter((c) => {
    const closed = c.status === "done" || c.status === "cancelled";
    if (f.scope === "live" && closed) return false;
    if (f.scope === "closed" && !closed) return false;
    if (f.type !== "all" && c.type !== f.type) return false;
    if (
      f.mineUserId &&
      c.ownerId !== f.mineUserId &&
      !c.members?.some((m) => m.userId === f.mineUserId)
    )
      return false;
    if (f.onlyWarning && !c.overdue && !c.slipping) return false;
    if (!q) return true;
    const hay = fold(
      [
        c.number,
        c.title,
        c.companyName,
        c.ownerName,
        c.currentPhaseName,
        ...(c.members ?? []).map((m) => m.name),
      ].join(" "),
    );
    return q.split(/\s+/).every((word) => hay.includes(word));
  });
}

/** Sloupce, podle kterých jde řadit seznam. */
export type SortKey =
  "number" | "title" | "company" | "type" | "status" | "phase" | "owner" | "due" | "price";

const STATUS_ORDER: Record<JobStatus, number> = {
  active: 0,
  planned: 1,
  paused: 2,
  done: 3,
  cancelled: 4,
};

/** Seřadí karty (stabilně); prázdné hodnoty jdou vždy na konec. */
export function sortCards(
  cards: readonly BoardCardX[],
  key: SortKey,
  dir: "asc" | "desc",
): BoardCardX[] {
  const value = (c: BoardCardX): string | number | null => {
    switch (key) {
      case "number":
        return c.number;
      case "title":
        return fold(c.title);
      case "company":
        return fold(c.companyName) || null;
      case "type":
        return JOB_TYPE_LABELS[c.type];
      case "status":
        return STATUS_ORDER[c.status];
      case "phase":
        return fold(c.currentPhaseName) || null;
      case "owner":
        return fold(c.ownerName) || null;
      case "due":
        return c.dueDate;
      case "price":
        return c.priceMinor;
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return cards
    .map((c, i) => ({ c, i, v: value(c) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const cmp =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), "cs");
      return cmp * sign || a.i - b.i;
    })
    .map((x) => x.c);
}

/** Součet hodnoty karet (jen ty, které mají cenu); `null`, když žádná cenu nemá nebo ji aktér nesmí vidět. */
export function sumPrice(cards: readonly Pick<BoardCard, "priceMinor">[]): number | null {
  const priced = cards.filter((c) => c.priceMinor !== null);
  return priced.length ? priced.reduce((n, c) => n + (c.priceMinor ?? 0), 0) : null;
}

/* ---------- úkoly po fázích ---------- */

/** Zda je úkol otevřený (K řešení, Probíhá). */
export function isTaskOpen(t: Pick<TaskLite, "status">): boolean {
  return t.status === "todo" || t.status === "in_progress";
}

/** Zda je otevřený úkol po termínu. */
export function isTaskOverdue(
  t: Pick<TaskLite, "status" | "dueDate">,
  today: string = todayPrague(),
): boolean {
  return isTaskOpen(t) && !!t.dueDate && t.dueDate < today;
}

/**
 * Úkoly seskupené podle fází zakázky (v pořadí fází) a na konci skupina „Bez fáze“ (úkoly bez fáze i s neznámou fází,
 * UKO-08). Otevřené úkoly jsou podle termínu (bez termínu na konci), hotové zvlášť.
 */
export function groupTasksByPhase(
  tasks: readonly TaskLite[],
  phases: readonly PhaseView[],
): TaskGroup[] {
  const sorted = [...phases].sort((a, b) => a.position - b.position);
  const known = new Set(sorted.map((p) => p.id));
  const byDue = (a: TaskLite, b: TaskLite) =>
    (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
    a.title.localeCompare(b.title, "cs");
  const build = (key: string, phase: PhaseView | null, list: TaskLite[]): TaskGroup => ({
    key,
    phaseId: phase?.id ?? null,
    name: phase?.name ?? "Bez fáze",
    phase,
    open: list.filter(isTaskOpen).sort(byDue),
    closed: list.filter((t) => !isTaskOpen(t)).sort(byDue),
  });
  const groups = sorted.map((p) =>
    build(
      p.id,
      p,
      tasks.filter((t) => t.jobPhaseId === p.id),
    ),
  );
  groups.push(
    build(
      "none",
      null,
      tasks.filter((t) => !t.jobPhaseId || !known.has(t.jobPhaseId)),
    ),
  );
  return groups;
}

/** Počty úkolů zakázky: otevřené a po termínu. */
export function taskCounts(
  tasks: readonly TaskLite[],
  today: string = todayPrague(),
): { open: number; overdue: number } {
  return {
    open: tasks.filter(isTaskOpen).length,
    overdue: tasks.filter((t) => isTaskOverdue(t, today)).length,
  };
}

/** Úprava, kterou udělá přetažení úkolu do jiné skupiny; `null`, když už v ní je. */
export function taskMovePatch(
  task: Pick<TaskLite, "id" | "jobPhaseId">,
  targetPhaseId: string | null,
): { id: string; jobPhaseId: string | null } | null {
  return (task.jobPhaseId ?? null) === targetPhaseId
    ? null
    : { id: task.id, jobPhaseId: targetPhaseId };
}

/* ---------- retainer ---------- */

/** Formulář „Pokračovat na retainer“ i „Rovnou retainer“. */
export type RetainerForm = {
  amountMinor: number | null;
  fromMonth: YearMonth;
  issueDay: number;
  issuerMode: "fixed" | "alternate";
  /** Fakturující (u střídání ten, kdo fakturuje první měsíc). */
  issuerId: string | null;
  /** Rozdělení; `null` = výchozí z Nastavení → Finance. */
  split: SplitRuleInput[] | null;
};

/** Následující měsíc po `now` ve tvaru `RRRR-MM`. */
export function nextMonth(now: Date = new Date()): YearMonth {
  const [y, m] = todayPrague(now).split("-").map(Number) as [number, number];
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `${next.y}-${String(next.m).padStart(2, "0")}`;
}

/** Výchozí hodnoty formuláře retaineru: od příštího měsíce, vystavení 1. dne, fakturuje vlastník. */
export function defaultRetainerForm(ownerId: string | null, now: Date = new Date()): RetainerForm {
  return {
    amountMinor: null,
    fromMonth: nextMonth(now),
    issueDay: 1,
    issuerMode: "fixed",
    issuerId: ownerId,
    split: null,
  };
}

/** Chyby formuláře retaineru podle pole (prázdný objekt = platné). */
export function retainerErrors(
  f: RetainerForm,
): Partial<Record<"amount" | "fromMonth" | "issueDay" | "issuer", string>> {
  const e: Partial<Record<"amount" | "fromMonth" | "issueDay" | "issuer", string>> = {};
  if (!f.amountMinor || f.amountMinor <= 0) e.amount = "Zadejte měsíční částku.";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.fromMonth)) e.fromMonth = "Zadejte měsíc ve tvaru RRRR-MM.";
  if (!Number.isInteger(f.issueDay) || f.issueDay < 1 || f.issueDay > 28)
    e.issueDay = "Den vystavení je 1 až 28.";
  if (!f.issuerId) e.issuer = "Vyberte, kdo fakturuje.";
  return e;
}

/** Formulář → `RetainerSetup` pro finance; `null`, když je neplatný. Rozdělení bez hodnoty = výchozí z Nastavení. */
export function toRetainerSetup(f: RetainerForm): RetainerSetup | null {
  if (Object.keys(retainerErrors(f)).length) return null;
  return {
    amountMinor: f.amountMinor!,
    fromMonth: f.fromMonth,
    issueDay: f.issueDay,
    issuerMode: f.issuerMode,
    issuerId: f.issuerId!,
    ...(f.issuerMode === "alternate" ? { firstIssuerId: f.issuerId! } : {}),
    split: f.split ?? [],
  };
}

/** Měsíc `RRRR-MM` česky („prosinec 2026“). */
export function monthLabel(ym: YearMonth): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  );
}

/* ---------- založení zakázky ---------- */

/** Název nové zakázky podle klienta a typu: „{klient} – {typ}“. */
export function defaultTitle(clientName: string | null | undefined, type: ServiceType): string {
  const typeName = JOB_TYPE_LABELS[type];
  return clientName?.trim() ? `${clientName.trim()} – ${typeName}` : typeName;
}

/** Řádek dialogu „Založit zakázky z obchodu“ (upravitelný stav). */
export type DealRow = {
  key: string;
  type: ServiceType;
  /** `null` = prázdná zakázka bez šablony, `undefined` = výchozí šablona typu. */
  templateId: string | null | undefined;
  title: string;
  startDate: string;
  ownerId: string | null;
  memberIds: string[];
  /** U marketingu „Úvodní fáze → retainer“ (výchozí) nebo „Rovnou retainer“. */
  billingModel: BillingModel | undefined;
  split: SplitRuleInput[] | null;
  retainer: RetainerForm;
};

let rowSeq = 0;
/** Nový unikátní klíč řádku (jen pro React `key`). */
export function newRowKey(): string {
  rowSeq += 1;
  return `row-${rowSeq}`;
}

/** Výchozí model fakturace nového řádku: marketing „Úvodní fáze → retainer“, ostatní podle šablony. */
export function defaultBillingFor(type: ServiceType): BillingModel | undefined {
  return type === "marketing" ? "intro_then_retainer" : undefined;
}

/** Prázdný řádek pro službu; šablona výchozí, start dnes, vlastník obchodu. */
export function blankRow(
  type: ServiceType,
  o: { clientName?: string | null; ownerId?: string | null; startDate?: string; now?: Date },
): DealRow {
  return {
    key: newRowKey(),
    type,
    templateId: undefined,
    title: defaultTitle(o.clientName, type),
    startDate: o.startDate ?? todayPrague(o.now),
    ownerId: o.ownerId ?? null,
    memberIds: [],
    billingModel: defaultBillingFor(type),
    split: null,
    retainer: defaultRetainerForm(o.ownerId ?? null, o.now),
  };
}

/** Normalizuje odpověď `zakazky.prefillFromDeal`: pole řádků, nebo objekt s polem `rows`. */
export function prefillRowsOf(result: unknown): PrefillRow[] {
  if (Array.isArray(result)) return result as PrefillRow[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows))
    return (result as { rows: PrefillRow[] }).rows;
  return [];
}

/**
 * Řádky dialogu z předvyplnění serveru; chybí-li odpověď (příkaz není k dispozici), vyrobí se lokálně jeden řádek
 * za službu s výchozími hodnotami.
 */
export function rowsFromPrefill(
  result: unknown,
  o: {
    services: readonly ServiceType[];
    clientName?: string | null;
    ownerId?: string | null;
    now?: Date;
  },
): DealRow[] {
  const prefill = prefillRowsOf(result);
  if (!prefill.length)
    return o.services.map((type) =>
      blankRow(type, { clientName: o.clientName, ownerId: o.ownerId, now: o.now }),
    );
  return prefill.map((p) => ({
    key: newRowKey(),
    type: p.type,
    templateId: p.templateId ?? undefined,
    title: p.title,
    startDate: p.startDate,
    ownerId: p.ownerId ?? o.ownerId ?? null,
    memberIds: p.memberIds,
    billingModel: p.type === "marketing" ? p.billingModel : undefined,
    split: null,
    retainer: defaultRetainerForm(p.ownerId ?? o.ownerId ?? null, o.now),
  }));
}

/** Chyby řádku (prázdný název, chybí vlastník, neplatný retainer u „Rovnou retainer“). */
export function rowErrors(row: DealRow): string[] {
  const out: string[] = [];
  if (!row.title.trim()) out.push("Vyplňte název zakázky.");
  if (!row.ownerId) out.push("Vyberte vlastníka.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.startDate)) out.push("Zadejte datum zahájení.");
  if (row.type === "marketing" && row.billingModel === "retainer") {
    const e = retainerErrors(row.retainer);
    out.push(...Object.values(e));
  }
  return out;
}

/** Řádky dialogu → vstup `createJobsFromWonDeal` (rozdělení a retainer jen tam, kde je uživatel nastavil). */
export function toApiRows(rows: readonly DealRow[]): JobFromDealRow[] {
  return rows.map((r) => {
    const retainer =
      r.type === "marketing" && r.billingModel === "retainer" ? toRetainerSetup(r.retainer) : null;
    return {
      type: r.type,
      templateId: r.templateId ?? null,
      title: r.title.trim(),
      startDate: r.startDate,
      ownerId: r.ownerId!,
      memberIds: r.memberIds.filter((id) => id !== r.ownerId),
      ...(r.billingModel ? { billingModel: r.billingModel } : {}),
      ...(r.split ? { split: r.split } : {}),
      ...(retainer ? { retainer: { ...retainer, split: r.split ?? retainer.split } } : {}),
    };
  });
}

/**
 * Šablona, kterou má řádek použít: konkrétní volba, `null` = žádná, `undefined` = výchozí šablona typu. Vrací
 * hodnotu pro `templateId` příkazu `zakazky.create` (vynechané = výchozí).
 */
export function templateChoice(value: string | null | undefined): { templateId?: string | null } {
  return value === undefined ? {} : { templateId: value };
}

/** Popisek volby šablony v seznamu („Výchozí: Web – standard“). */
export function templateOptionLabel(t: { name: string; isDefault: boolean }): string {
  return t.isDefault ? `${t.name} (výchozí)` : t.name;
}

/** Datum startu a termínu: termín nesmí být před startem. */
export function dateOrderError(
  start: string | null | undefined,
  due: string | null | undefined,
): string | null {
  if (start && due && due < start) return "Termín nesmí být před začátkem.";
  return null;
}

/* ---------- šablony zakázek (editor) ---------- */

type Payload = TemplatePayloadData;
type TPhase = Payload["phases"][number];
type TTask = Payload["tasks"][number];
type TPayment = Payload["payments"][number];

/** Prázdný obsah šablony. */
export function emptyPayload(): Payload {
  return { v: 1, phases: [], tasks: [], payments: [] };
}

/** Přidá fázi na konec; začíná po konci předchozí. */
export function addPhase(p: Payload, name = "Nová fáze"): Payload {
  const last = p.phases.at(-1);
  const offsetDays = last ? last.offsetDays + Math.max(last.durationDays, 1) : 0;
  return { ...p, phases: [...p.phases, { name, role: null, offsetDays, durationDays: 7 }] };
}

/** Upraví fázi na indexu. */
export function updatePhase(p: Payload, index: number, patch: Partial<TPhase>): Payload {
  return { ...p, phases: p.phases.map((f, i) => (i === index ? { ...f, ...patch } : f)) };
}

/**
 * Odebere fázi; její úkoly přejdou do předchozí fáze (u první do nové první), úkoly dalších fází se přečíslují, aby
 * `phaseIndex` dál ukazoval na stejnou fázi.
 */
export function removePhase(p: Payload, index: number): Payload {
  if (index < 0 || index >= p.phases.length) return p;
  const phases = p.phases.filter((_, i) => i !== index);
  const tasks = p.tasks.map((t) => {
    if (t.phaseIndex > index) return { ...t, phaseIndex: t.phaseIndex - 1 };
    if (t.phaseIndex === index)
      return { ...t, phaseIndex: Math.max(0, Math.min(index - 1, phases.length - 1)) };
    return t;
  });
  return { ...p, phases, tasks };
}

/** Posune fázi o jedno nahoru (`-1`) nebo dolů (`1`); úkoly sledují svou fázi. */
export function movePhase(p: Payload, index: number, dir: -1 | 1): Payload {
  const to = index + dir;
  if (index < 0 || to < 0 || index >= p.phases.length || to >= p.phases.length) return p;
  const phases = [...p.phases];
  [phases[index], phases[to]] = [phases[to]!, phases[index]!];
  const tasks = p.tasks.map((t) =>
    t.phaseIndex === index
      ? { ...t, phaseIndex: to }
      : t.phaseIndex === to
        ? { ...t, phaseIndex: index }
        : t,
  );
  return { ...p, phases, tasks };
}

/** Přidá úkol do fáze (výchozí hodnoty jako v kontraktu). */
export function addTask(p: Payload, phaseIndex: number, title = ""): Payload {
  const task: TTask = {
    phaseIndex: Math.max(0, Math.min(phaseIndex, Math.max(p.phases.length - 1, 0))),
    title,
    typeKey: "task",
    priority: "medium",
    assignee: { rule: "owner" },
    dueOffsetDays: null,
    estimateMin: null,
    description: null,
  };
  return { ...p, tasks: [...p.tasks, task] };
}

/** Upraví úkol na indexu. */
export function updateTask(p: Payload, index: number, patch: Partial<TTask>): Payload {
  return { ...p, tasks: p.tasks.map((t, i) => (i === index ? { ...t, ...patch } : t)) };
}

/** Odebere úkol na indexu. */
export function removeTask(p: Payload, index: number): Payload {
  return { ...p, tasks: p.tasks.filter((_, i) => i !== index) };
}

/** Přidá plánovanou platbu. */
export function addPayment(p: Payload): Payload {
  const pay: TPayment = {
    description: "",
    kind: "one_off",
    amountMinor: 0,
    issuer: { rule: "owner" },
    dueOffsetDays: null,
  };
  return { ...p, payments: [...p.payments, pay] };
}

/** Upraví platbu na indexu. */
export function updatePayment(p: Payload, index: number, patch: Partial<TPayment>): Payload {
  return { ...p, payments: p.payments.map((x, i) => (i === index ? { ...x, ...patch } : x)) };
}

/** Odebere platbu na indexu. */
export function removePayment(p: Payload, index: number): Payload {
  return { ...p, payments: p.payments.filter((_, i) => i !== index) };
}

/** Součet plánovaných plateb v haléřích. */
export function paymentsTotal(p: Payload): number {
  return p.payments.reduce((n, x) => n + (x.amountMinor || 0), 0);
}

/** Chyby obsahu šablony před uložením (stejná pravidla jako zod kontrakt; server je vždy ověří znovu). */
export function payloadIssues(p: Payload): string[] {
  const out: string[] = [];
  if (p.phases.some((f) => !f.name.trim())) out.push("Každá fáze potřebuje název.");
  const roles = p.phases.map((f) => f.role).filter((r): r is PhaseRole => !!r);
  if (new Set(roles).size !== roles.length)
    out.push("Každou zvláštní roli smí mít nejvýš jedna fáze.");
  if (p.tasks.some((t) => !t.title.trim())) out.push("Každý úkol potřebuje název.");
  if (p.tasks.some((t) => t.assignee.rule === "user" && !t.assignee.userId))
    out.push("U úkolů s řešitelem „Konkrétní uživatel“ vyberte uživatele.");
  if (p.payments.some((x) => !x.description.trim())) out.push("Každá platba potřebuje popis.");
  if (p.payments.some((x) => !(x.amountMinor > 0)))
    out.push("Částka každé platby musí být kladná.");
  if (p.payments.some((x) => x.issuer.rule === "user" && !x.issuer.userId))
    out.push("U plateb s fakturujícím „Konkrétní uživatel“ vyberte uživatele.");
  return out;
}

/** Zda se obsah šablony od uložené podoby liší. */
export function payloadDirty(saved: Payload, current: Payload): boolean {
  return JSON.stringify(saved) !== JSON.stringify(current);
}

/** Plánované datum fáze šablony pro náhled („den 0–6 od startu“). */
export function phaseSpan(f: Pick<TPhase, "offsetDays" | "durationDays">): string {
  const end = f.offsetDays + Math.max(f.durationDays, 1) - 1;
  return end === f.offsetDays ? `den ${f.offsetDays}` : `dny ${f.offsetDays}–${end}`;
}

/** Úkoly šablony po fázích (pro zobrazení v editoru) s původním indexem v poli `tasks`. */
export function tasksByPhaseIndex(
  p: Payload,
): { phaseIndex: number; tasks: { task: TTask; index: number }[] }[] {
  const count = Math.max(p.phases.length, 1);
  return Array.from({ length: count }, (_, phaseIndex) => ({
    phaseIndex,
    tasks: p.tasks.flatMap((task, index) =>
      task.phaseIndex === phaseIndex ? [{ task, index }] : [],
    ),
  }));
}

/** Datum splatnosti úkolu nebo platby při startu zakázky `start` (náhled v editoru). */
export function dueFromStart(start: string, offsetDays: number | null): string | null {
  return offsetDays === null ? null : addDays(start, offsetDays);
}
