"use server";

import {
  appearancePatch,
  changeOwnPassword,
  changePasswordInput,
  profileInput,
  revokeAllTrustedDevices,
  revokeOtherOwnSessions,
  revokeOwnSession,
  revokeTrustedDevice,
  updateOwnAppearance,
  updateOwnProfile,
} from "@rebar/core/auth";
import { z } from "zod";
import { currentSessionId } from "./current-session";
import { defineAction } from "./request";
import { allowedStartPages } from "./start-pages";

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

export const revokeTrustedDeviceAction = defineAction({
  input: z.object({ id: z.uuid() }),
  handler: (ctx, i) => revokeTrustedDevice(ctx, i.id),
});

export const revokeAllTrustedDevicesAction = defineAction({
  input: z.object({}),
  handler: async (ctx) => ({ revoked: await revokeAllTrustedDevices(ctx) }),
});

/** Vzhled (motiv, hustota, úvodní stránka); úvodní stránku smí uživatel zvolit jen z těch, na které má přístup. */
export const updateAppearanceAction = defineAction({
  input: appearancePatch,
  handler: (ctx, i) =>
    updateOwnAppearance(
      ctx,
      i,
      allowedStartPages(ctx).map((p) => p.href),
    ),
});
