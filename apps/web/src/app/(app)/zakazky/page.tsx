import { JobsPage, type JobsView } from "@rebar/zakazky/ui";
import { requireCan } from "@/server/request";

export const dynamic = "force-dynamic";

const VIEWS: JobsView[] = ["seznam", "stav", "tabulka"];

/** Zakázky: seznam, board podle stavu a plná tabulka (board podle fází je na `/zakazky/faze`). Má přednost před obecným seznamem entit. */
export default async function ZakazkyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCan("zakazky.read");
  const sp = await searchParams;
  const pohled = VIEWS.find((v) => v === sp.pohled) ?? "seznam";
  return <JobsPage view={pohled} openCreate={sp.novy === "1"} />;
}
