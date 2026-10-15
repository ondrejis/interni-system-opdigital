import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import { can, UserError, type Ctx } from "@rebar/core/rbac";
import type { ModuleDeps } from "@rebar/core/module-server";
import type { ServiceType } from "@rebar/core/contracts";
import { visibleJobs } from "../access";
import type { BoardCard, BoardColumn, BoardResult, JobDetail, PrefillRow } from "../contract";
import { job, jobMember, jobParticipant, jobPhase, jobTemplate } from "../schema";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  isOverdue,
  todayPrague,
} from "../shared";
import {
  companyNames,
  defaultTemplate,
  loadJob,
  loadPhases,
  personNames,
  userNames,
} from "./lookups";
import { defaultJobTitle } from "./plan";
import { tasksOf, unpaidPaymentCount } from "./services";

/** Zakázky ve skluzu pro aktéra: po termínu, nebo s úkoly po termínu (služba `tasks`). */
async function overdueTaskJobs(ctx: Ctx, deps: ModuleDeps): Promise<Set<string>> {
  const tasks = deps.services.optional("tasks");
  return new Set(tasks ? await tasks.overdueJobIds(ctx) : []);
}

/** Detail zakázky pro hlavičku, pás fází a přehled (`zakazky.detail`). */
export async function jobDetailImpl(ctx: Ctx, deps: ModuleDeps, jobId: string): Promise<JobDetail> {
  const j = await loadJob(ctx, jobId);
  const today = todayPrague();
  const phases = await loadPhases(ctx.db, j.id);
  const tasksSvc = tasksOf(deps);
  const [members, participants, names, owners, tpl, open, unpaid, overdueIds] = await Promise.all([
    ctx.db
      .select({ userId: jobMember.userId, role: jobMember.role, name: schema.user.name })
      .from(jobMember)
      .innerJoin(schema.user, eq(schema.user.id, jobMember.userId))
      .where(and(eq(jobMember.jobId, j.id), isNull(jobMember.deletedAt)))
      .orderBy(asc(jobMember.role), asc(schema.user.name)),
    ctx.db
      .select()
      .from(jobParticipant)
      .where(and(eq(jobParticipant.jobId, j.id), isNull(jobParticipant.deletedAt)))
      .orderBy(asc(jobParticipant.createdAt)),
    companyNames(ctx, [j.companyId]),
    userNames(ctx.db, [j.ownerId]),
    j.templateId
      ? ctx.db
          .select({ name: jobTemplate.name })
          .from(jobTemplate)
          .where(eq(jobTemplate.id, j.templateId))
          .then((r) => r[0]?.name ?? null)
      : Promise.resolve(null),
    tasksSvc ? tasksSvc.openCounts(ctx, { jobId: j.id }) : Promise.resolve(null),
    unpaidPaymentCount(ctx, deps, j.id),
    overdueTaskJobs(ctx, deps),
  ]);
  const people = await personNames(
    ctx,
    participants.map((p) => p.personId),
  );
  let perPhase: Record<string, number> | null = null;
  if (tasksSvc?.openCountsByPhase && phases.length)
    perPhase = await tasksSvc.openCountsByPhase(ctx, {
      jobId: j.id,
      phaseIds: phases.map((p) => p.id),
    });
  const overdue = isOverdue(j, today);
  return {
    job: {
      id: j.id,
      number: j.number,
      title: j.title,
      companyId: j.companyId,
      companyName: names.get(j.companyId) ?? null,
      type: j.type,
      status: j.status,
      billingModel: j.billingModel,
      marketingStage: j.marketingStage,
      ownerId: j.ownerId,
      ownerName: j.ownerId ? (owners.get(j.ownerId) ?? null) : null,
      startDate: j.startDate,
      dueDate: j.dueDate,
      completedAt: j.completedAt?.toISOString() ?? null,
      priceMinor: can(ctx, "finance.read") ? j.priceMinor : null,
      description: j.description,
      dealId: j.dealId,
      templateId: j.templateId,
      templateName: tpl,
      currentPhaseId: j.currentPhaseId,
      isPrivate: j.isPrivate,
      tags: j.tags,
    },
    phases: phases.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      role: p.role,
      status: p.status,
      plannedStart: p.plannedStart,
      plannedEnd: p.plannedEnd,
      completedAt: p.completedAt?.toISOString() ?? null,
      openTasks: perPhase ? (perPhase[p.id] ?? 0) : null,
    })),
    members: members.map((m) => ({ userId: m.userId, name: m.name, role: m.role })),
    participants: participants.map((p) => ({
      id: p.id,
      personId: p.personId,
      personName: people.get(p.personId) ?? null,
      role: p.role,
    })),
    counts: {
      openTasks: open?.open ?? null,
      overdueTasks: open?.overdue ?? null,
      unpaidPayments: unpaid,
    },
    overdue,
    slipping: overdue || overdueIds.has(j.id),
    decisionPending: j.type === "marketing" && j.marketingStage === "decision",
  };
}

