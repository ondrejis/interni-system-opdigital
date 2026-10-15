import type { CommandDef } from "@rebar/core/module-server";

/**
 * Společné příkazy modulu „kalendar“: žádné. Všechny příkazy `kalendar.*` patří do oblasti `google`
 * (`google/commands.ts`), protože kalendář je zrcadlo Google Kalendáře (D §1.2).
 */
export const commands: readonly CommandDef[] = [];
