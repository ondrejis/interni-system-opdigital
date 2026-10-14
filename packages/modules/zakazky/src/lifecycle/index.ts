import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getLookup } from "@rebar/core/config-data";
import {
  assertEntityAccess,
  resolveEntity,
  updateRecord,
  visibleIds,
  type EntityRegistry,
  type QueryInput,
} from "@rebar/core/entities";
import {
  defineCommand,
  type AttentionItem,
  type CalendarItem,
  type ModuleServer,
} from "@rebar/core/module-server";
import { NotFoundError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { job } from "../schema";
import { lifecycleHooks } from "./hooks";
import { PHASE_KEYS } from "./phases";
import { previewTransitions, stageForTransition } from "./transitions";

const jobId = z.uuid();

async function loadJob(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(job)
    .where(and(eq(job.id, id), isNull(job.deletedAt)));
  if (!row) throw new NotFoundError("Zakázka nenalezena.");
  return row as Record<string, unknown>;
}

/**
 * Přechod zakázky do fáze. Je to jen pohodlný vstup do téže cesty jako změna stavu v tabulce nebo na kanbanu:
 * vybere stav fáze (první, nebo zadaný) a změní ho přes entitu, takže platí stejné kontroly a hooky.
 */
export const transition = defineCommand({
  name: "zakazky.transition",
  permission: "zakazky.write",
  input: z.object({
    jobId,
    to: z.enum(PHASE_KEYS),
    stageId: z.uuid().optional(),
    /** Důvod prohry (hodnota číselníku „Důvod prohry zakázky“). */
    reason: z.string().trim().max(60).optional(),
  }),
  handler: async (ctx, i, deps) => {
    const def = deps.registry.get("job")!;
    const e = await resolveEntity(ctx.db, def);
    const stage = await stageForTransition(ctx.db, i.to, i.stageId);
    const res = await updateRecord(ctx, deps.registry, e, i.jobId, {
      stage: stage.id,
      ...(i.reason ? { lostReason: i.reason } : {}),
    });
    return { phase: res.row.phase as string, stageId: stage.id, updatedAt: res.row.updatedAt };
  },
});

/** Pro každou možnou další fázi: jde přechod, a když ne, které kontroly nejsou splněné. */
export const preview = defineCommand({
  name: "zakazky.phase.preview",
  permission: "zakazky.read",
  input: z.object({ jobId }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    const row = await loadJob(ctx, i.jobId);
    const reasons = await getLookup(ctx.db, "job.lost_reason");
    return {
      phase: String(row.phase),
      pausedFrom: (row.pausedFrom as string | null) ?? null,
      options: await previewTransitions(ctx, row),
      lostReasons: reasons.map((r) => ({ value: r.value, label: r.label })),
    };
  },
});

const canRead = (ctx: Ctx) => ctx.actor.unrestricted || ctx.actor.permissions.has("zakazky.read");

/** Záznamy zakázek, které aktér vidí, zúžené dotazem na řádky (id z entity hlídají oprávnění a rozsah). */
async function visibleJobs(ctx: Ctx, registry: EntityRegistry, filters: QueryInput["filters"]) {
  const def = registry.get("job");
  if (!def) return [] as string[];
  return visibleIds(ctx, await resolveEntity(ctx.db, def), { filters });
}

export const area: ModuleServer = {
  commands: [transition, preview],
  phaseHooks: lifecycleHooks,
  attention: [
    async (ctx, deps) => {
      if (!canRead(ctx)) return [];
      const items: AttentionItem[] = [];
      const today = todayIso();

      // nabídky bez odpovědi déle než 14 dní
      const offers = await visibleJobs(ctx, deps.registry, {
        op: "and",
        conditions: [{ attr: "phase", op: "is", value: "offer" }],
      });
      if (offers.length) {
        const stale = await ctx.db
          .select({ id: job.id, number: job.number, title: job.title, at: job.phaseChangedAt })
          .from(job)
          .where(
            and(inArray(job.id, offers), lt(job.phaseChangedAt, sql`now() - interval '14 days'`)),
          )
          .limit(10);
        for (const r of stale)
          items.push({
            id: `job-offer-stale-${r.id}`,
            module: "zakazky",
            severity: "warning",
            title: `Nabídka ${r.number} „${r.title}“ čeká na odpověď déle než 14 dní`,
            detail: "Ozvěte se zákazníkovi, nebo nabídku označte jako prohranou.",
            href: `/zakazky/${r.id}`,
          });
      }

      // záruka končí do 60 dní
      const warranty = await visibleJobs(ctx, deps.registry, {
        op: "and",
        conditions: [
          { attr: "phase", op: "is", value: "warranty" },
          { attr: "warrantyUntil", op: "between", value: [today, addDaysIso(today, 60)] },
        ],
      });
      if (warranty.length) {
        const rows = await ctx.db
          .select({
            id: job.id,
            number: job.number,
            title: job.title,
            until: job.warrantyUntil,
          })
          .from(job)
          .where(inArray(job.id, warranty))
          .limit(10);
        for (const r of rows)
          items.push({
            id: `job-warranty-ends-${r.id}`,
            module: "zakazky",
            severity: r.until && r.until <= addDaysIso(today, 14) ? "warning" : "info",
            title: `Záruka zakázky ${r.number} „${r.title}“ končí ${r.until}`,
            detail: "Zkontrolujte vady a uvolněte zádržné.",
            href: `/zakazky/${r.id}`,
          });
      }

      return items;
    },
  ],
  calendarLayers: [
    {
      key: "zakazky.warranty-end",
      label: "Konec záruky",
      color: "indigo",
      items: async (ctx, range, deps): Promise<CalendarItem[]> => {
        if (!canRead(ctx)) return [];
        const ids = await visibleJobs(ctx, deps.registry, {
          op: "and",
          conditions: [
            { attr: "phase", op: "is", value: "warranty" },
            { attr: "warrantyUntil", op: "between", value: [range.from, range.to] },
          ],
        });
        if (!ids.length) return [];
        const rows = await ctx.db
          .select({ id: job.id, number: job.number, title: job.title, until: job.warrantyUntil })
          .from(job)
          .where(inArray(job.id, ids));
        return rows.flatMap((r) =>
          r.until
            ? [
                {
                  id: `warranty-end-${r.id}`,
                  layer: "zakazky.warranty-end",
                  title: `Konec záruky: ${r.number} ${r.title}`,
                  start: r.until,
                  allDay: true,
                  href: `/zakazky/${r.id}`,
                },
              ]
            : [],
        );
      },
    },
  ],
};
