"use client";

import { findModulePage, PageHeader, useModuleUi } from "@rebar/ui";

/** Najde stránku modulu podle adresy v UI registru zapnutých modulů a vykreslí ji pod záhlavím. */
export function ModulePageHost({
  path,
  title,
  rest,
  query,
}: {
  path: string;
  title: string;
  rest: string[];
  query: Record<string, string>;
}) {
  const page = findModulePage(useModuleUi(), path);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: title }]} />
      <div className="flex min-h-0 flex-1 flex-col">
        {page ? (
          page.render({ rest, query })
        ) : (
          <p className="p-6 text-muted">Stránka není k dispozici.</p>
        )}
      </div>
    </div>
  );
}
