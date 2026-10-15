import { PageHeader } from "@rebar/ui";
import { notFound } from "next/navigation";
import { can } from "@rebar/core/rbac";
import { requireCtx } from "@/server/request";
import { ObchodyHost } from "./obchody-host";

export const dynamic = "force-dynamic";
export const metadata = { title: "Obchody" };

/**
 * Obchody: board a seznam (OBC-B). Statická trasa předběhne generický seznam entity `deal` (`[...path]`), protože board
 * potřebuje zóny Vyhráno a Prohráno, hlavičky sloupců a rychlé založení; detail `/obchody/<id>` zůstává generický.
 */
export default async function ObchodyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCtx();
  if (!can(ctx, "obchody.read")) notFound();
  const sp = await searchParams;
  const query = Object.fromEntries(
    Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Obchody" }]} />
      <ObchodyHost query={query} />
    </div>
  );
}
