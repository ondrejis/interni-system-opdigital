import { assertEntityAccess } from "@rebar/core/entities";
import { PermissionError, scopeOf } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";

/** Čtení peněz zakázky: přístup k zakázce + `zakazky.economics`. Montér a mistr ceny nikdy nedostanou. */
export async function readMoney(ctx: Ctx, jobId: string) {
  await assertEntityAccess(ctx, "job", jobId, "read");
  if (!scopeOf(ctx, "zakazky.economics")) throw new PermissionError();
}

/** Zápis nákladů, objednávek a párování: přístup k zakázce + `zakazky.budget`. */
export async function writeCosts(ctx: Ctx, jobId: string) {
  await assertEntityAccess(ctx, "job", jobId, "read");
  if (!scopeOf(ctx, "zakazky.budget")) throw new PermissionError();
}
