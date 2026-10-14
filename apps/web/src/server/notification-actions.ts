"use server";

import { isNull } from "drizzle-orm";
import { z } from "zod";
import { collectPermissions } from "@rebar/core";
import { describeUserAgent } from "@rebar/core/auth";
import { schema } from "@rebar/core/db";
import {
  getAdminRules,
  getDeliveryStats,
  getDeliveryStatus,
  getMyPreferences,
  listMyDeliveries,
  notificationRulesSchema,
  queueTestNotification,
  saveAdminRules,
  saveMyPreferences,
  userPrefsSchema,
} from "@rebar/core/notifications";
import { listDevices, removeDevice } from "@rebar/core/push";
import { defineAction } from "./request";
import { getServices } from "./services";

/*
  Upozornění: předvolby přihlášeného (Nastavení → Upozornění), jeho zařízení a pravidla klienta (jen správce).
  Odesílání do zařízení tu není: zkušební upozornění se jen zařadí do fronty a pošle ho worker.
*/

export const getMyNotificationPrefs = defineAction({
  input: z.object({}),
  handler: async (ctx) => {
    const [prefs, deliveries] = await Promise.all([getMyPreferences(ctx), listMyDeliveries(ctx)]);
    return {
      prefs,
      deliveries: deliveries.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
        sentAt: d.sentAt?.toISOString() ?? null,
      })),
    };
  },
});

export const saveMyNotificationPrefs = defineAction({
  input: userPrefsSchema,
  handler: async (ctx, i) => saveMyPreferences(ctx, i),
});

/** Zařízení přihlášeného s odběrem; `endpoint` tohoto prohlížeče slouží jen k označení „toto zařízení“. */
export const listMyDevices = defineAction({
  input: z.object({ endpoint: z.string().max(1000).nullish() }),
  handler: async (ctx, i) => {
    const devices = await listDevices(ctx);
    return devices.map((d) => {
      const ua = describeUserAgent(d.userAgent);
      return {
        id: d.id,
        label: ua.label,
        device: ua.device,
        current: !!i.endpoint && d.endpoint === i.endpoint,
        createdAt: d.createdAt.toISOString(),
        lastSentAt: d.lastSentAt?.toISOString() ?? null,
        failing: d.failures >= 3,
      };
    });
  },
});

export const removeMyDevice = defineAction({
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => ({ removed: await removeDevice(ctx, i.id) }),
});

export const sendMyTestNotification = defineAction({
  input: z.object({}),
  handler: async (ctx) => queueTestNotification(ctx),
});

export const getTestNotificationStatus = defineAction({
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => getDeliveryStatus(ctx, i.id),
});

/* ---------- správce klienta ---------- */

export const getNotificationRules = defineAction({
  permission: "settings.manage",
  input: z.object({}),
  handler: async (ctx) => {
    const s = getServices();
    const [rules, stats, roles] = await Promise.all([
      getAdminRules(ctx),
      getDeliveryStats(ctx),
      ctx.db
        .select({ key: schema.role.key, name: schema.role.name })
        .from(schema.role)
        .where(isNull(schema.role.deletedAt))
        .orderBy(schema.role.name),
    ]);
    return {
      rules,
      stats: { ...stats, failures: stats.failures.map((f) => ({ ...f, at: f.at.toISOString() })) },
      roles,
      permissions: collectPermissions(s.runtime.modules).map((p) => ({
        key: p.key,
        label: p.label,
      })),
      pushConfigured: !!s.vapidPublicKey,
    };
  },
});

export const saveNotificationRules = defineAction({
  permission: "settings.manage",
  input: notificationRulesSchema,
  handler: async (ctx, i) => saveAdminRules(ctx, getServices().settings, i),
});
