import { z } from "zod";
import type {
  BillingModel,
  JobStatus,
  MarketingStage,
  RetainerSetup,
  ServiceType,
  SplitRuleInput,
} from "@rebar/core/contracts";
import {
  BILLING_MODELS,
  COMPLETE_REASONS,
  JOB_MEMBER_ROLES,
  JOB_STATUSES,
  JOB_TYPES,
  MARKETING_STAGES,
  MAX_PHASES,
  PHASE_ROLES,
  PHASE_STATUSES,
  type CompleteReason,
  type MemberRole,
  type PhaseRole,
  type PhaseStatus,
} from "./shared";

/*
  Kontrakt příkazů modulu „zakazky“ (ZAK-A, M1): zod vstupy všech příkazů `zakazky.*`, tvary výstupů (typy) a tvar obsahu
  šablony. Čte ho UI (ZAK-B, jen `import type`) i ostatní moduly (typy přes `api.ts`). Peníze jsou v haléřích (CZK),
  data `YYYY-MM-DD`, id UUID. Veřejné funkce pro jiné moduly jsou v `api.ts`.
*/

const id = z.uuid();
const isoDate = z.iso.date();
const text = (max: number) => z.string().trim().max(max);
const name = z.string().trim().min(1, "Vyplňte název.").max(160);

/* ---------- společné hodnoty ---------- */

export const serviceType = z.enum(JOB_TYPES);
export const jobStatus = z.enum(JOB_STATUSES);
export const billingModel = z.enum(BILLING_MODELS);
export const marketingStage = z.enum(MARKETING_STAGES);
export const phaseRole = z.enum(PHASE_ROLES);
export const phaseStatus = z.enum(PHASE_STATUSES);
export const memberRole = z.enum(JOB_MEMBER_ROLES);
export const completeReason = z.enum(COMPLETE_REASONS);
const paymentKind = z.enum(["one_off", "intro", "retainer", "extra", "recurring"]);
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Měsíc ve tvaru RRRR-MM.");

/** Pravidlo rozdělení platby (stejný tvar jako `SplitRuleInput` z kontraktů jádra). */
export const splitRuleInput = z.object({
  userId: id,
  mode: z.enum(["percent", "fixed_per_payment", "fixed_total"]),
  percent: z.number().min(0).max(100).optional(),
  fixedMinor: z.number().int().min(0).optional(),
  appliesTo: z.union([z.literal("all"), paymentKind]),
  validFrom: yearMonth.nullish(),
  validTo: yearMonth.nullish(),
}) satisfies z.ZodType<SplitRuleInput>;

/** Nastavení retaineru při založení („Rovnou retainer“, R-36); stejný tvar jako `RetainerSetup` z kontraktů jádra. */
export const retainerSetup = z.object({
  amountMinor: z.number().int().positive(),
  fromMonth: yearMonth,
  issueDay: z.number().int().min(1).max(28),
  issuerMode: z.enum(["fixed", "alternate"]),
  issuerId: id,
  firstIssuerId: id.optional(),
  split: z.array(splitRuleInput),
}) satisfies z.ZodType<RetainerSetup>;

/* ---------- obsah šablony (`job_template.payload`, verze 1) ---------- */

