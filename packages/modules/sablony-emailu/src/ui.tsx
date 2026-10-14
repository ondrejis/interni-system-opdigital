"use client";

import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI modulu „sablony-emailu“. Zástupné stránky nahradí skutečné UI. */
export const ui = defineModuleUi({
  pages: [
    {
      path: "/sablony-emailu",
      render: () => <Placeholder title="Šablony e-mailů" icon="mail-template" />,
    },
  ],
});
