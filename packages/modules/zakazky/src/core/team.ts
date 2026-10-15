import { and, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { inTx, UserError, type Ctx } from "@rebar/core/rbac";
import { person } from "@rebar/kontakty/schema";
import { jobMember, jobParticipant } from "../schema";
import type { MemberRole } from "../shared";
import { assertJobWrite } from "./guard";
import { assertActiveUsers, assertMaySeePrivate, loadJob, userNames } from "./lookups";
import { privateScope } from "../access";

/** Přidá uživatele do týmu zakázky, nebo změní jeho roli (vedoucí / člen). */
export async function addMemberImpl(
  ctx: Ctx,
  input: { jobId: string; userId: string; role: MemberRole },
): Promise<void> {
  await inTx(ctx, async (c) => {
    const j = await loadJob(c, input.jobId, { lock: true });
    await assertJobWrite(c, j);
    await assertActiveUsers(c.db, [input.userId]);
    if (j.isPrivate) await assertMaySeePrivate(c.db, [input.userId]);
    const [row] = await c.db
      .select()
      .from(jobMember)
      .where(
        and(
          eq(jobMember.jobId, j.id),
          eq(jobMember.userId, input.userId),
          isNull(jobMember.deletedAt),
        ),
      );
    if (row) {
      if (row.role === input.role) return;
      await c.db
        .update(jobMember)
        .set({ role: input.role, updatedBy: c.actor.userId })
        .where(eq(jobMember.id, row.id));
    } else {
      await c.db.insert(jobMember).values({
        jobId: j.id,
        userId: input.userId,
        role: input.role,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      });
    }
    const names = await userNames(c.db, [input.userId]);
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: j.id,
      summary: `${names.get(input.userId) ?? "Uživatel"} v týmu (${input.role === "lead" ? "vedoucí" : "člen"})`,
      entityTitle: `${j.number} ${j.title}`,
      isPrivate: j.isPrivate,
    });
  });
}

/** Odebere uživatele z týmu zakázky (vlastník zakázky zůstává vlastníkem, i když není v týmu). */
export async function removeMemberImpl(
  ctx: Ctx,
  input: { jobId: string; userId: string },
): Promise<void> {
  await inTx(ctx, async (c) => {
    const j = await loadJob(c, input.jobId, { lock: true });
    await assertJobWrite(c, j);
    const res = await c.db
      .update(jobMember)
      .set({ deletedAt: new Date(), deletedBy: c.actor.userId, updatedBy: c.actor.userId })
      .where(
        and(
          eq(jobMember.jobId, j.id),
          eq(jobMember.userId, input.userId),
          isNull(jobMember.deletedAt),
        ),
      )
      .returning({ id: jobMember.id });
    if (!res.length) return;
    const names = await userNames(c.db, [input.userId]);
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: j.id,
      summary: `${names.get(input.userId) ?? "Uživatel"} odebrán(a) z týmu`,
      entityTitle: `${j.number} ${j.title}`,
      isPrivate: j.isPrivate,
    });
  });
}

/** Přidá další kontakt na zakázku (investor, správce webu…) s rolí, nebo změní jeho roli. */
export async function addParticipantImpl(
  ctx: Ctx,
  input: { jobId: string; personId: string; role?: string | null | undefined },
): Promise<void> {
  await inTx(ctx, async (c) => {
    const j = await loadJob(c, input.jobId, { lock: true });
    await assertJobWrite(c, j);
    const [p] = await c.db
      .select({ id: person.id })
      .from(person)
      .where(and(eq(person.id, input.personId), isNull(person.deletedAt), privateScope(c, person)));
    if (!p) throw new UserError("Kontakt nenalezen.");
    const role = input.role?.trim() || null;
    const [row] = await c.db
      .select()
      .from(jobParticipant)
      .where(
        and(
          eq(jobParticipant.jobId, j.id),
          eq(jobParticipant.personId, input.personId),
          isNull(jobParticipant.deletedAt),
        ),
      );
    if (row)
      await c.db
        .update(jobParticipant)
        .set({ role, updatedBy: c.actor.userId })
        .where(eq(jobParticipant.id, row.id));
    else
      await c.db.insert(jobParticipant).values({
        jobId: j.id,
        personId: input.personId,
        role,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      });
  });
}

/** Odebere další kontakt ze zakázky. */
export async function removeParticipantImpl(
  ctx: Ctx,
  input: { jobId: string; personId: string },
): Promise<void> {
  await inTx(ctx, async (c) => {
    const j = await loadJob(c, input.jobId, { lock: true });
    await assertJobWrite(c, j);
    await c.db
      .update(jobParticipant)
      .set({ deletedAt: new Date(), deletedBy: c.actor.userId, updatedBy: c.actor.userId })
      .where(
        and(
          eq(jobParticipant.jobId, j.id),
          eq(jobParticipant.personId, input.personId),
          isNull(jobParticipant.deletedAt),
        ),
      );
  });
}