/**
 * Board zakázek: podle stavu (sloupce Plánovaná … Zrušená), nebo podle fází jednoho typu (sloupce = fáze výchozí
 * šablony typu v pořadí, zakázky ve fázi s jiným názvem v posledním sloupci „Jiná fáze“).
 */
export async function boardImpl(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { by: "status" | "phase"; type?: ServiceType | undefined; includeClosed: boolean },
): Promise<BoardResult> {
  const closed = input.includeClosed;
  const rows = await ctx.db
    .select({
      j: job,
      phaseName: jobPhase.name,
    })
    .from(job)
    .leftJoin(jobPhase, and(eq(jobPhase.id, job.currentPhaseId), isNull(jobPhase.deletedAt)))
    .where(
      visibleJobs(
        ctx,
        input.type ? eq(job.type, input.type) : undefined,
        closed ? undefined : sql`${job.status} in ('planned', 'active', 'paused')`,
        input.by === "phase" ? sql`${job.status} in ('planned', 'active', 'paused')` : undefined,
      ),
    )
    .orderBy(asc(job.dueDate), desc(job.createdAt))
    .limit(500);
  const today = todayPrague();
  const [cos, owners, overdueIds] = await Promise.all([
    companyNames(
      ctx,
      rows.map((r) => r.j.companyId),
    ),
    userNames(
      ctx.db,
      rows.map((r) => r.j.ownerId),
    ),
    overdueTaskJobs(ctx, deps),
  ]);
  const price = can(ctx, "finance.read");
  const card = (r: (typeof rows)[number]): BoardCard => ({
    id: r.j.id,
    number: r.j.number,
    title: r.j.title,
    companyId: r.j.companyId,
    companyName: cos.get(r.j.companyId) ?? null,
    type: r.j.type,
    status: r.j.status,
    currentPhaseId: r.j.currentPhaseId,
    currentPhaseName: r.phaseName,
    ownerId: r.j.ownerId,
    ownerName: r.j.ownerId ? (owners.get(r.j.ownerId) ?? null) : null,
    dueDate: r.j.dueDate,
    overdue: isOverdue(r.j, today),
    slipping: isOverdue(r.j, today) || overdueIds.has(r.j.id),
    priceMinor: price ? r.j.priceMinor : null,
    isPrivate: r.j.isPrivate,
  });

  if (input.by === "status") {
    const statuses = JOB_STATUSES.filter((s) => closed || (s !== "done" && s !== "cancelled"));
    const columns: BoardColumn[] = statuses.map((status) => ({
      key: status,
      label: JOB_STATUS_LABELS[status],
      status,
      cards: rows.filter((r) => r.j.status === status).map(card),
    }));
    return { by: "status", type: input.type ?? null, columns };
  }

  const type = input.type;
  if (!type) throw new UserError("Board podle fází potřebuje typ zakázky.");
  const tpl = await defaultTemplate(ctx.db, type);
  const names: string[] = [];
  for (const p of (tpl?.payload as { phases?: { name: string }[] } | undefined)?.phases ?? [])
    if (!names.includes(p.name)) names.push(p.name);
  // fáze, které výchozí šablona nezná, ale zakázky v nich jsou, přibudou na konec
  for (const r of rows) if (r.phaseName && !names.includes(r.phaseName)) names.push(r.phaseName);
  const columns: BoardColumn[] = names.map((phaseName) => ({
    key: phaseName,
    label: phaseName,
    phaseName,
    cards: rows.filter((r) => r.phaseName === phaseName).map(card),
  }));
  const noPhase = rows.filter((r) => !r.phaseName);
  if (noPhase.length) columns.unshift({ key: "", label: "Bez fáze", cards: noPhase.map(card) });
  return { by: "phase", type, columns };
}

/**
 * Předvyplnění dialogu „Založit zakázky“: jeden řádek za každou službu obchodu s výchozí šablonou typu, názvem
 * „{klient} – {typ}“, startem dnes a vlastníkem. Cena se předvyplní hodnotou obchodu jen u jediné služby (R-39).
 */
export async function prefillImpl(
  ctx: Ctx,
  input: {
    companyId: string;
    services: ServiceType[];
    ownerId?: string | undefined;
    startDate?: string | undefined;
    dealValueMinor?: number | null | undefined;
  },
): Promise<PrefillRow[]> {
  const names = await companyNames(ctx, [input.companyId]);
  const client = names.get(input.companyId) ?? "Klient";
  const start = input.startDate ?? todayPrague();
  const out: PrefillRow[] = [];
  for (const type of [...new Set(input.services)]) {
    const tpl = await defaultTemplate(ctx.db, type);
    out.push({
      type,
      templateId: tpl?.id ?? null,
      templateName: tpl?.name ?? null,
      title: defaultJobTitle(client, JOB_TYPE_LABELS[type]),
      startDate: start,
      ownerId: input.ownerId ?? ctx.actor.userId,
      memberIds: [],
      billingModel: tpl?.defaultBillingModel ?? "one_off",
      priceMinor: input.services.length === 1 ? (input.dealValueMinor ?? null) : null,
    });
  }
  return out;
}
