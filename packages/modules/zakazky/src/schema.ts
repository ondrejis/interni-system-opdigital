import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
  boolean,
} from "drizzle-orm/pg-core";
import { audit, minor, pk, schema, ts } from "@rebar/core/db";
import { company, person } from "@rebar/kontakty/schema";

const { user, pipelineStage } = schema;

/** Zakázka. Číslo se přiděluje z číselné řady `zakazky.cislo` ve stejné transakci jako založení. */
export const job = pgTable(
  "job",
  {
    id: pk(),
    number: text("number").notNull(),
    title: text("title").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    personId: uuid("person_id").references(() => person.id),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    valueMinor: minor("value_minor").notNull().default(0),
    currency: text("currency").notNull().default("CZK"),
    address: text("address"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    managerId: uuid("manager_id").references(() => user.id),
    description: text("description"),
    /**
     * Fáze životního cyklu (pevná v kódu, ADR 015): `inquiry`, `offer`, `preparation`, `execution`, `handover`,
     * `warranty`, `closed`; vedlejší `lost`, `paused`. Odvozuje se ze stavu pipeline (`pipeline_stage.phase`)
     * a mění ji jen přechod fáze (`beforeUpdate` entity), proto je tady zapsaná i pro filtry a řazení.
     */
    phase: text("phase").notNull().default("preparation"),
    phaseChangedAt: ts("phase_changed_at"),
    /** Fáze, ze které byla zakázka pozastavena (návrat po obnovení). */
    pausedFrom: text("paused_from"),
    lostReason: text("lost_reason"),
    wonAt: date("won_at", { mode: "string" }),
    handoverAt: date("handover_at", { mode: "string" }),
    closedAt: date("closed_at", { mode: "string" }),
    /** Režim DPH zakázky: `standard`, nebo `reverse_charge` (přenesená daňová povinnost). */
    vatMode: text("vat_mode").notNull().default("standard"),
    /** Zádržné v setinách procenta (5 % = 500); odečítá se z dílčích faktur. */
    retentionBp: integer("retention_bp").notNull().default(0),
    warrantyMonths: integer("warranty_months"),
    warrantyUntil: date("warranty_until", { mode: "string" }),
    siteLat: numeric("site_lat", { precision: 9, scale: 6 }),
    siteLng: numeric("site_lng", { precision: 9, scale: 6 }),
    color: text("color"),
    /** Poptávka, ze které zakázka vznikla (měkký odkaz, modul Poptávky je volitelný). */
    sourceInquiryId: uuid("source_inquiry_id"),
    templateId: uuid("template_id"),
    /**
     * Přepočtený souhrn pro seznamy, řazení a filtry (smluvní cena je `value_minor` + schválené změny).
     * Plní ho `recomputeJobSummary` (oblast costs) po každé změně rozpočtu, nákladů, změn a faktur.
     */
    sumContractMinor: minor("sum_contract_minor").notNull().default(0),
    sumPlannedCostMinor: minor("sum_planned_cost_minor").notNull().default(0),
    sumCostMinor: minor("sum_cost_minor").notNull().default(0),
    sumInvoicedMinor: minor("sum_invoiced_minor").notNull().default(0),
    sumPaidMinor: minor("sum_paid_minor").notNull().default(0),
    /** Marže a čerpání rozpočtu v procentech na jedno desetinné místo. */
    sumMarginPct: numeric("sum_margin_pct", { precision: 7, scale: 1 }),
    sumDrawdownPct: numeric("sum_drawdown_pct", { precision: 7, scale: 1 }),
    /** Semafor zakázky: `ok`, `warning`, `danger` (termín a rozpočet). */
    sumHealth: text("sum_health"),
    /** Počet nákladů, které ještě nejsou spárované na oddíl rozpočtu (úkol k doplnění, upozornění na přehledu). */
    sumUnpairedCount: integer("sum_unpaired_count").notNull().default(0),
    sumAt: ts("sum_at"),
    /* ---------- CRM (obchodní část zakázky ve fázích poptávka a nabídka, docs/CRM.md) ---------- */
    /** Očekávané datum uzavření obchodu (prognóza). */
    expectedCloseDate: date("expected_close_date", { mode: "string" }),
    /** Ruční přepsání pravděpodobnosti stavu v procentech (0–100); `null` = platí pravděpodobnost stavu. Změna stavu přepsání zruší. */
    crmProbabilityPct: smallint("crm_probability_pct"),
    /** Zdroj obchodu (číselník `job.source`), kanál (web, Meta, doporučení…) a kampaň. */
    crmSource: text("crm_source"),
    crmSourceChannel: text("crm_source_channel"),
    crmCampaign: text("crm_campaign"),
    /** Město stavby (filtry a prognóza podle místa). */
    siteCity: text("site_city"),
    /** Od kdy je zakázka v aktuálním stavu (z historie stavů). Počítané, ukládá se. */
    crmStageEnteredAt: ts("crm_stage_entered_at"),
    /** Počítané z aktivit (`recomputeJobCrm`): nejbližší otevřená aktivita, poslední dokončená, počty a hnití. */
    crmNextActivityAt: ts("crm_next_activity_at"),
    crmLastActivityAt: ts("crm_last_activity_at"),
    crmOpenActivities: integer("crm_open_activities").notNull().default(0),
    crmOverdueActivities: integer("crm_overdue_activities").notNull().default(0),
    crmRotting: boolean("crm_rotting").notNull().default(false),
    /** Vážená hodnota (cena × pravděpodobnost) v haléřích; ukládá se kvůli součtům v prognóze a na nástěnce. */
    crmWeightedMinor: minor("crm_weighted_minor").notNull().default(0),
    /** Archivované zakázky zmizí z nástěnky a seznamu; vrací je jen pohled Archiv. */
    crmArchivedAt: ts("crm_archived_at"),
    /** Poznámka k prohře (k důvodu z číselníku). */
    crmLostNote: text("crm_lost_note"),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    uniqueIndex("job_number_uq").on(t.number),
    index("job_phase_idx").on(t.phase),
    index("job_company_idx").on(t.companyId),
    index("job_stage_idx").on(t.stageId),
    index("job_manager_idx").on(t.managerId),
    index("job_crm_close_idx").on(t.expectedCloseDate),
    index("job_crm_next_activity_idx").on(t.crmNextActivityAt),
    index("job_title_trgm_idx").using("gin", sql`lower(f_unaccent(${t.title})) gin_trgm_ops`),
    index("job_number_trgm_idx").using("gin", sql`lower(f_unaccent(${t.number})) gin_trgm_ops`),
    index("job_address_trgm_idx").using("gin", sql`lower(f_unaccent(${t.address})) gin_trgm_ops`),
    index("job_custom_idx").using("gin", t.custom),
  ],
);

/** Tým zakázky. Člen týmu zakázku vidí i při oprávnění „jen moje“. */
export const jobMember = pgTable(
  "job_member",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role"),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.userId] }), index("job_member_user_idx").on(t.userId)],
);

/**
 * Historie stavů zakázky: jeden řádek na pobyt ve stavu (`left_at` je prázdné u aktuálního). Zapisuje ji změna stavu
 * (`lifecycle/history.ts`); z ní se počítají dny ve stavu (pás fází), konverze a rychlost obchodu.
 */
export const jobStageHistory = pgTable(
  "job_stage_history",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    /** Fáze stavu v době vstupu (stav se může později přesunout do jiné fáze). */
    phase: text("phase"),
    enteredAt: ts("entered_at").notNull().defaultNow(),
    leftAt: ts("left_at"),
    changedBy: uuid("changed_by").references(() => user.id),
  },
  (t) => [
    index("job_stage_history_job_idx").on(t.jobId, t.enteredAt),
    index("job_stage_history_stage_idx").on(t.stageId),
  ],
);

