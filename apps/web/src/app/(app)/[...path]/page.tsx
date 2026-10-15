import { describeEntity, resolveEntity } from "@rebar/core/entities";
import { scopeOf } from "@rebar/core/rbac";
import { PageHeader } from "@rebar/ui";
import { notFound, redirect } from "next/navigation";
import { can } from "@rebar/core/rbac";
import { requireCtx } from "@/server/request";
import { getServices } from "@/server/services";
import { EntityListPage } from "./entity-list-page";
import { ModulePageHost } from "./module-page-host";
import { RecordPage } from "./record-page";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Seznamy a detaily všech entit z registru: `/zakazky` je seznam, `/zakazky/<id>` detail.
 * Adresy určují entity samy (`listPath`), takže nový modul nepotřebuje vlastní stránky.
 */
export default async function EntityRoute({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path } = await params;
  const sp = await searchParams;
  const ctx = await requireCtx();
  const { registry, db, runtime } = getServices();

  const last = path[path.length - 1]!;
  const isRecord = path.length > 1 && UUID.test(last);
  const listPath = "/" + (isRecord ? path.slice(0, -1) : path).join("/");
  const def = registry.all().find((e) => e.listPath === listPath);

  // Entita má přednost (`/realizace/vady`); co entitě nepatří, může být stránka modulu (`/realizace`, `/poptavky/prijem`).
  if (!def) {
    const full = "/" + path.join("/");
    const hit = runtime.modules
      .flatMap((m) => m.pages ?? [])
      .filter((pg) => full === pg.path || full.startsWith(pg.path + "/"))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (hit) {
      if (hit.permission && ![hit.permission].flat().some((k) => can(ctx, k))) notFound();
      const query = Object.fromEntries(
        Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
      );
      return (
        <ModulePageHost
          path={hit.path}
          title={hit.title}
          rest={full.slice(hit.path.length).split("/").filter(Boolean)}
          query={query}
        />
      );
    }
  }
  // Kořen sekce bez vlastní stránky (`/muj-prostor`): přesměruje na první položku navigace modulu, kterou aktér smí otevřít.
  if (!def && path.length === 1) {
    const first = runtime.modules
      .flatMap((m) => m.nav)
      .filter((n) => n.href.startsWith(`/${path[0]}/`))
      .filter((n) => n.permission === undefined || [n.permission].flat().some((k) => can(ctx, k)))
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))[0];
    if (first) redirect(`/${first.href.replace(/^\/+/, "")}`); // pevná adresa z manifestu modulu
  }
  if (!def || !scopeOf(ctx, def.permissions.read)) notFound();

  const descriptor = await describeEntity(ctx, db, await resolveEntity(db, def), registry);

  if (isRecord)
    return (
      <RecordPage
        entity={descriptor}
        id={last}
        initialTab={typeof sp.tab === "string" ? sp.tab : undefined}
        initialSub={typeof sp.sub === "string" ? sp.sub : undefined}
      />
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: descriptor.label.many }]} />
      <EntityListPage
        entity={descriptor}
        {...(typeof sp.pohled === "string" ? { viewId: sp.pohled } : {})}
        openCreate={sp.novy === "1"}
        {...(typeof sp.exportTemplate === "string" ? { exportTemplate: sp.exportTemplate } : {})}
      />
    </div>
  );
}
