import { and, eq, isNull } from "drizzle-orm";
import type { BillingModel, ServiceType } from "@rebar/core/contracts";
import { recordAudit } from "@rebar/core/audit";
import { indexRecord } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { nextNumber } from "@rebar/core/numbering";
import { inTx, UserError, type Ctx } from "@rebar/core/rbac";
import { company } from "@rebar/kontakty/schema";
import { canSeePrivate, isPrivateRecord, privateScope, syncPrivateRecord } from "../access";
import {
  createInput,
  jobsFromDealInput,
  templatePayload,
  type CreatedJob,
  type CreateJobInput,
  type TemplatePayloadData,
} from "../contract";
import { job, jobMember, jobPhase } from "../schema";
import { jobEntity } from "../entities";
import { JOB_SERIES } from "../series";
import { JOB_TYPE_LABELS, todayPrague } from "../shared";
import { emitCreated } from "./events";
import {
  assertActiveUsers,
  assertMaySeePrivate,
  defaultTemplate,
  loadTemplate,
  otherPartnerId,
  type TemplateRow,
} from "./lookups";
import {
  defaultJobTitle,
  initialMarketingStage,
  initialStatus,
  planFromTemplate,
  type JobPlan,
} from "./plan";
import type { InitJobFinanceInput } from "./services";

/** Zakázka založená v transakci: řádek i plán, ze kterého vznikla (pro testy a navazující kroky). */
export type CreatedJobDetail = CreatedJob & { plan: JobPlan; templateId: string | null };

/** Zvláštnosti založení: zakázka z obchodu (vynucené soukromí, cena z obchodu). */
export type CreateExtras = { forcePrivate?: boolean };

const EMPTY: TemplatePayloadData = templatePayload.parse({ v: 1 });

/** Vybere šablonu: konkrétní, výchozí typu, nebo žádnou (`withoutTemplate`). Neplatnou nebo cizího typu odmítne. */
async function resolveTemplate(
  c: Ctx,
  input: {
    templateId?: string | null | undefined;
    withoutTemplate?: boolean | undefined;
    type: ServiceType;
  },
): Promise<TemplateRow | null> {
  if (input.withoutTemplate) return null;
  if (!input.templateId) return defaultTemplate(c.db, input.type);
  const tpl = await loadTemplate(c.db, input.templateId);
  if (!tpl) throw new UserError("Šablona zakázky nenalezena.");
  if (tpl.archivedAt) throw new UserError("Šablona je archivovaná, vyberte jinou.");
  if (tpl.type !== input.type)
    throw new UserError(
      `Šablona „${tpl.name}“ je pro jiný typ zakázky, než je vybraný (${JOB_TYPE_LABELS[input.type]}).`,
    );
  return tpl;
}

/**
 * Založí zakázku v transakci `c` (volající ji otevřel): zakázka s číslem z řady, fáze, členové, úkoly (služba `tasks`),
 * plánované platby a rozdělení (služba `finance`), služba klienta (služba `clients`) a událost `project.created`.
 * Chybějící služba ostatních modulů se přeskočí. Nic nekontroluje o oprávnění k vytvoření (to dělá příkaz).
 */
