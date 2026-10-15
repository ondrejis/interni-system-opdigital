import { TemplateEditorPage } from "@rebar/zakazky/ui";
import { requireCan } from "@/server/request";

export const dynamic = "force-dynamic";

/** Editor jedné šablony zakázky (fáze, úkoly, plánované platby). */
export default async function SablonaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCan("zakazky.read");
  const { id } = await params;
  return <TemplateEditorPage id={id} />;
}
