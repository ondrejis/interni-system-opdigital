import { and, eq, isNull } from "drizzle-orm";
import type { Ctx } from "@rebar/core/rbac";
import { calendar } from "../schema";
import {
  accessTokenFor,
  myAccount,
  openState,
  saveAccountFromConsent,
  syncCalendarList,
} from "./accounts";
import { googleClient, type KalEnv } from "./env";
import { syncAccount } from "./sync";
import { ensureWatch } from "./watch";

/** Návrat ze souhlasu Googlu (`/api/kalendar/google/callback`): uloží účet, načte kalendáře a spustí první synchronizaci. */
export async function completeConnect(
  ctx: Ctx,
  env: KalEnv,
  q: { code?: string | null; state?: string | null; error?: string | null },
): Promise<{ redirectTo: string; ok: boolean }> {
  const userId = ctx.actor.userId;
  const fallback = "/nastaveni/google-kalendar";
  if (!userId || !q.state) return { redirectTo: `${fallback}?google=error`, ok: false };
  let returnTo: string;
  try {
    returnTo = openState(env.cipher, q.state, userId).returnTo;
  } catch {
    return { redirectTo: `${fallback}?google=error`, ok: false };
  }
  if (q.error || !q.code) return { redirectTo: `${returnTo}?google=denied`, ok: false };
  try {
    const client = await googleClient(ctx.db, env);
    const tokens = await client.exchangeCode(
      q.code,
      `${env.baseURL.replace(/\/$/, "")}/api/kalendar/google/callback`,
    );
    const { account, calendars } = await saveAccountFromConsent(ctx, env, client, userId, tokens);
    await syncAccount(ctx.db, env, account.id).catch(() => {});
    for (const c of calendars)
      if (c.visible || c.isWriteTarget) await ensureWatch(ctx.db, env, c.id);
    return { redirectTo: `${returnTo}?google=ok`, ok: true };
  } catch {
    return { redirectTo: `${returnTo}?google=error`, ok: false };
  }
}

/** Znovu načte seznam kalendářů mého účtu z Googlu. */
export async function refreshMyCalendars(ctx: Ctx, env: KalEnv) {
  const account = await myAccount(ctx);
  if (!account) return null;
  const client = await googleClient(ctx.db, env);
  const token = await accessTokenFor(ctx, env, client, account);
  const infos = await client.listCalendars(token);
  await syncCalendarList(ctx, account, infos);
  return account;
}

/** Kalendáře mého účtu podle id. */
export async function myCalendar(ctx: Ctx, calendarId: string) {
  const account = await myAccount(ctx);
  if (!account) return null;
  const [c] = await ctx.db
    .select()
    .from(calendar)
    .where(
      and(
        eq(calendar.id, calendarId),
        eq(calendar.accountId, account.id),
        isNull(calendar.deletedAt),
      ),
    );
  return c ? { account, calendar: c } : null;
}
