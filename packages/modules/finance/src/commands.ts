import type { CommandDef } from "@rebar/core/module-server";
import { dataCommands } from "./data/commands";

/** Příkazy modulu „finance“ (název `finance.<akce>`; každý potřebuje probe v `tests/support/probes/finance.ts`). */
export const commands: readonly CommandDef[] = dataCommands;