/** Další lidé na zakázce kromě hlavní kontaktní osoby (investor, TDI, projektant…), s rolí na zakázce. */
export const jobParticipant = pgTable(
  "job_participant",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id),
    /** Role na zakázce (`investor`, `tdi`, `projektant`…, volný text). */
    role: text("role"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("job_participant_uq")
      .on(t.jobId, t.personId)
      .where(sql`${t.deletedAt} is null`),
    index("job_participant_person_idx").on(t.personId),
  ],
);

/** Ruční náklad zakázky (nákup bez skladu, subdodávka, kontejner…). Automatické náklady dodávají jiné moduly. */
export const jobCost = pgTable(
  "job_cost",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    date: date("date", { mode: "string" }).notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    /** Dodavatel z kontaktů, nebo jen text. */
    supplierId: uuid("supplier_id").references(() => company.id),
    supplierName: text("supplier_name"),
    amountMinor: minor("amount_minor").notNull(),
    /** Oddíl a položka rozpočtu, na které se náklad páruje (prázdné = nespárováno). */
    sectionId: uuid("section_id"),
    itemId: uuid("item_id"),
    /** Objednávka zakázky, ke které náklad patří (měkký odkaz). */
    orderId: uuid("order_id"),
    /** Vznik z jiné oblasti (`diary`, `order`): zdroj a jeho id, aby šel náklad při změně zdroje smazat/přepsat. Ruční = null. */
    source: text("source"),
    sourceRef: text("source_ref"),
    ...audit(),
  },
  (t) => [
    index("job_cost_job_idx").on(t.jobId, t.date),
    index("job_cost_source_idx").on(t.source, t.sourceRef),
    index("job_cost_section_idx").on(t.sectionId),
  ],
);

