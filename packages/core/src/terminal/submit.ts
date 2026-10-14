import type { CommandDef, ModuleDeps } from "../modules/server";
import { NotFoundError, PermissionError } from "../rbac/errors";
import { assertCan, can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { runTerminalOp, type TerminalOpOutcome } from "./ops";
import { terminalCommandAllowed, type ResolvedTile } from "./resolve";

export type TerminalSubmitEnv = {
  /** Dlaždice, které tento uživatel v terminálu smí (`visibleTerminalTiles`). */
  tiles: readonly ResolvedTile[];
  /** Příkazy zapnutých modulů a platformy. */
  commands: ReadonlyMap<string, Pick<CommandDef, "permission" | "input" | "handler">>;
  deps: ModuleDeps;
};

/**
 * Přijme zápis z terminálu (z offline fronty). Příkaz musí patřit dlaždici, kterou uživatel v terminálu vidí (zapnutý
 * modul, oprávnění role, dlaždice nevypnutá správcem); jinak se odmítne bez ohledu na to, co zobrazuje UI. Pak platí
 * oprávnění příkazu a validace vstupu a zápis se provede nejvýš jednou podle `opId` (`runTerminalOp`).
 */
export async function submitTerminalCommand(
  ctx: Ctx,
  op: { opId: string; command: string; input: unknown },
  env: TerminalSubmitEnv,
): Promise<TerminalOpOutcome<unknown>> {
  if (!terminalCommandAllowed(env.tiles, op.command))
    throw new PermissionError("Tato akce není v terminálu povolená.");
  const cmd = env.commands.get(op.command);
  if (!cmd) throw new NotFoundError("Neznámý příkaz.");
  if (cmd.permission) {
    const keys = [cmd.permission].flat();
    if (!keys.some((k) => can(ctx, k))) assertCan(ctx, keys[0]!);
  }
  const parsed = cmd.input.parse(op.input);
  return runTerminalOp(ctx, { opId: op.opId, command: op.command }, async (c) => {
    const result = await cmd.handler(c, parsed, env.deps);
    // výsledek se ukládá jako JSON (a při opakování vrací stejný)
    return JSON.parse(JSON.stringify(result ?? null)) as unknown;
  });
}
