import { can } from "@rebar/core/rbac";
import { PageHeader } from "@rebar/ui";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/request";
import { ReklamaHost } from "./reklama-host";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reklama" };

/**
 * Reklamní účty (REK-B, REK-11): statická trasa předběhne generický seznam entity `ad_account` (`[...path]`), protože
 * seznam ukazuje útratu za měsíc, vlastníka účtu a stav synchronizace a má tlačítko Obnovit. Detaily `/reklama/<id>`
 * a `/reklama/kampane/<id>` zůstávají generickým záznamem entity s kartami z modulu.
 */
export default async function ReklamaPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "reklama.read")) notFound();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Reklama" }]} />
      <ReklamaHost />
    </div>
  );
}
