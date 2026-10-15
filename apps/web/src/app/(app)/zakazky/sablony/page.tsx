import { TemplatesPage } from "@rebar/zakazky/ui";
import { requireCan } from "@/server/request";

export const dynamic = "force-dynamic";

/** Nastavení → Šablony zakázek (seznam). Má přednost před obecným seznamem entity `job_template`. */
export default async function SablonyPage() {
  await requireCan("zakazky.read");
  return <TemplatesPage />;
}
