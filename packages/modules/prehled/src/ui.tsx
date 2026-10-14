"use client";

import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI modulu „prehled“. Zástupné stránky nahradí skutečné UI. */
export const ui = defineModuleUi({
  pages: [
    { path: "/prehled", render: () => <Placeholder title="Přehled" icon="layout-dashboard" /> },
  ],
});