/** Vícepráce (kladná částka) a méněpráce (záporná). Schválená položka je součástí ceny zakázky a nejde měnit. */
export const jobChange = pgTable(
  "job_change",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    /** Pořadové číslo v rámci zakázky (VP-1, MP-2…). */
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    amountMinor: minor("amount_minor").notNull(),
    /** `draft`, `sent` (ke schválení), `approved`, `rejected`. */
    status: text("status").notNull().default("draft"),
    decidedAt: date("decided_at", { mode: "string" }),
    decidedBy: text("decided_by"),
    /** Stavební objekt, ke kterému se změna vztahuje (prázdné = celá zakázka). */
    objectId: uuid("object_id"),
    reason: text("reason"),
    /** Dopad změny na nákladovou cenu (prodejní je `amountMinor`). */
    costImpactMinor: minor("cost_impact_minor").notNull().default(0),
    /** Schválená změna se propsala do rozpočtu (položky se změnily, původní hodnoty zůstaly). */
    appliedAt: ts("applied_at"),
    /** Schválený doklad je zamčený; úprava = vrátit do konceptu (zapíše se do auditu). */
    lockedAt: ts("locked_at"),
    ...audit(),
  },
  (t) => [uniqueIndex("job_change_number_uq").on(t.jobId, t.number)],
);

/**
 * Řádek změny (ZBV): nová položka, změna množství nebo odebrání existující. Schválením se propíše do rozpočtu
 * realizační verze (viz `budget_item`), původní hodnoty položky zůstanou.
 */
export const jobChangeLine = pgTable(
  "job_change_line",
  {
    id: pk(),
    changeId: uuid("change_id")
      .notNull()
      .references(() => jobChange.id),
    position: integer("position").notNull().default(0),
    /** `add` (nová položka), `qty` (změna množství), `remove` (odebrání). */
    kind: text("kind").notNull(),
    /** Existující položka rozpočtu (`qty`, `remove`). */
    itemId: uuid("item_id"),
    /** Oddíl, do kterého nová položka patří (`add`). */
    sectionId: uuid("section_id"),
    title: text("title").notNull(),
    unit: text("unit").notNull().default("ks"),
    itemKind: text("item_kind").notNull().default("other"),
    quantityBefore: numeric("quantity_before", { precision: 14, scale: 3 }).notNull().default("0"),
    quantityAfter: numeric("quantity_after", { precision: 14, scale: 3 }).notNull().default("0"),
    unitCostMinor: minor("unit_cost_minor").notNull().default(0),
    unitPriceMinor: minor("unit_price_minor").notNull().default(0),
    vatRateBp: integer("vat_rate_bp").notNull().default(2100),
    /** Dopad na prodejní a nákladovou cenu v haléřích (po schválení se nemění). */
    priceImpactMinor: minor("price_impact_minor").notNull().default(0),
    costImpactMinor: minor("cost_impact_minor").notNull().default(0),
  },
  (t) => [index("job_change_line_change_idx").on(t.changeId, t.position)],
);

