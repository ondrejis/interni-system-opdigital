import { NotImplementedError } from "@rebar/core/contracts";
import { defineCommand } from "@rebar/core/module-server";
import { PermissionError, UserError, canSeePrivate } from "@rebar/core/rbac";
import { textToDoc } from "../library/logic";
import { privateCreateNoteInput, privateOverviewInput } from "./contract";
import { loadPrivateOverview } from "./data";
import type { CreateNoteResult, PrivateOverview } from "./types";

/** Všechny soukromé záznamy na jednom místě, seskupené podle typu. */
export const privateOverview = defineCommand({
  name: "muj-prostor.private.overview",
  permission: "muj-prostor.private_overview",
  input: privateOverviewInput,
  handler: async (ctx, _input, deps): Promise<PrivateOverview> => {
    if (!canSeePrivate(ctx)) throw new PermissionError();
    return loadPrivateOverview(ctx, deps);
  },
});

/** Nová samostatná soukromá poznámka; zakládá ji služba `tasks` (modul Úkoly a poznámky). */
export const privateCreateNote = defineCommand({
  name: "muj-prostor.private.createNote",
  permission: "muj-prostor.private_overview",
  input: privateCreateNoteInput,
  handler: async (ctx, input, deps): Promise<CreateNoteResult> => {
    if (!canSeePrivate(ctx)) throw new PermissionError();
    const tasks = deps.services.optional("tasks");
    if (!tasks) throw new UserError("Modul Úkoly a poznámky není zapnutý, poznámku nejde založit.");
    try {
      const { id } = await tasks.createPrivateNote(ctx, {
        title: input.title,
        bodyJson: textToDoc(input.text),
      });
      return { id, href: deps.registry.get("note")?.url(id) ?? null };
    } catch (e) {
      if (e instanceof NotImplementedError)
        throw new UserError("Poznámky zatím nejsou k dispozici.");
      throw e;
    }
  },
});

/** Příkazy oblasti „private“. */
export const privateCommands = [privateOverview, privateCreateNote];
