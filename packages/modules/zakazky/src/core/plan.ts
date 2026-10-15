import type { BillingModel, PaymentKind, ServiceType } from "@rebar/core/contracts";
import type { TemplatePayloadData } from "../contract";
import { dueFromOffset, phaseDates, type PhaseRole, type PhaseStatus } from "../shared";

/*
  Čisté plánování zakázky ze šablony (bez databáze): z obsahu šablony, startu a lidí udělá konkrétní fáze s daty,
  úkoly s termíny a řešiteli a plánované platby s fakturujícími. Volá ho `createJobTx`; testy v `plan.test.ts`.
*/

/** Vstup plánování: kdo je vlastník a vedoucí, kdo je „ten druhý“ partner a jaký je model fakturace. */
export type PlanOptions = {
  startDate: string;
  ownerId: string;
  /** Vedoucí zakázky; bez něj úkoly s pravidlem „vedoucí“ připadnou vlastníkovi. */
  leadId: string | null;
  /** Druhý partner (pro pravidlo fakturujícího „druhý“); bez něj fakturuje vlastník. */
  otherPartnerId: string | null;
  billingModel: BillingModel;
  /** Jen tyto uživatele lze vybrat pravidlem „konkrétní uživatel“; neznámý se nahradí vlastníkem. */
  knownUserIds?: ReadonlySet<string>;
  /** Zakázka už běží: aktuální fáze je rozpracovaná, jinak jen nezahájená (plánovaná zakázka). */
  active: boolean;
};

/** Plánovaná fáze zakázky. */
export type PlannedPhase = {
  index: number;
  name: string;
  role: PhaseRole | null;
  status: PhaseStatus;
  plannedStart: string;
  plannedEnd: string;
};
/** Plánovaný úkol zakázky. */
export type PlannedTask = {
  phaseIndex: number;
  title: string;
  typeKey: string;
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assigneeId: string | null;
  dueDate: string | null;
  estimateMin: number | null;
  description: string | null;
};
/** Plánovaná platba zakázky. */
export type PlannedPayment = {
  description: string;
  kind: Exclude<PaymentKind, "recurring">;
  amountMinor: number;
  issuerId: string;
  dueOn: string | null;
};
/** Výsledek plánování. */
export type JobPlan = {
  phases: PlannedPhase[];
  tasks: PlannedTask[];
  payments: PlannedPayment[];
  /** Index aktuální fáze (první nepřeskočená), `null` bez fází. */
  currentPhaseIndex: number | null;
  /** Termín zakázky: konec poslední nepřeskočené fáze, `null` bez fází. */
  dueDate: string | null;
};

/** Fáze s rolí `intro_evaluation` existuje jen u modelu „úvodní fáze, pak retainer“; jinak se přeskočí. */
export function phaseSkipped(role: PhaseRole | null, billing: BillingModel): boolean {
  return role === "intro_evaluation" && billing !== "intro_then_retainer";
}

/**
 * Z obsahu šablony vyrobí plán zakázky. Pravidla: fáze dostanou plánovaná data od startu; fáze „Vyhodnocení úvodní
 * fáze“ se přeskočí, když model fakturace není „úvodní fáze, pak retainer“ (a s ní její úkoly); platby druhu `intro`
 * vznikají jen u modelu „úvodní fáze, pak retainer“; první nepřeskočená fáze je aktuální. Řešitel úkolu a fakturující
 * platby se určí podle pravidla (vlastník, vedoucí, druhý partner, konkrétní uživatel).
 */
export function planFromTemplate(payload: TemplatePayloadData, o: PlanOptions): JobPlan {
  const known = (id: string | undefined): id is string =>
    !!id && (!o.knownUserIds || o.knownUserIds.has(id));

  const phases: PlannedPhase[] = payload.phases.map((p, index) => ({
    index,
    name: p.name,
    role: p.role,
    status: phaseSkipped(p.role, o.billingModel) ? "skipped" : "not_started",
    ...phaseDates(o.startDate, p),
  }));
  const current = phases.findIndex((p) => p.status !== "skipped");
  const currentPhaseIndex = current < 0 ? null : current;
  if (currentPhaseIndex !== null && o.active) phases[currentPhaseIndex]!.status = "in_progress";

  const skipped = new Set(phases.filter((p) => p.status === "skipped").map((p) => p.index));
  const assignee = (a: {
    rule: "owner" | "lead" | "user" | "none";
    userId?: string | undefined;
  }) => {
    switch (a.rule) {
      case "none":
        return null;
      case "lead":
        return o.leadId ?? o.ownerId;
      case "user":
        return known(a.userId) ? a.userId : o.ownerId;
      default:
        return o.ownerId;
    }
  };
  const tasks: PlannedTask[] = payload.tasks
    // úkol bez fází v šabloně patří „před všemi fázemi“ (phaseIndex 0 bez fáze nic nepřeskakuje)
    .filter((t) => !skipped.has(t.phaseIndex))
    .map((t) => ({
      phaseIndex: t.phaseIndex,
      title: t.title,
      typeKey: t.typeKey,
      priority: t.priority,
      assigneeId: assignee(t.assignee),
      dueDate: dueFromOffset(o.startDate, t.dueOffsetDays),
      estimateMin: t.estimateMin,
      description: t.description,
    }));

  const issuer = (i: { rule: "owner" | "other" | "user"; userId?: string | undefined }) => {
    if (i.rule === "other") return o.otherPartnerId ?? o.ownerId;
    if (i.rule === "user") return known(i.userId) ? i.userId : o.ownerId;
    return o.ownerId;
  };
  const payments: PlannedPayment[] = payload.payments
    .filter((p) => p.kind !== "intro" || o.billingModel === "intro_then_retainer")
    .map((p) => ({
      description: p.description,
      kind: p.kind,
      amountMinor: p.amountMinor,
      issuerId: issuer(p.issuer),
      dueOn: dueFromOffset(o.startDate, p.dueOffsetDays),
    }));

  const ends = phases.filter((p) => p.status !== "skipped").map((p) => p.plannedEnd);
  return {
    phases,
    tasks,
    payments,
    currentPhaseIndex,
    dueDate: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
  };
}

/** Stav marketingové fáze nové zakázky podle typu a modelu fakturace (`null` mimo marketing). */
export function initialMarketingStage(
  type: ServiceType,
  billing: BillingModel,
): "intro" | "retainer" | null {
  if (type !== "marketing") return null;
  if (billing === "intro_then_retainer") return "intro";
  if (billing === "retainer") return "retainer";
  return null;
}

/** Základní stav nové zakázky: začátek v budoucnu = Plánovaná, jinak Aktivní. */
export function initialStatus(startDate: string, today: string): "planned" | "active" {
  return startDate > today ? "planned" : "active";
}

/** Výchozí název zakázky z řádku dialogu: „{klient} – {typ}“. */
export function defaultJobTitle(companyName: string, typeLabel: string): string {
  return `${companyName} – ${typeLabel}`;
}