/** Fáze šablony: posun začátku a délka ve dnech od startu zakázky; `role` označuje fázi se zvláštním významem. */
export const templatePhase = z.object({
  name,
  role: phaseRole.nullable().default(null),
  offsetDays: z.number().int().min(0).max(3650).default(0),
  durationDays: z.number().int().min(0).max(3650).default(0),
});
/** Pravidlo, kdo úkol z šablony řeší (vlastník, vedoucí zakázky, konkrétní uživatel, nikdo). */
export const templateAssignee = z.object({
  rule: z.enum(["owner", "lead", "user", "none"]),
  userId: id.optional(),
});
/** Úkol šablony: `phaseIndex` je pořadí fáze v šabloně od 0, termín = počet dní od startu zakázky. */
export const templateTask = z.object({
  phaseIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_PHASES - 1)
    .default(0),
  title: z.string().trim().min(1, "Vyplňte název úkolu.").max(200),
  typeKey: z.string().trim().min(1).max(40).default("task"),
  priority: z.enum(["none", "low", "medium", "high", "urgent"]).default("medium"),
  assignee: templateAssignee.default({ rule: "owner" }),
  dueOffsetDays: z.number().int().min(0).max(3650).nullable().default(null),
  estimateMin: z.number().int().min(0).max(100_000).nullable().default(null),
  description: z.string().max(4000).nullable().default(null),
});
/** Plánovaná platba šablony: splatnost = počet dní od startu zakázky, fakturující podle pravidla. */
export const templatePayment = z.object({
  description: z.string().trim().min(1, "Vyplňte popis platby.").max(200),
  kind: z.enum(["one_off", "intro", "retainer", "extra"]).default("one_off"),
  amountMinor: z.number().int().positive("Částka musí být kladná."),
  issuer: z
    .object({ rule: z.enum(["owner", "other", "user"]), userId: id.optional() })
    .default({ rule: "owner" }),
  dueOffsetDays: z.number().int().min(0).max(3650).nullable().default(null),
});
/** Celý obsah šablony. Fáze, úkoly a platby se při založení zakázky zkopírují; pozdější změna šablony je neovlivní. */
export const templatePayload = z
  .object({
    v: z.literal(1).default(1),
    phases: z.array(templatePhase).max(MAX_PHASES).default([]),
    tasks: z.array(templateTask).max(500).default([]),
    payments: z.array(templatePayment).max(40).default([]),
  })
  .superRefine((p, ctx) => {
    p.tasks.forEach((t, i) => {
      if (t.phaseIndex >= Math.max(p.phases.length, 1))
        ctx.addIssue({
          code: "custom",
          path: ["tasks", i, "phaseIndex"],
          message: "Úkol odkazuje na neexistující fázi.",
        });
      if (t.assignee.rule === "user" && !t.assignee.userId)
        ctx.addIssue({
          code: "custom",
          path: ["tasks", i, "assignee"],
          message: "Vyberte uživatele, který úkol řeší.",
        });
    });
    p.payments.forEach((pay, i) => {
      if (pay.issuer.rule === "user" && !pay.issuer.userId)
        ctx.addIssue({
          code: "custom",
          path: ["payments", i, "issuer"],
          message: "Vyberte, kdo platbu fakturuje.",
        });
    });
    const roles = p.phases.map((f) => f.role).filter((r): r is PhaseRole => !!r);
    if (new Set(roles).size !== roles.length)
      ctx.addIssue({
        code: "custom",
        path: ["phases"],
        message: "Každou zvláštní roli smí mít nejvýš jedna fáze.",
      });
  });
/** Obsah šablony tak, jak ho smí zadat volající (před doplněním výchozích hodnot). */
export type TemplatePayloadInput = z.input<typeof templatePayload>;
/** Obsah šablony po kontrole a doplnění výchozích hodnot. */
export type TemplatePayloadData = z.output<typeof templatePayload>;

/* ---------- vznik zakázky ---------- */

const jobCore = {
  title: name,
  type: serviceType,
  companyId: id,
  ownerId: id,
  /** Další členové týmu (role `member`); vlastník se do týmu nepřidává. */
  memberIds: z.array(id).max(20).default([]),
  /** Vedoucí zakázky (role `lead`); bez něj úkoly s pravidlem „vedoucí“ připadnou vlastníkovi. */
  leadId: id.nullish(),
  startDate: isoDate.optional(),
  dueDate: isoDate.nullish(),
  billingModel: billingModel.optional(),
  /** Rozdělení plateb; bez něj platí výchozí z Nastavení → Finance. */
  split: z.array(splitRuleInput).optional(),
  /** Nastavení retaineru („Rovnou retainer“); vynutí model fakturace `retainer`. */
  retainer: retainerSetup.optional(),
  priceMinor: z.number().int().min(0).nullish(),
  description: text(10_000).nullish(),
  dealId: id.nullish(),
  /** Založit prázdnou zakázku bez fází, úkolů a plateb (nepoužije se ani výchozí šablona typu). */
  withoutTemplate: z.boolean().optional(),
  /** Soukromá zakázka (smí jen ten, kdo vidí soukromé). */
  isPrivate: z.boolean().optional(),
};

