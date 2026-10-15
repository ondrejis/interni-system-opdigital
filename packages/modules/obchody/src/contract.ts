import { z } from "zod";
import type { ServiceType, SplitRuleInput, RetainerSetup } from "@rebar/core/contracts";
import {
  DEAL_RESULTS,
  DEAL_SOURCES,
  SERVICE_TYPES,
  type DealResult,
  type DealSource,
} from "./shared";
import type { ActivityState, DealHighlight } from "./deals/logic";

/*
  Kontrakt příkazů modulu „obchody“ (OBC-A, M1): zod vstupy všech příkazů `obchody.*` a tvary výstupů (typy). Čte ho UI
  (OBC-B, jen `import type`) i ostatní moduly (typy přes `api.ts`). Peníze jsou v haléřích (CZK), data `YYYY-MM-DD`,
  časy ISO 8601, id UUID. Veřejné funkce pro jiné moduly (`createDealFromLead`) jsou v `api.ts`.
*/

const id = z.uuid();
const isoDate = z.iso.date();
const text = (max: number) => z.string().trim().max(max);

/* ---------- společné hodnoty ---------- */

export const serviceType = z.enum(SERVICE_TYPES);
export const dealSource = z.enum(DEAL_SOURCES);
export const dealResult = z.enum(DEAL_RESULTS);

const paymentKind = z.enum(["one_off", "intro", "retainer", "extra", "recurring"]);
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Měsíc ve tvaru RRRR-MM.");
const splitRuleInput = z.object({
  userId: id,
  mode: z.enum(["percent", "fixed_per_payment", "fixed_total"]),
  percent: z.number().min(0).max(100).optional(),
  fixedMinor: z.number().int().min(0).optional(),
  appliesTo: z.union([z.literal("all"), paymentKind]),
  validFrom: yearMonth.nullish(),
  validTo: yearMonth.nullish(),
}) satisfies z.ZodType<SplitRuleInput>;
const retainerSetup = z.object({
  amountMinor: z.number().int().positive(),
  fromMonth: yearMonth,
  issueDay: z.number().int().min(1).max(28),
  issuerMode: z.enum(["fixed", "alternate"]),
  issuerId: id,
  firstIssuerId: id.optional(),
  split: z.array(splitRuleInput),
}) satisfies z.ZodType<RetainerSetup>;

/**
 * Jeden řádek dialogu „Založit zakázky“ po výhře (stejný tvar jako `JobFromDealRow` ze `@rebar/zakazky/api`; kopie,
 * aby kontrakt zůstal bez závislosti na serverovém kódu cizího modulu).
 */
export const jobFromDealRow = z.object({
  type: serviceType,
  templateId: id.nullable(),
  title: z.string().trim().min(1, "Vyplňte název zakázky.").max(160),
  startDate: isoDate,
  ownerId: id,
  memberIds: z.array(id).max(20),
  leadId: id.nullish(),
  billingModel: z.enum(["one_off", "intro_then_retainer", "retainer", "hourly"]).optional(),
  split: z.array(splitRuleInput).optional(),
  retainer: retainerSetup.optional(),
});
export type JobFromDealRowInput = z.input<typeof jobFromDealRow>;

/* ---------- pole obchodu (vstupy zápisu) ---------- */

const title = z.string().trim().min(1, "Vyplňte název obchodu.").max(200);
const value = z.number().int().min(0, "Hodnota nesmí být záporná.").max(100_000_000_000_00);
const expectedUpdatedAt = z.string().optional();

const dealFields = {
  title,
  /** Organizace (firma); `null` = obchod bez firmy. */
  companyId: id.nullish(),
  /** Hlavní kontakt. */
  personId: id.nullish(),
  /** Vlastník obchodu; bez hodnoty při založení aktér. */
  ownerId: id.nullish(),
  valueMinor: value.nullish(),
  services: z.array(serviceType).max(3),
  expectedCloseDate: isoDate.nullish(),
  source: dealSource,
  sourceDetail: text(200).nullish(),
  tags: z.array(text(60)).max(30),
};

