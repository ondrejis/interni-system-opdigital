import type { PrivatePathDef } from "@rebar/core/module-server";
import { privateScope } from "@rebar/core/entities";
import { and, isNull } from "drizzle-orm";
import { company } from "@rebar/kontakty/schema";
import { clientSummary, clientTabs, listClients } from "./data";

/**
 * Ruční čtecí cesty modulu pro canary test soukromí (D §5.4): seznam, souhrn a počty záložek. Test je spustí jako
 * Partner i jako vlastník nad sestavou se soukromými záznamy a hledá canary řetězec v odpovědi.
 */
export const privatePaths: readonly PrivatePathDef[] = [
  { name: "klienti.list", run: (ctx, deps) => listClients(ctx, deps, { includeFormer: true }) },
  {
    name: "klienti.summary+tabCounts",
    run: async (ctx, deps) => {
      const ids = (
        await ctx.db
          .select({ id: company.id })
          .from(company)
          .where(and(isNull(company.deletedAt), privateScope(ctx, company)))
          .limit(50)
      ).map((r) => r.id);
      return Promise.all(
        ids.flatMap((id) => [clientSummary(ctx, deps, id), clientTabs(ctx, deps, id)]),
      );
    },
  },
];