/**
 * Založení zakázky. `templateId` vynechané nebo `null` = výchozí šablona typu (žádná není = prázdná zakázka), UUID =
 * konkrétní (neaarchivovaná) šablona stejného typu, `withoutTemplate` = prázdná zakázka bez fází, úkolů a plateb.
 */
export const createInput = z.object({ ...jobCore, templateId: id.nullish() });
/** Vstup založení zakázky (před doplněním výchozích hodnot). */
export type CreateJobInput = z.input<typeof createInput>;

/** Založení z konkrétní šablony (`templateId` je povinné). */
export const createFromTemplateInput = z.object({ ...jobCore, templateId: id });

/** Jeden řádek dialogu „Založit zakázky“ po výhře obchodu. */
export const jobFromDealRow = z.object({
  type: serviceType,
  /** Šablona řádku; `null` = výchozí šablona typu. */
  templateId: id.nullable(),
  /** Prázdný název se nahradí „{klient} – {typ}“. */
  title: z.string().trim().max(160),
  startDate: isoDate,
  ownerId: id,
  memberIds: z.array(id).max(20),
  leadId: id.nullish(),
  billingModel: billingModel.optional(),
  split: z.array(splitRuleInput).optional(),
  retainer: retainerSetup.optional(),
});
/** Řádek dialogu „Založit zakázky“ po výhře obchodu (před doplněním výchozích hodnot). */
export type JobFromDealRow = z.input<typeof jobFromDealRow>;

/** Vstup `createJobsFromWonDeal` (API) i případného příkazu obchodů, který ho volá. */
export const jobsFromDealInput = z.object({
  dealId: id,
  companyId: id,
  rows: z.array(jobFromDealRow).max(10),
  dealValueMinor: z.number().int().min(0).nullish(),
});

/** Předvyplnění dialogu „Založit zakázky“: řádek za každou službu obchodu. */
export const prefillInput = z.object({
  companyId: id,
  services: z.array(serviceType).min(1).max(3),
  ownerId: id.optional(),
  startDate: isoDate.optional(),
  dealValueMinor: z.number().int().min(0).nullish(),
});

/* ---------- čtení ---------- */

export const detailInput = z.object({ jobId: id });
export const boardInput = z.object({
  by: z.enum(["status", "phase"]),
  /** U boardu podle fází povinný: sloupce jsou fáze výchozí šablony typu. */
  type: serviceType.optional(),
  /** Včetně dokončených a zrušených zakázek. */
  includeClosed: z.boolean().default(false),
});
export const phasePreviewInput = z.object({ jobId: id, phaseId: id });
export const completePreviewInput = z.object({ jobId: id });

/* ---------- fáze ---------- */

/** Nastaví aktuální fázi (klik na pás fází nebo přetažení karty na boardu): buď `phaseId`, nebo `phaseName`. */
export const setPhaseInput = z
  .object({
    jobId: id,
    phaseId: id.optional(),
    phaseName: text(160).optional(),
    /** Dokončit i otevřené úkoly fází, které se tím uzavírají (odpověď na dotaz z `phase.preview`). */
    completeOpenTasks: z.boolean().default(false),
  })
  .refine((v) => !!v.phaseId !== !!v.phaseName, {
    message: "Zadejte právě jedno z phaseId a phaseName.",
    path: ["phaseId"],
  });
/** Dokončí fázi (i všechny dřívější) a posune aktuální fázi na další. */
export const phaseCompleteInput = z.object({
  jobId: id,
  phaseId: id,
  completeOpenTasks: z.boolean().default(false),
});
/** Úprava seznamu fází zakázky: pořadí, názvy, role, plánovaná data; chybějící fáze se odeberou. */
export const phasesEditInput = z.object({
  jobId: id,
  phases: z
    .array(
      z.object({
        id: id.optional(),
        name,
        role: phaseRole.nullable().default(null),
        plannedStart: isoDate.nullish(),
        plannedEnd: isoDate.nullish(),
      }),
    )
    .min(1, "Zakázka potřebuje aspoň jednu fázi.")
    .max(MAX_PHASES),
});