/* ---------- Rozpočet: verze → stavební objekt → oddíl → položka ---------- */

/**
 * Verze rozpočtu zakázky. `offer` je nabídka zákazníkovi, `realization` pracovní rozpočet realizace.
 * Vyhraná nabídka se zamkne a zkopíruje do realizační verze (původní hodnoty položek se uloží).
 */
export const budgetVersion = pgTable(
  "budget_version",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    /** `offer` nebo `realization`. */
    kind: text("kind").notNull(),
    number: integer("number").notNull().default(1),
    title: text("title"),
    /** `draft`, `sent` (odeslaná zákazníkovi), `locked`. */
    status: text("status").notNull().default("draft"),
    lockedAt: ts("locked_at"),
    lockedBy: uuid("locked_by").references(() => user.id),
    /** Verze, ze které tato vznikla kopií (nabídka → realizace). */
    sourceVersionId: uuid("source_version_id"),
    note: text("note"),
    ...audit(),
  },
  (t) => [uniqueIndex("budget_version_uq").on(t.jobId, t.kind, t.number)],
);

/** Stavební objekt (SO 01 …). Každá verze má skrytý výchozí objekt „Celá zakázka“ (`isDefault`). */
export const budgetObject = pgTable(
  "budget_object",
  {
    id: pk(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => budgetVersion.id),
    code: text("code"),
    title: text("title").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    responsibleId: uuid("responsible_id").references(() => user.id),
    position: integer("position").notNull().default(0),
    ...audit(),
  },
  (t) => [index("budget_object_version_idx").on(t.versionId, t.position)],
);

/** Oddíl rozpočtu (Elektro, Zemní práce, ZTI …); může mít nadřazený oddíl, takže jde o strom. */
export const budgetSection = pgTable(
  "budget_section",
  {
    id: pk(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => budgetVersion.id),
    objectId: uuid("object_id")
      .notNull()
      .references(() => budgetObject.id),
    parentId: uuid("parent_id"),
    code: text("code"),
    title: text("title").notNull(),
    position: integer("position").notNull().default(0),
    /** Kategorie nákladů (`labour`, `material`…), na kterou se z tohoto oddílu páruje automatický náklad modulů. */
    costCategory: text("cost_category"),
    ...audit(),
  },
  (t) => [
    index("budget_section_version_idx").on(t.versionId, t.position),
    index("budget_section_object_idx").on(t.objectId),
  ],
);

/**
 * Položka rozpočtu. Má nákladovou i prodejní jednotkovou cenu (marže). `original*` se uloží při zamčení verze
 * a už se nemění, takže je vidět „původní → aktuální“ po schválených změnách.
 */
