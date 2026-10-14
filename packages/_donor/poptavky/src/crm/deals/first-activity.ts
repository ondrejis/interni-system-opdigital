import { z } from "zod";
import type { Ctx } from "@rebar/core/rbac";
import { createActivity } from "../activities/service";

/**
 * Datový tvar první aktivity, kterou jde zadat rovnou při kvalifikaci poptávky (rychlé zadání: „zavolat zítra v 9“).
 * Typ se hledá podle klíče (`call`, `meeting`, `site_visit`…) v `crm_activity_type`.
 */
export const firstActivityInput = z.object({
  typeKey: z.string().trim().min(1).max(40).default("call"),
  subject: z.string().trim().min(1, "Vyplňte předmět aktivity.").max(200),
  /** Termín jako ISO čas s pásmem; u aktivity na celý den půlnoc pražského času. */
  dueAt: z.iso.datetime({ offset: true }),
  allDay: z.boolean().default(false),
  durationMin: z.number().int().min(1).max(1440).optional(),
  note: z.string().trim().max(5000).optional(),
  /** Komu aktivita patří; bez hodnoty obchodníkovi, který poptávku kvalifikuje. */
  assigneeId: z.uuid().optional(),
});
/** Zadání první aktivity při kvalifikaci poptávky (po průchodu schématem). */
export type FirstActivityInput = z.output<typeof firstActivityInput>;

/** Vazby, na které se první aktivita váže (zakázka, firma i osoba zároveň). */
export type FirstActivityTarget = {
  jobId: string;
  companyId: string;
  personId: string | null;
};

/**
 * Založí první aktivitu při kvalifikaci (rychlé zadání: „zavolat zítra v 9“): typ podle klíče, vazby na zakázku, firmu
 * i osobu, přiřazeno zadanému nebo tomu, kdo poptávku kvalifikuje. Přepočte `crm_*` zakázky a upozorní přiřazeného.
 * Volá se v transakci kvalifikace; zakázku právě vytvořil systém, proto se přístup k vazbám nekontroluje.
 */
export async function createFirstActivity(
  ctx: Ctx,
  target: FirstActivityTarget,
  activity: FirstActivityInput,
): Promise<{ id: string } | null> {
  const row = await createActivity(
    ctx,
    {
      typeKey: activity.typeKey,
      subject: activity.subject,
      dueAt: new Date(activity.dueAt),
      allDay: activity.allDay,
      durationMin: activity.durationMin,
      note: activity.note,
      assigneeId: activity.assigneeId ?? ctx.actor.userId,
      jobId: target.jobId,
      companyId: target.companyId,
      personId: target.personId,
    },
    { trusted: true },
  );
  return { id: row.id };
}
