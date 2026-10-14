import { z } from "zod";
import { consumeRateLimit } from "@rebar/core/http";
import { defineCommand } from "@rebar/core/module-server";
import { aresLookup } from "./ares";

/**
 * Doplnění firmy z ARES podle IČO. Nikdy nevyhodí chybu kvůli síti: výsledek `ok: false` nese větu pro uživatele.
 * Počet dotazů na uživatele je omezený (ochrana veřejného API i aplikace). KON doplní uložení (`apply`) a zbytek
 * příkazů z D §1.2 (`search`, `checkDuplicates`, `quickCreate`, `merge.*`); předchozí verze je v `packages/_donor/kontakty`.
 */
export const aresCommand = defineCommand({
  name: "kontakty.ares",
  permission: ["kontakty.ares", "kontakty.write", "obchody.write", "zakazky.write"],
  input: z.object({ ico: z.string().trim().min(1, "Vyplňte IČO.").max(20) }),
  handler: async (ctx, i) => {
    const key = `ares:${ctx.actor.userId ?? "system"}`;
    if (!(await consumeRateLimit(ctx.db, key, 30, 60)))
      return {
        ok: false as const,
        reason: "unavailable" as const,
        message: "Příliš mnoho dotazů na ARES. Zkuste to za chvíli.",
      };
    return aresLookup(i.ico);
  },
});

export const contactCommands = [aresCommand];