/* ---------- stav ---------- */

/** Změna stavu. Přechod do Dokončená/Zrušená je totéž co `complete` (důvod `finished`/`cancelled`). */
export const setStatusInput = z.object({ jobId: id, status: jobStatus });
export const completeInput = z.object({ jobId: id, reason: completeReason });
/** Po ukončení zakázky: klient přejde do stavu Bývalý (přes službu `clients`). */
export const clientSetFormerInput = z.object({
  jobId: id,
  reason: text(500).optional(),
  endedOn: isoDate.optional(),
});

/* ---------- tým a další kontakty ---------- */

export const teamAddInput = z.object({ jobId: id, userId: id, role: memberRole.default("member") });
export const teamRemoveInput = z.object({ jobId: id, userId: id });
export const participantAddInput = z.object({ jobId: id, personId: id, role: text(80).nullish() });
export const participantRemoveInput = z.object({ jobId: id, personId: id });

/* ---------- šablony ---------- */

export const templateListInput = z.object({
  type: serviceType.optional(),
  includeArchived: z.boolean().default(false),
});
export const templateGetInput = z.object({ id });
export const templateCreateInput = z.object({
  name,
  type: serviceType,
  description: text(1000).nullish(),
  defaultBillingModel: billingModel.default("one_off"),
  payload: templatePayload.default({ v: 1, phases: [], tasks: [], payments: [] }),
});
export const templateUpdateInput = z.object({
  id,
  name: name.optional(),
  description: text(1000).nullish(),
  defaultBillingModel: billingModel.optional(),
  payload: templatePayload.optional(),
});
export const templateDuplicateInput = z.object({ id, name: name.optional() });
export const templateArchiveInput = z.object({ id, archived: z.boolean().default(true) });
export const templateSetDefaultInput = z.object({ id });
/** Uložení hotové zakázky jako šablony: fáze a otevřené úkoly bez konkrétních dat (termíny jako posuny od startu). */
export const templateSaveFromJobInput = z.object({
  jobId: id,
  name,
  description: text(1000).nullish(),
  includeTasks: z.boolean().default(true),
  /** Přepíše existující šablonu místo založení nové. */
  replaceId: id.optional(),
});

/* ---------- výstupy (tvary pro UI a ostatní moduly) ---------- */

/** Fáze zakázky v detailu a na pásu fází. `openTasks` je `null`, když modul Úkoly není zapnutý. */
export type PhaseView = {
  id: string;
  name: string;
  position: number;
  role: PhaseRole | null;
  status: PhaseStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  completedAt: string | null;
  openTasks: number | null;
};

/** Člen týmu zakázky. */
export type MemberView = { userId: string; name: string; role: MemberRole };

/** Další kontakt na zakázce. */
export type ParticipantView = {
  id: string;
  personId: string;
  personName: string | null;
  role: string | null;
};

/** Detail zakázky pro hlavičku, pás fází a přehled (`zakazky.detail`). */
export type JobDetail = {
  job: {
    id: string;
    number: string;
    title: string;
    companyId: string;
    companyName: string | null;
    type: ServiceType;
    status: JobStatus;
    billingModel: BillingModel;
    marketingStage: MarketingStage | null;
    ownerId: string | null;
    ownerName: string | null;
    startDate: string | null;
    dueDate: string | null;
    completedAt: string | null;
    /** `null`, když aktér nemá `finance.read`. */
    priceMinor: number | null;
    description: string | null;
    dealId: string | null;
    templateId: string | null;
    templateName: string | null;
    currentPhaseId: string | null;
    isPrivate: boolean;
    tags: string[];
  };
  phases: PhaseView[];
  members: MemberView[];
  participants: ParticipantView[];
  counts: {
    /** `null` = modul Úkoly / Finance není zapnutý. */
    openTasks: number | null;
    overdueTasks: number | null;
    unpaidPayments: number | null;
  };
  /** Zakázka je po termínu. */
  overdue: boolean;
  /** Zakázka je ve skluzu: po termínu, nebo má úkoly po termínu. */
  slipping: boolean;
  /** Marketing po vyhodnocení úvodní fáze čeká na volbu Pokračovat na retainer / Ukončit. */
  decisionPending: boolean;
};

