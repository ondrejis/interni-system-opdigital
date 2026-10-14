import { z } from "zod";
import { assertEntityAccess } from "@rebar/core/entities";
import { defineCommand, defineModuleServer } from "@rebar/core/module-server";
import { follow, followerHooks, listFollowers, unfollow } from "./followers";
import { checkMove } from "./move-check";

/*
  Serverová část oblasti CRM „board“ (nástěnka a detail v pop-upu, docs/CRM.md → Oblast D):
  kontrola přesunu zakázky do stavu bez zápisu (UI z ní ukáže českou větu a nabídne doplnit pole)
  a sledující zakázky včetně upozornění při změně stavu, výhře a prohře.
*/

const jobId = z.object({ jobId: z.uuid() });
const stageOrPhase = z.object({
  jobId: z.uuid(),
  stageId: z.uuid().optional(),
  toPhase: z.enum(["inquiry", "offer", "preparation", "lost"]).optional(),
});

/** Co brání přesunu zakázky do stavu (nebo výhře či prohře): věty a pole, které stačí vyplnit. Nic nezapisuje. */
export const moveCheckCommand = defineCommand({
  name: "crm.deal.moveCheck",
  permission: "zakazky.read",
  input: stageOrPhase.refine((i) => !!i.stageId || !!i.toPhase, "Zadejte stav nebo fázi."),
  handler: (ctx, i) => checkMove(ctx, i.jobId, { stageId: i.stageId, toPhase: i.toPhase }),
});

/** Sledující zakázky a zda ji sleduji já. */
export const followerListCommand = defineCommand({
  name: "crm.follower.list",
  permission: "zakazky.read",
  input: jobId,
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    return listFollowers(ctx, i.jobId);
  },
});

/** Začne sledovat zakázku (sebe, nebo jiného uživatele, když smím zakázku upravovat). */
export const followCommand = defineCommand({
  name: "crm.follower.follow",
  permission: "zakazky.read",
  input: z.object({ jobId: z.uuid(), userId: z.uuid().optional() }),
  handler: (ctx, i) => follow(ctx, i.jobId, i.userId),
});

/** Přestane sledovat zakázku (sebe, nebo jiného uživatele, když smím zakázku upravovat). */
export const unfollowCommand = defineCommand({
  name: "crm.follower.unfollow",
  permission: "zakazky.read",
  input: z.object({ jobId: z.uuid(), userId: z.uuid().optional() }),
  handler: (ctx, i) => unfollow(ctx, i.jobId, i.userId),
});

export const area = defineModuleServer({
  commands: [moveCheckCommand, followerListCommand, followCommand, unfollowCommand],
  phaseHooks: followerHooks,
});
