import { defineModuleUi } from "@rebar/ui";
import { TodayPage } from "./today-page";

/** UI oblasti CRM „today“ (viz docs/CRM.md): stránka „Moje dnešní práce“ na `/crm/dnes`. */
export const areaUi = defineModuleUi({
  pages: [{ path: "/crm/dnes", render: () => <TodayPage /> }],
});
