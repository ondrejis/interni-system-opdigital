import { FinanceSettings } from "@rebar/finance/ui";
import { requireCan } from "@/server/request";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance" };

/** Nastavení → Finance: základ salda vyrovnání (zaplacené / vystavené) a výchozí rozdělení nových zakázek. */
export default async function Page() {
  await requireCan("finance.settings");
  return <FinanceSettings />;
}