export async function createJobTx(
  c: Ctx,
  deps: ModuleDeps,
  raw: CreateJobInput,
  extras: CreateExtras = {},
): Promise<CreatedJobDetail> {
  const input = createInput.parse(raw);
  const today = todayPrague();
  const startDate = input.startDate ?? today;

  const [co] = await c.db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(
      and(eq(company.id, input.companyId), isNull(company.deletedAt), privateScope(c, company)),
    );
  if (!co) throw new UserError("Klient nenalezen.");

  const memberIds = [...new Set(input.memberIds)].filter((id) => id !== input.ownerId);
  const leadId = input.leadId ?? null;
  const people = [input.ownerId, ...memberIds, ...(leadId ? [leadId] : [])];
  await assertActiveUsers(c.db, people);

  const wantPrivate = input.isPrivate === true || extras.forcePrivate === true;
  if (input.isPrivate === true && !canSeePrivate(c))
    throw new UserError("Soukromou zakázku smí vytvořit jen vlastník. Založte ji jako sdílenou.");
  const isPrivate = wantPrivate && canSeePrivate(c);
  if (isPrivate) await assertMaySeePrivate(c.db, people);

  const tpl = await resolveTemplate(c, input);
  const payload: TemplatePayloadData = tpl ? templatePayload.parse(tpl.payload) : EMPTY;
  const billingModel: BillingModel = input.retainer
    ? "retainer"
    : (input.billingModel ?? tpl?.defaultBillingModel ?? "one_off");
  const status = initialStatus(startDate, today);

  const plan = planFromTemplate(payload, {
    startDate,
    ownerId: input.ownerId,
    leadId,
    otherPartnerId: await otherPartnerId(c.db, input.ownerId),
    billingModel,
    active: status === "active",
  });

  const number = await nextNumber(c.db, JOB_SERIES, new Date(), {
    isTaken: async (n) =>
      (await c.db.select({ id: job.id }).from(job).where(eq(job.number, n)).limit(1)).length > 0,
  });
  const [row] = await c.db
    .insert(job)
    .values({
      number,
      title: input.title,
      companyId: input.companyId,
      type: input.type,
      status,
      billingModel,
      marketingStage: initialMarketingStage(input.type, billingModel),
      ownerId: input.ownerId,
      startDate,
      dueDate: input.dueDate ?? plan.dueDate,
      priceMinor: input.priceMinor ?? null,
      description: input.description ?? null,
      dealId: input.dealId ?? null,
      templateId: tpl?.id ?? null,
      isPrivate,
      visibilitySource: "own",
      createdBy: c.actor.userId,
      updatedBy: c.actor.userId,
    })
    .returning();
  const created = row!;
  if (isPrivate) await syncPrivateRecord(c.db, "job", created.id, true);

  const phaseRows = plan.phases.length
    ? await c.db
        .insert(jobPhase)
        .values(
          plan.phases.map((p) => ({
            jobId: created.id,
            name: p.name,
            position: p.index,
            role: p.role,
            status: p.status,
            plannedStart: p.plannedStart,
            plannedEnd: p.plannedEnd,
            isPrivate,
            visibilitySource: "inherited" as const,
            createdBy: c.actor.userId,
            updatedBy: c.actor.userId,
          })),
        )
        .returning()
    : [];
  const phaseIdByIndex = new Map(phaseRows.map((p) => [p.position, p.id]));
  const currentId =
    plan.currentPhaseIndex === null ? null : (phaseIdByIndex.get(plan.currentPhaseIndex) ?? null);
  if (currentId) {
    await c.db.update(job).set({ currentPhaseId: currentId }).where(eq(job.id, created.id));
    created.currentPhaseId = currentId;
  }

  const team = [
    ...(leadId ? [{ userId: leadId, role: "lead" as const }] : []),
    ...memberIds
      .filter((id) => id !== leadId)
      .map((userId) => ({ userId, role: "member" as const })),
  ];
  if (team.length)
    await c.db
      .insert(jobMember)
      .values(team.map((m) => ({ jobId: created.id, ...m, createdBy: c.actor.userId })));

  // služby ostatních modulů (volitelné): služba klienta, úkoly ze šablony, platby a rozdělení
  await deps.services.optional("clients")?.addServices(c, input.companyId, [input.type]);
  const tasks = deps.services.optional("tasks");
  if (tasks && plan.tasks.length)
    await tasks.createFromTemplate(c, {
      jobId: created.id,
      ownerId: input.ownerId,
      ...(leadId ? { leadId } : {}),
      startDate,
      phaseIds: phaseRows.map((p) => p.id),
      items: plan.tasks.map((t) => ({
        phaseId: phaseIdByIndex.get(t.phaseIndex) ?? null,
        title: t.title,
        typeKey: t.typeKey,
        priority: t.priority,
        assigneeId: t.assigneeId,
        dueDate: t.dueDate,
        estimateMin: t.estimateMin,
        description: t.description,
      })),
    });
  const finance = deps.services.optional("finance");
  if (finance) {
    const financeInput: InitJobFinanceInput = {
      jobId: created.id,
      startDate,
      ownerId: input.ownerId,
      billingModel,
      templatePayments: plan.payments.map((p) => ({
        description: p.description,
        kind: p.kind,
        amountMinor: p.amountMinor,
        issuerId: p.issuerId,
        dueOn: p.dueOn,
      })),
      ...(input.split ? { split: input.split } : {}),
      ...(input.retainer ? { retainer: input.retainer } : {}),
    };
    await finance.initJobFinance(c, financeInput);
  }

  await recordAudit(c, {
    action: "create",
    entityType: "job",
    entityId: created.id,
    summary: `${created.number} ${created.title}`,
    entityTitle: `${created.number} ${created.title}`,
    isPrivate,
    changes: [
      { field: "Typ", old: null, new: JOB_TYPE_LABELS[input.type] },
      { field: "Šablona", old: null, new: tpl?.name ?? null },
    ],
  });
  await indexRecord(c.db, { def: jobEntity }, created as unknown as Record<string, unknown>);
  await emitCreated(c, created);
  return {
    id: created.id,
    number: created.number,
    type: created.type,
    plan,
    templateId: tpl?.id ?? null,
  };
}

