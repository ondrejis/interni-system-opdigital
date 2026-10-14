import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { schema } from "@rebar/core/db";
import type { PhaseTransitionHook } from "@rebar/core/entities";
import { nextNumber } from "@rebar/core/numbering";
import type { Ctx } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { jobMember } from "@rebar/zakazky/schema";
import { changesApi, notifyJobTeam } from "@rebar/zakazky/server";
import { JOB_DIARY } from "./notifications";
import { defect, handoverItem, handoverProtocol } from "./schema";

/*
  Hooky přechodů fáze zakázky (ADR 015), které zná Realizace: otevření deníku, předávací protokol s přenosem vad,
  podmínky pro záruku a uzavření. Kontroly vracejí českou větu „proč to nejde“; akce běží v transakci přechodu.
*/

export const DEFAULT_HANDOVER_ITEMS = [
  "Dílo je dokončeno podle smlouvy",
  "Staveniště je uklizeno",
  "Předána dokumentace a návody",
  "Zákazník byl seznámen s užíváním",
  "Předány klíče a příslušenství",
];

const jobIdOf = (row: Record<string, unknown>) => String(row.id);

const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n >= 2 && n <= 4 ? few : many;

/** Otevřené vady zakázky (stav pipeline typu „open“). */
export async function openDefects(ctx: Ctx, jobId: string) {
  return ctx.db
    .select({
      id: defect.id,
      title: defect.title,
      description: defect.description,
      handoverId: defect.handoverId,
    })
    .from(defect)
    .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, defect.stageId))
    .where(
      and(
        eq(defect.jobId, jobId),
        isNull(defect.deletedAt),
        sql`${schema.pipelineStage.kind} = 'open'`,
      ),
    )
    .orderBy(asc(defect.createdAt));
}

/** Podepsaný předávací protokol zakázky (nesmazaný). */
export async function hasSignedProtocol(ctx: Ctx, jobId: string): Promise<boolean> {
  const [p] = await ctx.db
    .select({ id: handoverProtocol.id })
    .from(handoverProtocol)
    .where(
      and(
        eq(handoverProtocol.jobId, jobId),
        eq(handoverProtocol.status, "signed"),
        isNull(handoverProtocol.deletedAt),
      ),
    )
    .limit(1);
  return !!p;
}

/** Založí koncept předávacího protokolu a přenese do něj otevřené vady. Opakovaně nic nezdvojí. */
export async function createHandoverDraft(ctx: Ctx, jobId: string): Promise<string | null> {
  const [draft] = await ctx.db
    .select({ id: handoverProtocol.id })
    .from(handoverProtocol)
    .where(
      and(
        eq(handoverProtocol.jobId, jobId),
        eq(handoverProtocol.status, "draft"),
        isNull(handoverProtocol.deletedAt),
      ),
    )
    .limit(1);
  const defects = await openDefects(ctx, jobId);
  let id = draft?.id ?? null;
  if (!id) {
    const number = await nextNumber(ctx.db, "realizace.predani");
    const [row] = await ctx.db
      .insert(handoverProtocol)
      .values({
        jobId,
        number,
        date: todayIso(),
        createdBy: ctx.actor.userId,
        updatedBy: ctx.actor.userId,
      })
      .returning({ id: handoverProtocol.id });
    id = row!.id;
    const items = [
      ...DEFAULT_HANDOVER_ITEMS.map((text) => ({ text, ok: true, note: null as string | null })),
      ...defects.map((d) => ({ text: `Vada: ${d.title}`, ok: false, note: d.description })),
    ];
    await ctx.db
      .insert(handoverItem)
      .values(items.map((it, n) => ({ protocolId: id!, position: n, ...it })));
    await recordAudit(ctx, {
      action: "create",
      entityType: "job",
      entityId: jobId,
      summary: `Založen předávací protokol ${number}${defects.length ? ` (otevřených vad: ${defects.length})` : ""}`,
    });
  }
  // vady zůstávají vadami zakázky, protokol je jen eviduje
  for (const d of defects)
    if (d.handoverId !== id)
      await ctx.db.update(defect).set({ handoverId: id }).where(eq(defect.id, d.id));
  return id;
}

export const phaseHooks: PhaseTransitionHook[] = [
  {
    id: "realizace.open-diary",
    entity: "job",
    to: ["execution"],
    check: async (ctx, row) => {
      const id = jobIdOf(row);
      if (row.managerId) return null;
      const [m] = await ctx.db
        .select({ u: jobMember.userId })
        .from(jobMember)
        .where(eq(jobMember.jobId, id))
        .limit(1);
      return m
        ? null
        : "Do deníku musí mít kdo zapisovat: určete u zakázky vedoucího nebo přidejte člena týmu.";
    },
    after: async (ctx, row, t) => {
      const id = jobIdOf(row);
      if (t.from === "paused" || t.from === "handover") return;
      await recordAudit(ctx, {
        action: "update",
        entityType: "job",
        entityId: id,
        summary: "Zahájena realizace: stavební deník je otevřený",
      });
      await notifyJobTeam(ctx.db, id, ctx.actor.userId, JOB_DIARY, {});
    },
  },
  {
    id: "realizace.handover-check",
    entity: "job",
    to: ["handover"],
    from: ["execution"],
    check: async (ctx, row) => {
      const open = await changesApi.countOpenChanges(ctx, jobIdOf(row));
      if (!open.count) return null;
      return `Zakázku nejde předat, ${plural(open.count, "zbývá", "zbývají", "zbývá")} ${open.count} ${plural(open.count, "rozpracovaná změna", "rozpracované změny", "rozpracovaných změn")}${open.labels.length ? ` (${open.labels.join("; ")})` : ""}. Schvalte je nebo zamítněte.`;
    },
  },
  {
    id: "realizace.handover-protocol",
    entity: "job",
    to: ["handover"],
    after: async (ctx, row) => {
      await createHandoverDraft(ctx, jobIdOf(row));
    },
  },
  {
    id: "realizace.signed-protocol",
    entity: "job",
    to: ["warranty", "closed"],
    check: async (ctx, row, t) => {
      // z uzavřené zakázky zpět do záruky protokol už je; při uzavření ze záruky také
      if (t.from === "closed" || t.from === "warranty") return null;
      return (await hasSignedProtocol(ctx, jobIdOf(row)))
        ? null
        : "Zakázku nejde předat do záruky, dokud není podepsaný předávací protokol.";
    },
  },
  {
    id: "realizace.no-open-defects",
    entity: "job",
    to: ["closed"],
    check: async (ctx, row) => {
      const open = await openDefects(ctx, jobIdOf(row));
      if (!open.length) return null;
      return `Zakázku nejde uzavřít, ${plural(open.length, "zbývá", "zbývají", "zbývá")} ${open.length} ${plural(open.length, "otevřená vada", "otevřené vady", "otevřených vad")}: ${open
        .slice(0, 3)
        .map((d) => d.title)
        .join("; ")}${open.length > 3 ? "…" : ""}.`;
    },
  },
];
