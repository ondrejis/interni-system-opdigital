"use client";

import { findModulePage, useModuleUi } from "@rebar/ui";

/** Najde stránku `/reklama` v UI zapnutých modulů a vykreslí ji; bez modulu „reklama“ nic. */
export function ReklamaHost() {
  const page = findModulePage(useModuleUi(), "/reklama");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {page ? (
        page.render({ rest: [], query: {} })
      ) : (
        <p className="p-6 text-muted">Stránka není k dispozici.</p>
      )}
    </div>
  );
}
