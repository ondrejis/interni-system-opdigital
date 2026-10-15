"use server";

import { sendPasswordReset, setUserActive, setUserRole } from "@rebar/core/admin";
import {
  createInvitation,
  listSecurityEvents,
  listUserSessions,
  revokeInvitation,
  revokeUserSession,
  revokeUserSessions,
  updateUserFields,
  userFieldsInput,
} from "@rebar/core/auth";
import { smtpSetting } from "@rebar/core/settings";
import { z } from "zod";
import { defineAction } from "./request";
import { getServices } from "./services";

/*
  Server actions stránky Nastavení → Uživatelé (jen majitel: `users.manage`). Oprávnění kontroluje i samotná služba v
  jádru. Nahrazují uživatelské akce z `admin-actions.ts` (ty zůstaly kvůli Rolím a firmě) o odhlášení s důvěryhodnými
  zařízeními, úpravu polí uživatele a bezpečnostní historii.
*/

const id = z.uuid();

export const inviteUserAction = defineAction({
  permission: "users.manage",
  input: z.object({ email: z.string().max(200), roleId: id }),
  handler: async (ctx, i) => {
    const s = getServices();
    return createInvitation(ctx, i, { mailer: s.mailer, baseURL: s.env.APP_URL });
  },
});

export const revokeInvitationAction = defineAction({
  permission: "users.manage",
  input: z.object({ id }),
  handler: (ctx, i) => revokeInvitation(ctx, i.id),
});

export const setUserRoleAction = defineAction({
  permission: "users.manage",
  input: z.object({ userId: id, roleId: id }),
  handler: (ctx, i) => setUserRole(ctx, i.userId, i.roleId),
});

export const setUserActiveAction = defineAction({
  permission: "users.manage",
  input: z.object({ userId: id, active: z.boolean() }),
  handler: (ctx, i) => setUserActive(ctx, i.userId, i.active),
});

export const updateUserFieldsAction = defineAction({
  permission: "users.manage",
  input: userFieldsInput,
  handler: (ctx, i) => updateUserFields(ctx, i),
});

/** Odhlásí uživatele ze všech zařízení a zruší jeho důvěryhodná zařízení (majitel kohokoli, každý sebe). */
export const revokeUserSessionsAction = defineAction({
  input: z.object({ userId: id }),
  handler: (ctx, i) => revokeUserSessions(ctx, i.userId),
});

export const revokeUserSessionAction = defineAction({
  permission: "users.manage",
  input: z.object({ userId: id, sessionId: id }),
  handler: (ctx, i) => revokeUserSession(ctx, i.userId, i.sessionId),
});

/** Přihlášená zařízení a posledních 50 bezpečnostních událostí uživatele (přihlášení, pokusy, 2FA, zařízení). */
export const userSecurityAction = defineAction({
  permission: "users.manage",
  input: z.object({ userId: id }),
  handler: async (ctx, i) => ({
    sessions: (await listUserSessions(ctx, i.userId)).map((s) => ({
      id: s.id,
      label: s.label,
      device: s.device,
      ip: s.ip,
      lastActiveAt: s.lastActiveAt.toISOString(),
    })),
    events: (await listSecurityEvents(ctx, { userId: i.userId })).map((e) => ({
      id: e.id,
      label: e.label,
      summary: e.summary,
      ip: e.ip,
      actorName: e.actorName,
      occurredAt: e.occurredAt.toISOString(),
    })),
  }),
});

/** Odkaz pro nové heslo (e-mailem, nebo jednorázový odkaz k předání, když nejsou nastavené e-maily). */
export const sendPasswordResetAction = defineAction({
  permission: "users.manage",
  input: z.object({ userId: id }),
  handler: async (ctx, i) => {
    const s = getServices();
    const smtp = await s.settings.get(ctx.db, smtpSetting);
    const r = await sendPasswordReset(
      ctx,
      { auth: s.auth, baseURL: s.env.APP_URL, deliverByEmail: smtp.enabled && !!smtp.host },
      i.userId,
    );
    return r.delivery === "link"
      ? {
          delivery: "link" as const,
          email: r.email,
          url: r.url,
          expiresAt: r.expiresAt.toISOString(),
        }
      : { delivery: "email" as const, email: r.email };
  },
});

/** Vlastní bezpečnostní události přihlášeného (Zabezpečení účtu). */
export const ownSecurityEventsAction = defineAction({
  input: z.object({}),
  handler: async (ctx) =>
    (await listSecurityEvents(ctx, { limit: 30 })).map((e) => ({
      id: e.id,
      label: e.label,
      summary: e.summary,
      ip: e.ip,
      actorName: e.actorName,
      occurredAt: e.occurredAt.toISOString(),
    })),
});
