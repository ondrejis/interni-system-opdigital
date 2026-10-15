import { UserError } from "@rebar/core/rbac";
import { defineCommand, type CommandDef } from "@rebar/core/module-server";
import {
  emptyInput,
  enabledSetInput,
  folderRefInput,
  requestFolderInput,
  structureSetInput,
} from "./contract";
import { folderInfo, requestFolder, retryFolder } from "./service";
import { diskStatus, diskTest } from "./status";
import {
  driveEnabledSetting,
  driveStructureSetting,
  isDriveEnabled,
  loadStructure,
} from "./settings";
import { validateStructure } from "./tree";

/** Stav složky klienta nebo zakázky pro tlačítko „Otevřít Disk“ (DRV-05). */
export const folderStateCommand = defineCommand({
  name: "disk.folderState",
  permission: "disk.read",
  input: folderRefInput,
  handler: (ctx, i, deps) => folderInfo(ctx, deps, i.entityType, i.id),
});

/** Ruční „Vytvořit složku“; u soukromého záznamu až s potvrzeným varováním (`force`). */
export const requestFolderCommand = defineCommand({
  name: "disk.requestFolder",
  permission: "disk.write",
  input: requestFolderInput,
  handler: (ctx, i, deps) => requestFolder(ctx, deps, i),
});

/** „Zkusit znovu“ po chybě nebo po 10 minutách bez odpovědi n8n. */
export const retryCommand = defineCommand({
  name: "disk.retry",
  permission: "disk.write",
  input: folderRefInput,
  handler: (ctx, i, deps) => retryFolder(ctx, deps, i),
});

/** Strom složek z Nastavení a zda je zakládání zapnuté. */
export const structureGetCommand = defineCommand({
  name: "disk.structure.get",
  permission: "disk.manage",
  input: emptyInput,
  handler: async (ctx, _i, deps) => ({
    ...(await loadStructure(deps.settings, ctx.db)),
    enabled: await isDriveEnabled(deps.settings, ctx.db),
  }),
});

/** Uloží strom složek; platí jen pro nově zakládané složky (už založené se nemění). */
export const structureSetCommand = defineCommand({
  name: "disk.structure.set",
  permission: "disk.manage",
  input: structureSetInput,
  handler: async (ctx, i, deps) => {
    const problems = validateStructure(i.structure);
    if (problems.length) throw new UserError(problems.slice(0, 3).join(" "));
    await deps.settings.set(ctx, driveStructureSetting, { structure: i.structure });
    return { ok: true as const };
  },
});

/** Zapne nebo vypne zakládání složek. */
export const enabledSetCommand = defineCommand({
  name: "disk.enabled.set",
  permission: "disk.manage",
  input: enabledSetInput,
  handler: async (ctx, i, deps) => {
    await deps.settings.set(ctx, driveEnabledSetting, { enabled: i.enabled });
    return { ok: true as const };
  },
});

/** Stav napojení na n8n a poslední požadavky (Nastavení → Google Disk). */
export const statusCommand = defineCommand({
  name: "disk.status",
  permission: "disk.manage",
  input: emptyInput,
  handler: (ctx, _i, deps) => diskStatus(ctx, deps),
});

/** Test napojení: kontroly nastavení a posledních výsledků (nic nezakládá). */
export const testCommand = defineCommand({
  name: "disk.test",
  permission: "disk.manage",
  input: emptyInput,
  handler: (ctx, _i, deps) => diskTest(ctx, deps),
});

/** Příkazy modulu „disk“ (každý má probe v `tests/support/probes/disk.ts`). */
export const commands: readonly CommandDef[] = [
  folderStateCommand,
  requestFolderCommand,
  retryCommand,
  structureGetCommand,
  structureSetCommand,
  enabledSetCommand,
  statusCommand,
  testCommand,
] as readonly CommandDef[];
