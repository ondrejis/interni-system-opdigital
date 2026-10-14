import { eq, lt } from "drizzle-orm";
import { schema } from "../db/client";
import { inTx } from "../rbac/context";
import { PermissionError, UserError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";

/** Jak dlouho se pamatují odeslané zápisy pro ochranu proti dvojímu odeslání (fronta nedrží zápis déle než pár dní). */
export const TERMINAL_OP_RETENTION_DAYS = 60;

export type TerminalOpOutcome<T> = { duplicate: boolean; result: T };

/**
 * Provede zápis z terminálu nejvýš jednou. `opId` vytváří zařízení při zápisu a při opakování posílá stejné.
 * V jedné transakci se zapíše řádek `terminal_op` a provede se `run`:
 * - poprvé: `run` proběhne, výsledek se uloží a vrátí s `duplicate: false`;
 * - podruhé (opakování po výpadku, dvojí ťuknutí, souběh): `run` se nespustí a vrátí se původní výsledek s `duplicate: true`;
 * - selže-li `run`, transakce se vrátí i s řádkem a zápis jde bezpečně zkusit znovu.
 * Souběžné odeslání téhož `opId` počká na první transakci (jedinečný klíč), takže vznikne nejvýš jeden zápis.
 * Cizí `opId` (jiného uživatele) nebo jiný příkaz pod stejným `opId` se odmítne.
 */
export async function runTerminalOp<T>(
  ctx: Ctx,
  op: { opId: string; command: string },
  run: (ctx: Ctx) => Promise<T>,
): Promise<TerminalOpOutcome<T>> {
  const userId = ctx.actor.userId;
  if (!userId) throw new PermissionError();
  const outcome = await inTx(ctx, async (c) => {
    const inserted = await c.db
      .insert(schema.terminalOp)
      .values({ id: op.opId, userId, command: op.command })
      .onConflictDoNothing()
      .returning({ id: schema.terminalOp.id });
    if (inserted.length === 0) {
      const [prev] = await c.db
        .select()
        .from(schema.terminalOp)
        .where(eq(schema.terminalOp.id, op.opId));
      if (!prev || prev.userId !== userId || prev.command !== op.command)
        throw new UserError("Tento zápis už patří jiné akci. Zkuste ho prosím odeslat znovu.");
      return { duplicate: true, result: (prev.result ?? null) as T };
    }
    const result = await run(c);
    await c.db
      .update(schema.terminalOp)
      .set({ result: (result ?? null) as never })
      .where(eq(schema.terminalOp.id, op.opId));
    return { duplicate: false, result };
  });
  // úklid starých řádků: příležitostně, ať nevzniká samostatná úloha
  if (Math.random() < 0.02) await purgeTerminalOps(ctx).catch(() => undefined);
  return outcome;
}

/** Smaže řádky starší než doba uchování (jen vlastní aplikace, neovlivní žádný zápis). */
export async function purgeTerminalOps(ctx: Ctx, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - TERMINAL_OP_RETENTION_DAYS * 86_400_000);
  await ctx.db.delete(schema.terminalOp).where(lt(schema.terminalOp.createdAt, cutoff));
}
