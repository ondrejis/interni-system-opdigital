import type { Executor } from "../db/client";
import type { Actor, Ctx } from "./types";

export function createCtx(
  db: Executor,
  actor: Actor,
  meta: { requestId?: string | undefined; ip?: string | null | undefined } = {},
): Ctx {
  return { actor, db, ...meta };
}

/** Aktér pro úlohy na pozadí: smí všechno, v auditu je vidět jako „system“. */
export const SYSTEM_ACTOR: Actor = {
  kind: "system",
  userId: null,
  roleKey: null,
  permissions: new Map(),
  unrestricted: true,
  restriction: null,
};

export function systemCtx(db: Executor, requestId?: string): Ctx {
  return { actor: SYSTEM_ACTOR, db, requestId };
}

/** Provede `fn` v transakci; `ctx.db` uvnitř je transakce (zápis i audit jsou atomické). */
export function inTx<T>(ctx: Ctx, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  return ctx.db.transaction((tx) => fn({ ...ctx, db: tx }));
}
