"use server";

import {
  changeOwnPassword,
  changePasswordInput,
  profileInput,
  revokeOtherOwnSessions,
  revokeOwnSession,
  updateOwnProfile,
} from "@rebar/core/auth";
import { z } from "zod";
import { currentSessionId } from "./current-session";
import { defineAction } from "./request";

/*
  Server actions pro stránku Můj účet. Každý uživatel mění jen sebe (aktér je vždy z přihlášení, žádná akce nebere
  `userId` od klienta). Heslo se do auditu, logu ani odpovědi nikdy nedostane.
*/

export const changePasswordAction = defineAction({
  input: changePasswordInput,
  handler: async (ctx, i) => changeOwnPassword(ctx, i, { keepSessionId: await currentSessionId() }),
});

export const updateProfileAction = defineAction({
  input: profileInput,
  handler: (ctx, i) => updateOwnProfile(ctx, i),
});

export const revokeSessionAction = defineAction({
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => revokeOwnSession(ctx, i.id, await currentSessionId()),
});

export const revokeOtherSessionsAction = defineAction({
  input: z.object({}),
  handler: async (ctx) => ({
    revoked: await revokeOtherOwnSessions(ctx, await currentSessionId()),
  }),
});
