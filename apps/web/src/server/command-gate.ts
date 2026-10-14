import { assertCan, can } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import type { CommandDef } from "@rebar/core/module-server";

/**
 * Oprávnění příkazu modulu (stačí kterékoli z uvedených). Příkaz bez oprávnění vyžaduje jen přihlášení a data
 * pak hlídá sám handler. Samostatná funkce, aby šla otestovat pro všechny role proti registru příkazů.
 */
export function assertCommandPermission(ctx: Ctx, cmd: Pick<CommandDef, "permission">): void {
  if (!cmd.permission) return;
  const keys = [cmd.permission].flat();
  if (!keys.some((k) => can(ctx, k))) assertCan(ctx, keys[0]!);
}
