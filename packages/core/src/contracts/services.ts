import type { ClientTabProvider } from "./client-card";
import type { EmailVarsProvider } from "./email-vars";
import type {
  BillingModel,
  ClientStatus,
  DriveState,
  PaymentKind,
  ServiceType,
  SplitRuleInput,
  YearMonth,
} from "./types";
import type { Ctx } from "../rbac/types";

/** Úkol z šablony zakázky (vstup `tasks.createFromTemplate`). */
export type TemplateTaskInput = {
  phaseId?: string | null;
  title: string;
  typeKey?: string;
  priority?: "none" | "low" | "medium" | "high" | "urgent";
  assigneeId?: string | null;
  dueDate?: string | null;
  estimateMin?: number | null;
  description?: string | null;
};
/** Platba z šablony zakázky (vstup `finance.initJobFinance`). */
export type TemplatePaymentInput = {
  description: string;
  kind: PaymentKind;
  amountMinor: number;
  issuerId: string;
  dueOn?: string | null;
  periodMonth?: YearMonth | null;
};
/** Vstup `tasks.createMeeting` (schůzka z kalendáře = úkol typu Schůzka). */
export type CreateMeetingInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  place?: string | null;
  attendeeEmails?: string[];
  assigneeId?: string | null;
  dealId?: string | null;
  companyId?: string | null;
  personId?: string | null;
  jobId?: string | null;
  isPrivate?: boolean;
};

/**
 * Služby, které modul nabízí ostatním (D §2.3). Volají se přes `deps.services.optional("<klíč>")` — vypnutý nebo
 * zatím nehotový modul službu nemá. Typ je tady v jádru, aby ho konzument nemusel importovat z cizího modulu.
 */
export type ServiceMap = {
  /** Vlastník: modul `klienti`. */
  clients: {
    setStatus(
      ctx: Ctx,
      input: {
        companyId: string;
        status: ClientStatus;
        reason?: string;
        endedOn?: string;
        source: "manual" | "deal_won" | "job_ended";
      },
    ): Promise<{ changed: boolean; clientSince: string | null }>;
    addServices(ctx: Ctx, companyId: string, services: ServiceType[]): Promise<void>;
  };
  /** Vlastník: modul `disk`. */
  disk: {
    requestFolder(
      ctx: Ctx,
      input: { entityType: "company" | "job"; id: string; force?: boolean },
    ): Promise<{ requestId: string | null; skipped?: "private" | "disabled" }>;
    folderState(
      ctx: Ctx,
      entityType: "company" | "job",
      ids: string[],
    ): Promise<Record<string, { state: DriveState; folderId: string | null; url: string | null }>>;
  };
  /** Vlastník: modul `ukoly`. */
  tasks: {
    createFromTemplate(
      ctx: Ctx,
      input: {
        jobId: string;
        ownerId: string;
        leadId?: string;
        startDate: string;
        phaseIds: string[];
        items: TemplateTaskInput[];
      },
    ): Promise<{ taskIds: string[] }>;
    overdueJobIds(ctx: Ctx): Promise<string[]>;
    openCounts(
      ctx: Ctx,
      scope: { jobId?: string; dealId?: string },
    ): Promise<{ open: number; overdue: number }>;
    logDoneActivity(
      ctx: Ctx,
      input: {
        typeKey: "email" | "call";
        subject: string;
        dealId?: string;
        companyId?: string;
        personId?: string;
        jobId?: string;
      },
    ): Promise<{ id: string }>;
    createMeeting(ctx: Ctx, input: CreateMeetingInput): Promise<{ taskId: string }>;
    createPrivateNote(
      ctx: Ctx,
      input: { title: string; bodyJson: unknown },
    ): Promise<{ id: string }>;
    /**
     * Součet odhadu času (`estimateMin`) nezrušených úkolů zakázky, otevřených i hotových, a jejich počet. Podúkoly se
     * nepočítají dvakrát (nadřazený úkol, jehož podúkol má odhad, se vynechá); soukromé úkoly jen tomu, kdo je smí vidět.
     */
    estimateByJob(ctx: Ctx, jobId: string): Promise<{ estimateMin: number; tasks: number }>;
    /** Počet otevřených úkolů po fázích zakázky (klíč = id fáze; fáze bez úkolů mají 0). */
    openCountsByPhase(
      ctx: Ctx,
      input: { jobId: string; phaseIds: string[] },
    ): Promise<Record<string, number>>;
    /** Dokončí otevřené úkoly daných fází zakázky (jako aktér volání, vyšle `task.completed`); vrací jejich počet. */
    completeOpenInPhases(
      ctx: Ctx,
      input: { jobId: string; phaseIds: string[] },
    ): Promise<{ completed: number }>;
    /** Otevřené (nadřazené) úkoly zakázky pro uložení hotové zakázky jako šablony. */
    listForTemplate(
      ctx: Ctx,
      input: { jobId: string },
    ): Promise<
      {
        phaseId: string | null;
        title: string;
        typeKey: string;
        priority: "none" | "low" | "medium" | "high" | "urgent";
        assigneeId: string | null;
        dueDate: string | null;
        estimateMin: number | null;
        description: string | null;
      }[]
    >;
  };
  /** Vlastník: modul `finance`. */
  finance: {
    initJobFinance(
      ctx: Ctx,
      input: {
        jobId: string;
        startDate: string;
        ownerId: string;
        templatePayments: TemplatePaymentInput[];
        split?: SplitRuleInput[];
        billingModel?: BillingModel;
      },
    ): Promise<{ paymentIds: string[] }>;
    defaultSplit(ctx: Ctx): Promise<SplitRuleInput[]>;
    createStandalonePayment(
      ctx: Ctx,
      input: {
        companyId: string;
        description: string;
        amountMinor: number;
        invoiceNumber: string;
        invoiceUrl: string;
        issuedOn: string;
        dueOn?: string;
      },
    ): Promise<{ id: string }>;
    incomeSince(
      ctx: Ctx,
      input: { companyIds: string[]; from: string },
    ): Promise<Record<string, number>>;
    unpaidCount(ctx: Ctx, input: { jobId: string }): Promise<number>;
    allocatedByUser(ctx: Ctx, jobId: string): Promise<Record<string, number>>;
  };
};

/** Klíč služby. */
export type ServiceKey = keyof ServiceMap;

/**
 * Příspěvky modulů, které čte jiný modul (server): modul přidává, hostitel o něm neví. Klíč je v
 * `ModuleServer.contributions`, čte se `deps.services.all("<klíč>")`.
 */
export type ContributionMap = {
  /** Karta klienta: počty záložek, souhrn a metriky seznamu klientů. */
  clientCard: ClientTabProvider;
  /** Proměnné šablon e-mailů pro entitu (`company`, `person`, `deal`, `job`). */
  emailVars: EmailVarsProvider;
};

/** Klíč příspěvku. */
export type ContributionKey = keyof ContributionMap;