/**
 * Založení obchodu. Bez `stageId` začíná v první fázi výchozí pipeline; hlavní kontakt je `personId`, další jsou
 * `participantIds`. `isPrivate` smí zadat jen ten, kdo vidí soukromé záznamy (vynucuje jádro).
 */
export const createInput = z.object({
  ...dealFields,
  services: dealFields.services.default([]),
  source: dealSource.default("manual"),
  tags: dealFields.tags.default([]),
  stageId: id.optional(),
  participantIds: z.array(id).max(20).default([]),
  isPrivate: z.boolean().optional(),
});
export type CreateDealInput = z.input<typeof createInput>;

/** Úprava polí obchodu (ne fáze a ne výsledek: tam `moveStage`, `win`, `lose`, `reopen`). Aspoň jedno pole. */
export const updateInput = z.object({
  dealId: id,
  patch: z
    .object(dealFields)
    .partial()
    .refine((p) => Object.keys(p).length > 0, "Není co uložit."),
  /** Čas poslední úpravy, ze kterého uživatel vycházel (kolize úprav). */
  expectedUpdatedAt,
});
export type UpdateDealInput = z.input<typeof updateInput>;

/** Přesun do jiné fáze (tažení na boardu, klik na pás fází, „Přesunout do fáze“). Jen otevřený obchod. */
export const moveStageInput = z.object({ dealId: id, stageId: id, expectedUpdatedAt });

/**
 * Výhra (OBCH-13): obchod se označí jako vyhraný k datu `wonOn` (výchozí dnes), firma se přes službu `clients` stane
 * aktivním klientem se službami obchodu a z řádků `jobs` vzniknou zakázky (`createJobsFromWonDeal`). Prázdné `jobs`
 * = „Přeskočit“ (zakázky nevzniknou). Řádky předvyplní `zakazky.prefillFromDeal`.
 */
export const winInput = z.object({
  dealId: id,
  wonOn: isoDate.optional(),
  jobs: z.array(jobFromDealRow).max(10).default([]),
  expectedUpdatedAt,
});
export type WinDealInput = z.input<typeof winInput>;

/** Prohra (OBCH-12): důvod z číselníku `deal.lost_reason` je povinný, poznámka volitelná. */
export const loseInput = z.object({
  dealId: id,
  reason: z.string().trim().min(1, "Vyberte důvod prohry.").max(60),
  note: text(2000).nullish(),
  expectedUpdatedAt,
});
export type LoseDealInput = z.input<typeof loseInput>;

/** Znovuotevření vyhraného nebo prohraného obchodu (zpět do fáze, ve které byl). */
export const reopenInput = z.object({ dealId: id });
/** Archivace = přesun do Koše (obnovit jde 30 dní; jádro koše). */
export const archiveInput = z.object({ dealId: id });
/** Označení obchodu jako otevřeného (nový Meta lead přestane být zvýrazněný, R-42). Idempotentní. */
export const markOpenedInput = z.object({ dealId: id });

/**
 * Rychlé založení (firma + osoba + obchod v jedné transakci): firma i kontakt buď existující (`id`), nebo se založí
 * podle zadaných údajů přes API kontaktů (shoda e-mailu a telefonu najde existující osobu, IČO nebo název firmu).
 * Firmě se nenastavuje `client_status` (klientem se stane až výhrou).
 */
export const quickAddInput = z.object({
  title: title.optional(),
  company: z
    .union([
      z.object({ id }),
      z.object({ name: z.string().trim().min(1).max(200), ico: text(20).optional() }),
    ])
    .optional(),
  person: z
    .union([
      z.object({ id }),
      z.object({
        name: z.string().trim().min(1).max(200),
        email: text(200).optional(),
        phone: text(40).optional(),
      }),
    ])
    .optional(),
  valueMinor: value.nullish(),
  services: z.array(serviceType).max(3).default([]),
  expectedCloseDate: isoDate.nullish(),
  ownerId: id.nullish(),
  source: dealSource.default("manual"),
  sourceDetail: text(200).nullish(),
  stageId: id.optional(),
});
export type QuickAddInput = z.input<typeof quickAddInput>;

/* ---------- účastníci ---------- */

