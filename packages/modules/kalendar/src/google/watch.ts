import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@rebar/core/db";
import { safeEqual } from "@rebar/core/http";
import { calendar, calendarAccount } from "../schema";
import { accessTokenFor } from "./accounts";
import type { GoogleCalendarClient } from "./client";
import { googleClient, googleCtx, pushAvailable, webhookUrl, type KalEnv } from "./env";

/*
  Push kanály Google (`events.watch`): změna kalendáře v Googlu zavolá veřejnou trasu `/api/kalendar/google/webhook`,
  která jen ověří kanál a tajný token a zařadí synchronizaci kalendáře. Kanály platí nejvýš pár dní, proto je
  úloha `kalendar.watch.renew` obnovuje s předstihem. Bez `https` adresy (vývoj) push neběží a stačí pravidelné čtení.
*/

/** Úloha: synchronizace jednoho kalendáře (po webhooku, po zobrazení kalendáře). */
export const syncCalendarJobDef = {
  name: "kalendar.sync.calendar",
  schema: z.object({ calendarId: z.uuid(), full: z.boolean().optional() }),
};

const TTL_SECONDS = 7 * 24 * 3600;
/** Kanál se obnoví, vyprší-li za méně než den. */
const RENEW_BEFORE_MS = 24 * 3600_000;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Založí nebo obnoví push kanál kalendáře. Selhání Googlu kanál nezaloží, kalendář se dál čte pravidelně. */
export async function ensureWatch(
  db: Executor,
  env: KalEnv,
  calendarId: string,
  opts: { client?: GoogleCalendarClient; force?: boolean } = {},
): Promise<"started" | "renewed" | "skipped" | "unavailable"> {
  if (!pushAvailable(env)) return "unavailable";
  const ctx = googleCtx(db);
  const [cal] = await db
    .select()
    .from(calendar)
    .where(and(eq(calendar.id, calendarId), isNull(calendar.deletedAt)));
  if (!cal || (!cal.visible && !cal.isWriteTarget)) return "skipped";
  const alive =
    cal.watchChannelId &&
    cal.watchExpiresAt &&
    cal.watchExpiresAt.getTime() - Date.now() > RENEW_BEFORE_MS;
  if (alive && !opts.force) return "skipped";
  const [account] = await db
    .select()
    .from(calendarAccount)
    .where(eq(calendarAccount.id, cal.accountId));
  if (!account || account.deletedAt || account.status === "reauth") return "skipped";
  const client = opts.client ?? (await googleClient(db, env));
  try {
    const token = await accessTokenFor(ctx, env, client, account);
    const id = crypto.randomUUID();
    const secret = randomBytes(24).toString("hex");
    const res = await client.watch(token, cal.googleId, {
      id,
      address: webhookUrl(env),
      token: secret,
      ttlSeconds: TTL_SECONDS,
    });
    if (cal.watchChannelId && cal.watchResourceId)
      await client.stopChannel(token, { id: cal.watchChannelId, resourceId: cal.watchResourceId });
    await db
      .update(calendar)
      .set({
        watchChannelId: id,
        watchResourceId: res.resourceId,
        watchExpiresAt: res.expiration,
        watchTokenHash: sha256(secret),
      })
      .where(eq(calendar.id, cal.id));
    return cal.watchChannelId ? "renewed" : "started";
  } catch (e) {
    await db
      .update(calendar)
      .set({
        lastError:
          `Push kanál se nepodařilo založit, kalendář se čte pravidelně: ${e instanceof Error ? e.message : String(e)}`.slice(
            0,
            500,
          ),
      })
      .where(eq(calendar.id, cal.id));
    return "unavailable";
  }
}

/** Zastaví push kanál kalendáře (skrytí kalendáře, odpojení). */
export async function stopWatch(
  db: Executor,
  env: KalEnv,
  calendarId: string,
  opts: { client?: GoogleCalendarClient } = {},
): Promise<void> {
  const ctx = googleCtx(db);
  const [cal] = await db.select().from(calendar).where(eq(calendar.id, calendarId));
  if (!cal?.watchChannelId) return;
  try {
    const [account] = await db
      .select()
      .from(calendarAccount)
      .where(eq(calendarAccount.id, cal.accountId));
    const client = opts.client ?? (await googleClient(db, env));
    if (account && cal.watchResourceId)
      await client.stopChannel(await accessTokenFor(ctx, env, client, account), {
        id: cal.watchChannelId,
        resourceId: cal.watchResourceId,
      });
  } catch {
    // kanál vyprší sám
  }
  await db
    .update(calendar)
    .set({
      watchChannelId: null,
      watchResourceId: null,
      watchExpiresAt: null,
      watchTokenHash: null,
    })
    .where(eq(calendar.id, calendarId));
}

/** Obnoví kanály, které brzy vyprší, a založí chybějící u zobrazených kalendářů (úloha `kalendar.watch.renew`). */
export async function renewWatches(db: Executor, env: KalEnv): Promise<number> {
  if (!pushAvailable(env)) return 0;
  const soon = new Date(Date.now() + RENEW_BEFORE_MS);
  const cals = await db
    .select({ id: calendar.id })
    .from(calendar)
    .innerJoin(calendarAccount, eq(calendarAccount.id, calendar.accountId))
    .where(
      and(
        isNull(calendar.deletedAt),
        isNull(calendarAccount.deletedAt),
        or(eq(calendar.visible, true), eq(calendar.isWriteTarget, true)),
        or(isNull(calendar.watchChannelId), lt(calendar.watchExpiresAt, soon)),
      ),
    );
  let n = 0;
  for (const c of cals) if ((await ensureWatch(db, env, c.id)) !== "skipped") n++;
  return n;
}

/** Odpověď na volání webhooku. */
export type WebhookResult = { status: 200 | 400 | 403 | 404; calendarId?: string };

/**
 * Zpracuje volání push kanálu Googlu (hlavičky `X-Goog-*`). Kanál musí existovat a tajný token musí sedět (porovnání
 * otisku v konstantním čase). První zpráva kanálu (`sync`) jen potvrzuje založení. Synchronizaci neprovádí, jen ji zařadí.
 */
export async function handleGoogleWebhook(
  db: Executor,
  headers: { get(name: string): string | null },
  enqueueSync: (calendarId: string) => Promise<void>,
): Promise<WebhookResult> {
  const channelId = headers.get("x-goog-channel-id");
  const token = headers.get("x-goog-channel-token");
  const state = headers.get("x-goog-resource-state");
  if (!channelId || !token) return { status: 400 };
  const [cal] = await db
    .select({ id: calendar.id, hash: calendar.watchTokenHash })
    .from(calendar)
    .where(and(eq(calendar.watchChannelId, channelId), isNull(calendar.deletedAt)));
  if (!cal || !cal.hash) return { status: 404 };
  if (!safeEqual(sha256(token), cal.hash)) return { status: 403 };
  if (state !== "sync") await enqueueSync(cal.id);
  return { status: 200, calendarId: cal.id };
}