export const budgetItem = pgTable(
  "budget_item",
  {
    id: pk(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => budgetVersion.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => budgetSection.id),
    position: integer("position").notNull().default(0),
    code: text("code"),
    title: text("title").notNull(),
    /** Druh: `labour`, `material`, `subcontract`, `machines`, `other` (stejné klíče jako kategorie nákladů). */
    kind: text("kind").notNull().default("other"),
    unit: text("unit").notNull().default("ks"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    unitCostMinor: minor("unit_cost_minor").notNull().default(0),
    unitPriceMinor: minor("unit_price_minor").notNull().default(0),
    vatRateBp: integer("vat_rate_bp").notNull().default(2100),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    spec: text("spec"),
    note: text("note"),
    originalQuantity: numeric("original_quantity", { precision: 14, scale: 3 }),
    originalUnitCostMinor: minor("original_unit_cost_minor"),
    originalUnitPriceMinor: minor("original_unit_price_minor"),
    /** Položka vznikla schválenou změnou (ZBV), ne v původní nabídce. */
    changeId: uuid("change_id"),
    /** Položka z katalogu (měkký odkaz, katalog přijde později). */
    catalogItemId: uuid("catalog_item_id"),
    ...audit(),
  },
  (t) => [
    index("budget_item_section_idx").on(t.sectionId, t.position),
    index("budget_item_version_idx").on(t.versionId),
  ],
);

/** Řádek výkazu výměr u položky: proměnná, popis, vzorec a výsledek; množství položky = součet výsledků. */
export const budgetCalcLine = pgTable(
  "budget_calc_line",
  {
    id: pk(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => budgetItem.id),
    position: integer("position").notNull().default(0),
    variable: text("variable"),
    description: text("description"),
    formula: text("formula").notNull().default(""),
    result: numeric("result", { precision: 14, scale: 3 }).notNull().default("0"),
  },
  (t) => [index("budget_calc_line_item_idx").on(t.itemId, t.position)],
);

/* ---------- Náklady: párování automatických nákladů na rozpočet ---------- */

/**
 * Přiřazení automatického nákladu (docházka, sklad, stroje, přijatá faktura, deník) k oddílu a položce rozpočtu.
 * Samotný náklad zůstává ve svém modulu (poskytovatel nákladů ho vrací živě s `source` a `ref`); tady je jen
 * párování. Náklad bez řádku zde je „nespárovaný“ a ukáže se jako úkol k doplnění.
 */
export const costAllocation = pgTable(
  "cost_allocation",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    source: text("source").notNull(),
    sourceRef: text("source_ref").notNull(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => budgetSection.id),
    itemId: uuid("item_id"),
    /** Část nákladu v haléřích (rozpad na víc oddílů); prázdné = celý náklad. */
    amountMinor: minor("amount_minor"),
    ...audit(),
  },
  (t) => [
    index("cost_allocation_job_idx").on(t.jobId),
    index("cost_allocation_source_idx").on(t.source, t.sourceRef),
  ],
);

/* ---------- Soupisy provedených prací ---------- */

/** Soupis provedených prací za období (a stavební objekt): podklad pro dílčí fakturu zákazníkovi. */
export const workStatement = pgTable(
  "work_statement",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    objectId: uuid("object_id"),
    /** Pořadové číslo v rámci zakázky. */
    number: integer("number").notNull(),
    periodFrom: date("period_from", { mode: "string" }).notNull(),
    periodTo: date("period_to", { mode: "string" }).notNull(),
    /** `draft`, `submitted` (ke schválení), `approved`, `rejected`. */
    status: text("status").notNull().default("draft"),
    claimedMinor: minor("claimed_minor").notNull().default(0),
    approvedMinor: minor("approved_minor").notNull().default(0),
    decidedAt: ts("decided_at"),
    decidedBy: uuid("decided_by").references(() => user.id),
    /** Dílčí faktura vytvořená ze soupisu (modul Fakturace, měkký odkaz). */
    invoiceId: uuid("invoice_id"),
    note: text("note"),
    lockedAt: ts("locked_at"),
    ...audit(),
  },
  (t) => [uniqueIndex("work_statement_number_uq").on(t.jobId, t.number)],
);

export const workStatementLine = pgTable(
  "work_statement_line",
  {
    id: pk(),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => workStatement.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => budgetItem.id),
    position: integer("position").notNull().default(0),
    /** Provedené množství za období a kumulativně (včetně tohoto období). */
    quantityPeriod: numeric("quantity_period", { precision: 14, scale: 3 }).notNull().default("0"),
    quantityTotal: numeric("quantity_total", { precision: 14, scale: 3 }).notNull().default("0"),
    amountPeriodMinor: minor("amount_period_minor").notNull().default(0),
    amountTotalMinor: minor("amount_total_minor").notNull().default(0),
  },
  (t) => [index("work_statement_line_statement_idx").on(t.statementId, t.position)],
);

/* ---------- Objednávky zakázky ---------- */