/** Karta zakázky na boardu. */
export type BoardCard = {
  id: string;
  number: string;
  title: string;
  companyId: string;
  companyName: string | null;
  type: ServiceType;
  status: JobStatus;
  currentPhaseId: string | null;
  currentPhaseName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  overdue: boolean;
  slipping: boolean;
  priceMinor: number | null;
  isPrivate: boolean;
};
/** Sloupec boardu: podle stavu (`status`) nebo podle názvu fáze (`phaseName`). */
export type BoardColumn = {
  key: string;
  label: string;
  status?: JobStatus;
  phaseName?: string;
  cards: BoardCard[];
};
/** Výsledek `zakazky.board`. */
export type BoardResult = {
  by: "status" | "phase";
  type: ServiceType | null;
  columns: BoardColumn[];
};

/** Co se stane při nastavení fáze: které fáze se uzavřou a kolik mají otevřených úkolů (dotaz před potvrzením). */
export type PhasePreview = {
  target: { id: string; name: string };
  /** Fáze, které se tím dokončí (dřívější nehotové). Prázdné při návratu zpět. */
  completing: { id: string; name: string; openTasks: number | null }[];
  /** Fáze, které se vrátí do stavu Nezahájená (při návratu zpět). */
  reopening: { id: string; name: string }[];
  /** Celkem otevřených úkolů ve fázích, které se dokončují; `null` = neznámé (modul Úkoly není zapnutý). */
  totalOpenTasks: number | null;
  /** `true`, když jde o fázi s rolí retainer, na kterou se u marketingu nepřechází klikem (volí se Pokračovat na retainer). */
  blockedReason: string | null;
};

/** Výsledek `zakazky.setPhase` a `zakazky.phase.complete`. */
export type PhaseChangeResult = {
  completedPhaseIds: string[];
  currentPhaseId: string | null;
  completedTasks: number;
};

/** Co zůstalo otevřené při dokončení zakázky (nezablokuje, jen upozorní). */
export type CompletePreview = {
  openTasks: number;
  unpaidPayments: number;
  clientHasOtherActiveJob: boolean;
  /** Klient zakázky; UI nabídne stav Bývalý, když nemá jinou živou zakázku. */
  clientId: string;
  clientName: string | null;
};
/** Výsledek `zakazky.complete` a `zakazky.setStatus` do uzavřeného stavu. */
export type CompleteResult = CompletePreview & {
  status: JobStatus;
  reason: CompleteReason;
};

/** Předvyplněný řádek dialogu „Založit zakázky“. */
export type PrefillRow = {
  type: ServiceType;
  templateId: string | null;
  templateName: string | null;
  title: string;
  startDate: string;
  ownerId: string | null;
  memberIds: string[];
  billingModel: BillingModel;
  /** Cena předvyplněná hodnotou obchodu (R-39: jen u jediné služby). */
  priceMinor: number | null;
};

/** Souhrn obsahu šablony pro seznam. */
export type TemplateSummary = {
  phases: number;
  tasks: number;
  payments: number;
  paymentsMinor: number;
};
/** Řádek seznamu šablon. */
export type TemplateListItem = {
  id: string;
  name: string;
  type: ServiceType;
  description: string | null;
  defaultBillingModel: BillingModel;
  isDefault: boolean;
  archivedAt: string | null;
  summary: TemplateSummary;
};
/** Šablona i s obsahem (editor). */
export type TemplateView = TemplateListItem & { payload: TemplatePayloadData };

/** Výsledek založení zakázky. */
export type CreatedJob = { id: string; number: string; type: ServiceType };
