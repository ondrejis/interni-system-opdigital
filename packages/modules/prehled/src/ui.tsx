"use client";

import { Placeholder, defineModuleUi } from "@rebar/ui";

/**
 * UI modulu „prehled“. Skutečnou stránku `/prehled` vykresluje statická trasa aplikace
 * (`apps/web/src/app/(app)/prehled`), protože potřebuje server actions nástěnek, které modul nezná; trasa předběhne
 * obecný host stránek modulu, takže tato zástupná stránka se nikdy neukáže (test `tests/modules.test.ts` ji vyžaduje
 * ke každé stránce z manifestu).
 */
export const ui = defineModuleUi({
  pages: [
    { path: "/prehled", render: () => <Placeholder title="Přehled" icon="layout-dashboard" /> },
  ],
});