export const participantAddInput = z.object({ dealId: id, personId: id });
export const participantRemoveInput = z.object({ dealId: id, personId: id });

/* ---------- čtení ---------- */

export const detailInput = z.object({ dealId: id });
export const historyInput = z.object({ dealId: id });
/** Předvyplnění dialogu výhry (údaje obchodu pro `JobsFromDealDialog`). */
export const winPreviewInput = z.object({ dealId: id });
export const lostReasonsInput = z.object({ includeInactive: z.boolean().default(false) });
/**
 * Board: sloupce = fáze pipeline, v nich otevřené obchody se součty. `owner`: `me`, id uživatele, nebo vynecháno =
 * všichni. Vyhrané a prohrané obchody na boardu nejsou (jsou v seznamu, filtr „Výsledek“).
 */
export const boardInput = z.object({
  owner: z.union([z.literal("me"), id]).optional(),
  /** Hledaný text (název, firma). */
  search: text(100).optional(),
});
export type BoardInput = z.input<typeof boardInput>;

/* ---------- správa pipeline (Nastavení → Stavy; oprávnění `obchody.pipelines`) ---------- */

const stageName = z.string().trim().min(1, "Vyplňte název fáze.").max(80);
const pct = z.number().int().min(0).max(100);
const rottingDays = z.number().int().min(1).max(365);

export const pipelineGetInput = z.object({});
export const stageAddInput = z.object({
  name: stageName,
  color: z.string().trim().min(1).max(30).optional(),
  probabilityPct: pct.nullish(),
  rottingDays: rottingDays.nullish(),
});
export const stageUpdateInput = z.object({
  stageId: id,
  name: stageName.optional(),
  color: z.string().trim().min(1).max(30).optional(),
  probabilityPct: pct.nullish(),
  rottingDays: rottingDays.nullish(),
});
export const stageDeleteInput = z.object({ stageId: id });
/** Nové pořadí fází: všechny fáze pipeline právě jednou. */
export const stageReorderInput = z.object({ stageIds: z.array(id).min(1).max(50) });
export const lostReasonAddInput = z.object({
  value: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/, "Klíč smí mít jen malá písmena, číslice a podtržítko.")
    .max(60)
    .optional(),
  label: z.string().trim().min(1, "Vyplňte název důvodu.").max(80),
  color: z.string().trim().max(30).nullish(),
});
export const lostReasonUpdateInput = z.object({
  itemId: id,
  label: z.string().trim().min(1).max(80).optional(),
  color: z.string().trim().max(30).nullish(),
  active: z.boolean().optional(),
});
export const lostReasonReorderInput = z.object({ itemIds: z.array(id).min(1).max(100) });

/* ---------- výstupy (tvary pro UI a ostatní moduly) ---------- */

export type { ActivityState, DealHighlight, DealResult, DealSource, ServiceType };

/** Fáze pipeline s údaji pro board a pás fází. */
export type StageView = {
  id: string;
  name: string;
  color: string;
  position: number;
  probabilityPct: number | null;
  /** Po kolika dnech bez aktivity obchod ve fázi „hnije“; `null` = nehlídá se. */
  rottingDays: number | null;
};

/** Karta obchodu na boardu (OBCH-06) včetně zvýraznění (OBCH-07, OBCH-15). */
export type DealCard = {
  id: string;
  title: string;
  companyId: string | null;
  /** „Soukromý záznam“, když firmu aktér nesmí vidět. */
  companyName: string | null;
  personId: string | null;
  personName: string | null;
  stageId: string;
  valueMinor: number | null;
  weightedMinor: number | null;
  services: ServiceType[];
  ownerId: string | null;
  ownerName: string | null;
  expectedCloseDate: string | null;
  nextActivityAt: string | null;
  source: DealSource;
  isPrivate: boolean;
  highlight: DealHighlight;
  updatedAt: string;
};

/** Sloupec boardu: fáze, souhrn (počet, součet, vážený součet) a karty. */
export type BoardColumn = {
  stage: StageView;
  count: number;
  totalMinor: number;
  weightedMinor: number;
  cards: DealCard[];
};