/** Ruční založení zakázky (API `createJob`, příkazy `zakazky.create` a `zakazky.createFromTemplate`). */
export async function createJobImpl(
  ctx: Ctx,
  deps: ModuleDeps,
  input: CreateJobInput,
): Promise<{ id: string; number: string; type: ServiceType }> {
  return inTx(ctx, async (c) => {
    const { id, number, type } = await createJobTx(c, deps, input);
    return { id, number, type };
  });
}

/**
 * Zakázky z vyhraného obchodu: řádek za řádkem jako `createJobTx` v jedné transakci. U jediného řádku se cena
 * předvyplní hodnotou obchodu (R-39); soukromý obchod dává soukromé zakázky. Řádek s prázdným názvem dostane
 * „{klient} – {typ}“.
 */
export async function createJobsFromWonDealImpl(
  ctx: Ctx,
  deps: ModuleDeps,
  raw: {
    dealId: string;
    companyId: string;
    rows: unknown[];
    dealValueMinor?: number | null | undefined;
  },
): Promise<{ jobs: CreatedJob[] }> {
  const input = jobsFromDealInput.parse(raw);
  if (!input.rows.length) return { jobs: [] };
  return inTx(ctx, async (c) => {
    const forcePrivate = await isPrivateRecord(c.db, "deal", input.dealId);
    const [co] = await c.db
      .select({ name: company.name })
      .from(company)
      .where(eq(company.id, input.companyId));
    const jobs: CreatedJob[] = [];
    for (const row of input.rows) {
      const created = await createJobTx(
        c,
        deps,
        {
          title:
            row.title.trim() || defaultJobTitle(co?.name ?? "Klient", JOB_TYPE_LABELS[row.type]),
          type: row.type,
          companyId: input.companyId,
          ownerId: row.ownerId,
          memberIds: row.memberIds,
          leadId: row.leadId ?? null,
          startDate: row.startDate,
          templateId: row.templateId,
          billingModel: row.billingModel,
          split: row.split,
          retainer: row.retainer,
          dealId: input.dealId,
          priceMinor: input.rows.length === 1 ? (input.dealValueMinor ?? null) : null,
        },
        { forcePrivate },
      );
      jobs.push({ id: created.id, number: created.number, type: created.type });
    }
    return { jobs };
  });
}
