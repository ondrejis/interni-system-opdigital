import { defineExtension } from "@rebar/core";

/** Příklad háčku: reakce na vytvoření zakázky. Smaž nebo nahraď vlastním rozšířením. */
export const exampleExtension = defineExtension({
  id: "example",
  on: {
    "zakazky.created": async ({ id }) => {
      console.info(`[example] vznikla zakázka ${id}`);
    },
  },
});
