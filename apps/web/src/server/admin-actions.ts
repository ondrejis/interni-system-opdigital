"use server";

import {
  createRole,
  deleteRole,
  listLoginEvents,
  revokeSessions,
  sendPasswordReset,
  setRolePermissions,
  setUserActive,
  setUserRole,
  updateRole,
} from "@rebar/core/admin";
import { createInvitation, revokeInvitation } from "@rebar/core/auth";
import { brandingSetting, companySetting, smtpSetting } from "@rebar/core/settings";
import { z } from "zod";
import { defineAction } from "./request";
import { getServices } from "./services";

/*
  Server actions pro Nastavení (uživatelé, role, firma, vzhled). Oprávnění (`users.manage`, `roles.manage`,
  `settings.manage`) kontroluje samotná služba v jádru; `permission` tady jen zkrátí zbytečné zpracování.
*/

const id = z.uuid();

export const inviteUser = defineAction({
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

export const revokeSessionsAction = defineAction({
  input: z.object({ userId: id }),
  handler: (ctx, i) => revokeSessions(ctx, i.userId),
});

/**
 * Odkaz pro nové heslo. S nastaveným SMTP odejde e-mailem; bez něj dostane správce jednorázový odkaz k předání
 * (platí hodinu). Heslo správce nikdy nevidí a nenastavuje.
 */
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

export const loginEventsAction = defineAction({
  input: z.object({ userId: id }),
  handler: async (ctx, i) =>
    (await listLoginEvents(ctx, i.userId)).map((e) => ({
      outcome: e.outcome,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
      createdAt: e.createdAt.toISOString(),
    })),
});

export const createRoleAction = defineAction({
  permission: "roles.manage",
  input: z.object({
    key: z.string().max(40),
    name: z.string().max(80),
    description: z.string().max(200).nullish(),
    require2fa: z.boolean().optional(),
  }),
  handler: async (ctx, i) => {
    const r = await createRole(ctx, i);
    return { id: r.id };
  },
});

export const updateRoleAction = defineAction({
  permission: "roles.manage",
  input: z.object({
    id,
    name: z.string().max(80).optional(),
    description: z.string().max(200).nullable().optional(),
    require2fa: z.boolean().optional(),
  }),
  handler: (ctx, { id: roleId, ...patch }) =>
    updateRole(ctx, roleId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.require2fa !== undefined ? { require2fa: patch.require2fa } : {}),
    }),
});

export const setRolePermissionsAction = defineAction({
  permission: "roles.manage",
  input: z.object({ id, permissions: z.record(z.string().max(80), z.enum(["all", "own"])) }),
  handler: (ctx, i) => setRolePermissions(ctx, i.id, i.permissions, getServices().catalog),
});

export const deleteRoleAction = defineAction({
  permission: "roles.manage",
  input: z.object({ id }),
  handler: (ctx, i) => deleteRole(ctx, i.id),
});

const orNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const saveCompanyAction = defineAction({
  permission: "settings.manage",
  input: z.object({
    name: z.string().trim().max(200),
    ico: orNull(8),
    dic: orNull(20),
    street: orNull(200),
    city: orNull(100),
    zip: orNull(10),
    email: orNull(200),
    phone: orNull(40),
    web: orNull(200),
    bankAccount: orNull(60),
  }),
  handler: (ctx, i) => getServices().settings.set(ctx, companySetting, i),
});

export const saveBrandingAction = defineAction({
  permission: "settings.manage",
  input: z.object({
    name: z.string().trim().max(80).nullable(),
    accentColor: z.string().max(7).nullable(),
    logoFileId: id.nullable(),
  }),
  handler: (ctx, i) =>
    getServices().settings.set(ctx, brandingSetting, {
      name: i.name ? i.name : null,
      accentColor: i.accentColor ? i.accentColor : null,
      logoFileId: i.logoFileId,
    }),
});
