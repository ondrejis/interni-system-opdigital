"use client";

import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI modulu „hodiny“. Zástupné stránky nahradí skutečné UI. */
export const ui = defineModuleUi({
  pages: [{ path: "/hodiny", render: () => <Placeholder title="Hodiny" icon="clock" /> }],
});
