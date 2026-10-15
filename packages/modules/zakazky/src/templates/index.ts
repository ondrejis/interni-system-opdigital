import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import { ensureDefaultTemplates } from "./defaults";

/** Serverová oblast „templates“ modulu „zakazky“ (ZAK-A): šablony zakázek a výchozí šablony při `db:seed`. */
export const area = defineModuleServer({ commands, ensure: [ensureDefaultTemplates] });
