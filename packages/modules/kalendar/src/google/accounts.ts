import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { schema } from "@rebar/core/db";
import { inTx, NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import type { AccessRole, AccountDto, CalendarDto } from "../contract";
import { calendar, calendarAccount, calendarEvent } from "../schema";
import {
  GoogleAuthError,
  type GoogleCalendarClient,
  type GoogleCalendarInfo,
  type GoogleTokens,
} from "./client";
import { googleClient, redirectUri, type KalEnv } from "./env";

/*
  Propojení Google účtu uživatele: OAuth (souhlas, návrat), tokeny šifrovaně v `calendar_account.tokens_enc`
  (AES-256-GCM přes core `cipher`; nikdy v otevřené podobě, ani v logu a auditu), obnova přístupového tokenu,
  seznam kalendářů a odpojení.
*/

/** Řádek propojeného Google účtu. */
export type AccountRow = typeof calendarAccount.$inferSelect;
/** Řádek kalendáře z Google účtu. */
export type CalendarRow = typeof calendar.$inferSelect;

type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
};

const STATE_TTL_MS = 10 * 60_000;

/** Zašifruje tokeny do podoby pro `tokens_enc`. */
export const sealTokens = (cipher: KalEnv["cipher"], t: StoredTokens) =>
  cipher.encrypt(JSON.stringify(t));

/** Dešifruje `tokens_enc`; `null` při poškození nebo jiném klíči. */
export function openTokens(cipher: KalEnv["cipher"], enc: string): StoredTokens | null {
  const plain = cipher.decrypt(enc);
  if (!plain) return null;
  try {
    const t = JSON.parse(plain) as StoredTokens;
    return t.accessToken && t.refreshToken ? t : null;
  } catch {
    return null;
  }
}

/** Stav návratu z OAuth: zašifrovaný (a tím podepsaný) uživatel, nonce, platnost a cesta návratu. */
export function sealState(cipher: KalEnv["cipher"], userId: string, returnTo: string): string {
  return cipher.encrypt(
    JSON.stringify({
      u: userId,
      n: randomBytes(8).toString("hex"),
      e: Date.now() + STATE_TTL_MS,
      r: returnTo,
    }),
  );
}

/** Ověří `state` z návratu: platnost a že patří přihlášenému uživateli. */
export function openState(
  cipher: KalEnv["cipher"],
  state: string,
  userId: string,
  now = Date.now(),
): { returnTo: string } {
  const plain = cipher.decrypt(state);
  type State = { u?: string; e?: number; r?: string };
  const parse = (): State | null => {
    try {
      return plain ? (JSON.parse(plain) as State) : null;
    } catch {
      return null;
    }
  };
  const s = parse();
  if (!s || s.u !== userId || !s.e || s.e < now)
    throw new UserError("Propojení vypršelo nebo nepatří k vašemu účtu. Zkuste to znovu.");
  return { returnTo: s.r ?? "/nastaveni/google-kalendar" };
}

/** Můj živý (nesmazaný) účet, nebo `null`. */
export async function myAccount(ctx: Ctx, userId = ctx.actor.userId): Promise<AccountRow | null> {
  if (!userId) return null;
  const [a] = await ctx.db
    .select()
    .from(calendarAccount)
    .where(and(eq(calendarAccount.userId, userId), isNull(calendarAccount.deletedAt)));
  return a ?? null;
}

/** Přístupový token účtu; obnoví ho, když vyprší (do minuty). Odvolaný souhlas = stav `reauth`. */
export async function accessTokenFor(
  ctx: Ctx,
  env: KalEnv,
  client: GoogleCalendarClient,
  account: AccountRow,
  opts: { force?: boolean } = {},
): Promise<string> {
  const tokens = openTokens(env.cipher, account.tokensEnc);
  if (!tokens) {
    await markAccount(
      ctx,
      account.id,
      "reauth",
      "Uložený přístup nejde přečíst, připojte účet znovu.",
    );
    throw new GoogleAuthError("Uložený přístup nejde přečíst.");
  }
  if (!opts.force && tokens.expiresAt - 60_000 > Date.now()) return tokens.accessToken;
  let fresh: GoogleTokens;
  try {
    fresh = await client.refresh(tokens.refreshToken);
  } catch (e) {
    if (e instanceof GoogleAuthError)
      await markAccount(
        ctx,
        account.id,
        "reauth",
        "Souhlas Google účtu už neplatí, připojte ho znovu.",
      );
    throw e;
  }
  const next: StoredTokens = {
    accessToken: fresh.accessToken,
    refreshToken: fresh.refreshToken ?? tokens.refreshToken,
    expiresAt: fresh.expiresAt,
    ...(fresh.scope ? { scope: fresh.scope } : {}),
  };
  await ctx.db
    .update(calendarAccount)
    .set({ tokensEnc: sealTokens(env.cipher, next) })
    .where(eq(calendarAccount.id, account.id));
  account.tokensEnc = sealTokens(env.cipher, next);
  return fresh.accessToken;
}

