import { defineModuleServer } from "@rebar/core/module-server";
import { todayCommand } from "./today";

/** Serverová část oblasti CRM „today“ (Moje dnešní práce, viz docs/CRM.md): příkaz `crm.today`. */
export const area = defineModuleServer({ commands: [todayCommand] });
export { todayCommand };
