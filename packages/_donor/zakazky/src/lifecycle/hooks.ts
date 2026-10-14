import { and, eq } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import type { PhaseTransitionHook } from "@rebar/core/entities";
import { addDaysIso, addMonthsIso, todayIso } from "@rebar/core/time";
import { job } from "../schema";

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/**
 * Kontroly a akce přechodů fází, které patří životnímu cyklu samotnému (ostatní oblasti dodávají svoje:
 * rozpočet nabídku a realizaci, realizace deník a předání). Řádek je surový řádek tabulky `job`,
 * u kontrol sloučený s probíhající změnou.
 */
export const lifecycleHooks: readonly PhaseTransitionHook[] = [
  {
    id: "lifecycle.offer-requirements",
    entity: "job",
    to: ["offer"],
    check: async (_ctx, row) => {
      if (blank(row.companyId))
        return "Do nabídky zakázku nepošlete bez zákazníka. Doplňte zákazníka.";
      if (blank(row.address)) return "Doplňte adresu stavby, než zakázku převedete do nabídky.";
      return null;
    },
  },
  {
    id: "lifecycle.execution-requirements",
    entity: "job",
    to: ["execution"],
    check: async (_ctx, row, t) => {
      if (t.from === "paused") return null; // obnova pozastavené zakázky nevrací do fáze znovu otevřené požadavky
      if (blank(row.startDate)) return "Před zahájením realizace vyplňte datum zahájení.";
      if (blank(row.managerId)) return "Před zahájením realizace určete odpovědnou osobu.";
      return null;
    },
  },
  {
    id: "lifecycle.warranty-requirements",
    entity: "job",
    to: ["warranty"],
    check: async (_ctx, row) => {
      const months = Number(row.warrantyMonths ?? 0);
      if (!(months > 0) && blank(row.warrantyUntil))
        return "Vyplňte délku záruky v měsících (nebo zakázku rovnou uzavřete bez záruky).";
      return null;
    },
    /** Konec záruky = datum předání + délka záruky; k tomu úkol odpovědnému na kontrolu a uvolnění zádržného. */
    after: async (ctx, row, t) => {
      const months = Number(row.warrantyMonths ?? 0);
      let until = row.warrantyUntil ? String(row.warrantyUntil) : null;
      if (months > 0 && (t.from === "handover" || !until))
        until = addMonthsIso(String(row.handoverAt ?? todayIso()), months);
      if (!until) return;
      await ctx.db
        .update(job)
        .set({ warrantyUntil: until })
        .where(and(eq(job.id, String(row.id))));
      const assignee = (row.managerId as string | null) ?? ctx.actor.userId;
      if (!assignee || t.from === "closed") return;
      const due = addDaysIso(until, -30);
      await ctx.db.insert(schema.task).values({
        title: `Záruka končí ${until}: zkontrolujte vady a uvolněte zádržné`,
        description: `Zakázka ${String(row.number ?? "")} ${String(row.title ?? "")}`.trim(),
        assigneeId: assignee,
        dueDate: due < todayIso() ? todayIso() : due,
        priority: "normal",
        entityType: "job",
        entityId: String(row.id),
        createdBy: ctx.actor.userId,
        updatedBy: ctx.actor.userId,
      });
    },
  },
  {
    id: "lifecycle.skip-warranty",
    entity: "job",
    from: ["handover"],
    to: ["closed"],
    check: async (_ctx, row) =>
      Number(row.warrantyMonths ?? 0) > 0
        ? `Zakázka má sjednanou záruku (${Number(row.warrantyMonths)} měsíců). Nejdřív ji zahajte přechodem do fáze Záruka.`
        : null,
  },
];
