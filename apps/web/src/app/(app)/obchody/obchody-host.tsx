"use client";

import { findModulePage, useModuleUi } from "@rebar/ui";

/** Najde stránku `/obchody` v UI zapnutých modulů a vykreslí ji; bez modulu „obchody“ nic. */
export function ObchodyHost({ query }: { query: Record<string, string> }) {
  const page = findModulePage(useModuleUi(), "/obchody");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {page ? page.render({ rest: [], query }) : <p className="p-6 text-muted">Stránka není k dispozici.</p>}
    </div>
  );
}
