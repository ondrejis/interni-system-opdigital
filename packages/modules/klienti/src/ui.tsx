"use client";

import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI modulu „klienti“. Zástupné stránky nahradí skutečné UI. */
export const ui = defineModuleUi({
  pages: [{ path: "/klienti", render: () => <Placeholder title="Klienti" icon="handshake" /> }],
});