/** Spustí `fn` s platným tokenem; po 401 token jednou vynuceně obnoví a zkusí znovu. */
export async function withToken<T>(
  ctx: Ctx,
  env: KalEnv,
  client: GoogleCalendarClient,
  account: AccountRow,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const token = await accessTokenFor(ctx, env, client, account);
  try {
    return await fn(token);
  } catch (e) {
    if (e instanceof GoogleAuthError && e.status === 401)
      return fn(await accessTokenFor(ctx, env, client, account, { force: true }));
    throw e;
  }
}

/** Změní stav účtu (a text poslední chyby); `ok` chybu smaže. */
export async function markAccount(
  ctx: Ctx,
  accountId: string,
  status: AccountRow["status"],
  error: string | null,
): Promise<void> {
  await ctx.db
    .update(calendarAccount)
    .set({ status, lastError: status === "ok" ? null : error })
    .where(eq(calendarAccount.id, accountId));
}

const ROLE_WRITE = new Set<AccessRole>(["owner", "writer"]);

/** Řádek kalendáře pro UI. */
export function calendarDto(c: CalendarRow): CalendarDto {
  return {
    id: c.id,
    googleId: c.googleId,
    name: c.name,
    color: c.color,
    visible: c.visible,
    isWriteTarget: c.isWriteTarget,
    isPrimary: c.isPrimary,
    accessRole: c.accessRole,
    canWrite: ROLE_WRITE.has(c.accessRole),
    push: !!c.watchChannelId && !!c.watchExpiresAt && c.watchExpiresAt > new Date(),
    lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
    lastError: c.lastError,
  };
}

/** Účet i s kalendáři pro UI. */
export async function accountDto(ctx: Ctx, account: AccountRow): Promise<AccountDto> {
  const cals = await ctx.db
    .select()
    .from(calendar)
    .where(and(eq(calendar.accountId, account.id), isNull(calendar.deletedAt)))
    .orderBy(sql`${calendar.isPrimary} desc`, calendar.name);
  return {
    id: account.id,
    userId: account.userId,
    googleEmail: account.googleEmail,
    status: account.status,
    lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
    lastError: account.lastError,
    calendars: cals.map(calendarDto),
  };
}

/** Adresa souhlasu Googlu pro přihlášeného uživatele. */
export async function startConnect(
  ctx: Ctx,
  env: KalEnv,
  returnTo = "/nastaveni/google-kalendar",
): Promise<{ url: string }> {
  const userId = ctx.actor.userId;
  if (!userId) throw new UserError("Kalendář si připojí jen přihlášený uživatel.");
  const client = await googleClient(ctx.db, env);
  const [u] = await ctx.db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  return {
    url: client.authUrl({
      state: sealState(env.cipher, userId, returnTo),
      redirectUri: redirectUri(env),
      ...(u?.email ? { loginHint: u.email } : {}),
    }),
  };
}

/** Přepíše seznam kalendářů účtu podle Googlu (nové přidá, zmizelé smaže, existujícím obnoví název, barvu a roli). */
export async function syncCalendarList(
  ctx: Ctx,
  account: AccountRow,
  infos: GoogleCalendarInfo[],
  opts: { firstTime?: boolean } = {},
): Promise<CalendarRow[]> {
  const existing = await ctx.db
    .select()
    .from(calendar)
    .where(and(eq(calendar.accountId, account.id), isNull(calendar.deletedAt)));
  const byGoogle = new Map(existing.map((c) => [c.googleId, c]));
  const hasTarget = existing.some((c) => c.isWriteTarget);
  let targetAssigned = hasTarget;
  for (const i of infos) {
    const found = byGoogle.get(i.id);
    const base = {
      name: i.summary,
      color: i.backgroundColor ?? null,
      accessRole: i.accessRole,
      isPrimary: !!i.primary,
      timeZone: i.timeZone ?? null,
    };
    if (found) {
      await ctx.db.update(calendar).set(base).where(eq(calendar.id, found.id));
    } else {
      const writable = i.accessRole === "owner" || i.accessRole === "writer";
      const makeTarget = !targetAssigned && !!i.primary && writable;
      if (makeTarget) targetAssigned = true;
      await ctx.db.insert(calendar).values({
        accountId: account.id,
        googleId: i.id,
        ...base,
        // zobrazený je jen primární kalendář; ostatní si uživatel vybere (nechceme svátky a narozeniny hned)
        visible: !!i.primary,
        isWriteTarget: makeTarget,
        createdBy: account.userId,
      });
    }
  }
  const gone = existing.filter((c) => !infos.some((i) => i.id === c.googleId));
  for (const c of gone) {
    await ctx.db.delete(calendarEvent).where(eq(calendarEvent.calendarId, c.id));
    await ctx.db
      .update(calendar)
      .set({
        deletedAt: new Date(),
        visible: false,
        isWriteTarget: false,
        syncToken: null,
        watchChannelId: null,
      })
      .where(eq(calendar.id, c.id));
  }
  void opts;
  return ctx.db
    .select()
    .from(calendar)
    .where(and(eq(calendar.accountId, account.id), isNull(calendar.deletedAt)));
}