/** Výsledek `obchody.board`. */
export type BoardResult = {
  pipeline: { id: string; key: string; name: string };
  columns: BoardColumn[];
  totals: { count: number; totalMinor: number; weightedMinor: number };
  /** Otevřené obchody bez další aktivity (součet přes sloupce). */
  noNextActivity: number;
};

/** Jeden pobyt obchodu ve fázi (historie fází, OBCH-09). */
export type StageHistoryRow = {
  id: string;
  fromStageId: string | null;
  toStageId: string;
  stageName: string;
  stageColor: string;
  /** Fáze je dnes smazaná (historie zůstává). */
  stageDeleted: boolean;
  enteredAt: string;
  /** Prázdné u aktuálního pobytu. */
  leftAt: string | null;
  /** Sekundy ve fázi (u aktuální průběžně do teď). */
  durationSec: number;
  /** Celé kalendářní dny ve fázi (pražské). */
  days: number;
  byUserId: string | null;
  byUserName: string | null;
};

/** Další kontakt na obchodu. */
export type ParticipantView = {
  id: string;
  personId: string;
  personName: string | null;
};

/** Detail obchodu (`obchody.detail`): záznam, fáze, historie, účastníci a zvýraznění. */
export type DealDetail = {
  deal: {
    id: string;
    title: string;
    companyId: string | null;
    companyName: string | null;
    personId: string | null;
    personName: string | null;
    stageId: string;
    stageEnteredAt: string;
    result: DealResult;
    valueMinor: number | null;
    weightedMinor: number | null;
    probabilityPct: number;
    services: ServiceType[];
    expectedCloseDate: string | null;
    ownerId: string | null;
    ownerName: string | null;
    source: DealSource;
    sourceDetail: string | null;
    metaCampaignId: string | null;
    metaAdsetId: string | null;
    metaAdId: string | null;
    wonAt: string | null;
    lostAt: string | null;
    lostReason: string | null;
    lostReasonLabel: string | null;
    lostNote: string | null;
    firstOpenedAt: string | null;
    nextActivityAt: string | null;
    lastActivityAt: string | null;
    nextTaskId: string | null;
    isPrivate: boolean;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  };
  /** Fáze pipeline, ve které obchod je (pás fází), s dny stráveným v každé. */
  stages: (StageView & { daysIn: number })[];
  highlight: DealHighlight;
  history: StageHistoryRow[];
  participants: ParticipantView[];
};

/** Údaje obchodu pro dialog „Založit zakázky“ (`obchody.winPreview`). */
export type WinPreview = {
  dealId: string;
  title: string;
  companyId: string | null;
  companyName: string | null;
  services: ServiceType[];
  valueMinor: number | null;
  ownerId: string | null;
  /** Obchod už je vyhraný nebo prohraný (výhra nejde). */
  result: DealResult;
  /** Stav firmy před výhrou (`null` = není klient). */
  clientStatus: string | null;
};

/** Výsledek `obchody.win`. */
export type WinResult = {
  dealId: string;
  wonAt: string;
  jobs: { id: string; number: string; type: ServiceType }[];
  /** `false`, když modul Klienti není zapnutý (stav klienta se nenastavil). */
  clientUpdated: boolean;
};

/** Výsledek `obchody.lose`, `reopen`, `moveStage`, `markOpened`, `archive`: id a čas poslední úpravy. */
export type DealChangeResult = { dealId: string; updatedAt: string };

/** Výsledek založení obchodu (`create`, `quickAdd`). */
export type CreatedDeal = {
  dealId: string;
  /** Jen u `quickAdd`: co se založilo a co se našlo. */
  companyId: string | null;
  personId: string | null;
  created: { company: boolean; person: boolean };
};

/** Důvod prohry z číselníku. */
export type LostReasonView = {
  id: string;
  value: string;
  label: string;
  color: string | null;
  active: boolean;
  position: number;
};

/** Správa pipeline: fáze s počtem otevřených obchodů a důvody prohry včetně neaktivních. */
export type PipelineAdminView = {
  pipeline: { id: string; key: string; name: string };
  stages: (StageView & { usage: number })[];
  lostReasons: LostReasonView[];
};