/** Objednávka dodavateli na zakázku (materiál, subdodávka). Po schválení se zamkne. Skladové objednávky řeší modul Sklad. */
export const jobOrder = pgTable(
  "job_order",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    /** Číslo z řady `zakazky.objednavka`. */
    number: text("number").notNull(),
    title: text("title").notNull(),
    supplierId: uuid("supplier_id").references(() => company.id),
    supplierName: text("supplier_name"),
    orderDate: date("order_date", { mode: "string" }),
    deliveryDate: date("delivery_date", { mode: "string" }),
    sectionId: uuid("section_id"),
    /** `draft`, `pending` (ke schválení), `approved`, `received`, `cancelled`. */
    status: text("status").notNull().default("draft"),
    totalMinor: minor("total_minor").notNull().default(0),
    note: text("note"),
    lockedAt: ts("locked_at"),
    ...audit(),
  },
  (t) => [uniqueIndex("job_order_number_uq").on(t.number), index("job_order_job_idx").on(t.jobId)],
);

export const jobOrderLine = pgTable(
  "job_order_line",
  {
    id: pk(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => jobOrder.id),
    position: integer("position").notNull().default(0),
    itemId: uuid("item_id"),
    title: text("title").notNull(),
    unit: text("unit").notNull().default("ks"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    unitPriceMinor: minor("unit_price_minor").notNull().default(0),
    vatRateBp: integer("vat_rate_bp").notNull().default(2100),
  },
  (t) => [index("job_order_line_order_idx").on(t.orderId, t.position)],
);

/* ---------- Schvalování s limitem částky ---------- */

/**
 * Pravidlo schvalování: doklad daného typu (`change`, `statement`, `order`, `received_invoice`) od částky
 * `minAmountMinor` schvaluje držitel oprávnění `approverPermission` (nebo konkrétní uživatel). Pod nejnižším limitem
 * se doklad schválí automaticky podle nastavení typu. Vyhodnocuje se nejvyšší odpovídající pravidlo.
 */
export const approvalRule = pgTable(
  "approval_rule",
  {
    id: pk(),
    docType: text("doc_type").notNull(),
    minAmountMinor: minor("min_amount_minor").notNull().default(0),
    approverPermission: text("approver_permission"),
    approverId: uuid("approver_id").references(() => user.id),
    active: boolean("active").notNull().default(true),
    ...audit(),
  },
  (t) => [index("approval_rule_doc_type_idx").on(t.docType)],
);

/** Žádost o schválení konkrétního dokladu (měkký odkaz na doklad v modulu, který ho vlastní). */
export const approval = pgTable(
  "approval",
  {
    id: pk(),
    docType: text("doc_type").notNull(),
    docId: uuid("doc_id").notNull(),
    jobId: uuid("job_id").references(() => job.id),
    amountMinor: minor("amount_minor").notNull().default(0),
    /** `pending`, `approved`, `rejected`, `cancelled`. */
    status: text("status").notNull().default("pending"),
    requestedBy: uuid("requested_by").references(() => user.id),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    decidedBy: uuid("decided_by").references(() => user.id),
    decidedAt: ts("decided_at"),
    comment: text("comment"),
    ruleId: uuid("rule_id"),
  },
  (t) => [
    index("approval_doc_idx").on(t.docType, t.docId),
    index("approval_status_idx").on(t.status),
  ],
);

/* ---------- Šablony zakázek a sdílení s investorem ---------- */

/** Šablona zakázky: kostra rozpočtu, úkoly, složky a role týmu v JSON (tvar určuje `templates` v modulu). */
export const jobTemplate = pgTable("job_template", {
  id: pk(),
  name: text("name").notNull(),
  description: text("description"),
  payload: jsonb("payload")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  ...audit(),
});

/** Odkaz pro investora (jen ke čtení). V databázi je jen otisk tokenu; `scope` říká, co investor vidí. */
export const jobShare = pgTable(
  "job_share",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    scope: jsonb("scope")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("job_share_token_uq").on(t.tokenHash),
    index("job_share_job_idx").on(t.jobId),
  ],
);
