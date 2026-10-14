"use server";

import { NotFoundError } from "@rebar/core/rbac";
import { z } from "zod";
import { assertCommandPermission } from "./command-gate";
import { collectDashboard } from "./dashboard";
import { defineAction } from "./request";
import { getServices } from "./services";

/*
  Jednotný vstupní bod pro příkazy modulů (`api.command`) a pro přehled. Oprávnění příkazu a validace vstupu
  se kontrolují tady; samotná logika a oprávnění k datům jsou v modulu a v datové vrstvě.
*/

export const runCommand = defineAction({
  input: z.object({ name: z.string().min(1).max(80), input: z.unknown() }),
  handler: async (ctx, { name, input }) => {
    const s = getServices();
    const cmd = s.collected.commands.get(name);
    if (!cmd) throw new NotFoundError("Neznámý příkaz.");
    assertCommandPermission(ctx, cmd);
    return cmd.handler(ctx, cmd.input.parse(input), s.moduleDeps);
  },
});

/** „Vyžaduje pozornost“ a dlaždice přehledu od zapnutých modulů (stejná data jako úvodní stránka). */
export const getDashboard = defineAction({
  input: z.object({}),
  handler: async (ctx) => collectDashboard(ctx),
});