/** Uloží účet po návratu ze souhlasu (nový, nebo nahradí tokeny existujícího). */
export async function saveAccountFromConsent(
  ctx: Ctx,
  env: KalEnv,
  client: GoogleCalendarClient,
  userId: string,
  tokens: GoogleTokens,
): Promise<{ account: AccountRow; calendars: CalendarRow[] }> {
  if (!tokens.refreshToken)
    throw new UserError(
      "Google nevrátil trvalý přístup. Odeberte aplikaci v účtu Google a připojte znovu.",
    );
  const infos = await client.listCalendars(tokens.accessToken);
  const primary = infos.find((i) => i.primary) ?? infos[0];
  if (!primary) throw new UserError("V Google účtu není žádný kalendář.");
  const enc = sealTokens(env.cipher, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    ...(tokens.scope ? { scope: tokens.scope } : {}),
  });
  const account = await inTx(ctx, async (c) => {
    const existing = await myAccount(c, userId);
    let row: AccountRow;
    if (existing) {
      [row] = (await c.db
        .update(calendarAccount)
        .set({ googleEmail: primary.id, tokensEnc: enc, status: "ok", lastError: null })
        .where(eq(calendarAccount.id, existing.id))
        .returning()) as [AccountRow];
    } else {
      [row] = (await c.db
        .insert(calendarAccount)
        .values({ userId, googleEmail: primary.id, tokensEnc: enc, createdBy: userId })
        .returning()) as [AccountRow];
    }
    await recordAudit(c, {
      action: existing ? "update" : "create",
      entityType: "calendar_account",
      entityId: row.id,
      entityTitle: primary.id,
      category: "integration",
      summary: `Připojen Google Kalendář (${primary.id})`,
    });
    return row;
  });
  const calendars = await syncCalendarList(ctx, account, infos);
  return { account, calendars };
}

/** Odpojí účet: odvolá token, zastaví push kanály, smaže zrcadlo událostí, kalendáře a tokeny. Události v Googlu zůstanou. */
export async function disconnectAccount(ctx: Ctx, env: KalEnv): Promise<{ ok: true }> {
  const account = await myAccount(ctx);
  if (!account) throw new NotFoundError();
  const cals = await ctx.db.select().from(calendar).where(eq(calendar.accountId, account.id));
  const client: GoogleCalendarClient | null = await googleClient(ctx.db, env).catch(() => null);
  if (client) {
    try {
      const token = await accessTokenFor(ctx, env, client, account);
      for (const c of cals)
        if (c.watchChannelId && c.watchResourceId)
          await client.stopChannel(token, { id: c.watchChannelId, resourceId: c.watchResourceId });
    } catch {
      // kanály po vypršení zaniknou sami; odpojení nesmí záviset na dostupnosti Googlu
    }
    const tokens = openTokens(env.cipher, account.tokensEnc);
    if (tokens) await client.revoke(tokens.refreshToken);
  }
  await inTx(ctx, async (c) => {
    for (const cal of cals)
      await c.db.delete(calendarEvent).where(eq(calendarEvent.calendarId, cal.id));
    await c.db
      .update(calendar)
      .set({
        deletedAt: new Date(),
        visible: false,
        isWriteTarget: false,
        syncToken: null,
        watchChannelId: null,
        watchResourceId: null,
        watchTokenHash: null,
      })
      .where(eq(calendar.accountId, account.id));
    await c.db
      .update(calendarAccount)
      .set({ deletedAt: new Date(), tokensEnc: "revoked" })
      .where(eq(calendarAccount.id, account.id));
    await recordAudit(c, {
      action: "delete",
      entityType: "calendar_account",
      entityId: account.id,
      entityTitle: account.googleEmail,
      category: "integration",
      summary: `Odpojen Google Kalendář (${account.googleEmail})`,
    });
  });
  return { ok: true };
}
