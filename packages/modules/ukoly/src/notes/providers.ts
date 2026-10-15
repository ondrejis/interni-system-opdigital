import type { ClientTabProvider } from "@rebar/core/contracts";
import type { PrivatePathDef } from "@rebar/core/module-server";
import { note } from "../schema/notes";
import { listNotes, noteCountForCompany, visibleNotes } from "./queries";
import { and, isNotNull } from "drizzle-orm";

/** Příspěvek ke kartě klienta: počet poznámek organizace (záložka „Poznámky“, KLI-07); soukromé jen pro vlastníka. */
export const noteClientCard: ClientTabProvider = {
  async tabCounts(ctx, companyId) {
    return { poznamky: await noteCountForCompany(ctx, companyId) };
  },
};

/** Ruční čtecí cesty poznámek pro canary test soukromí (D §5.4). */
export const notePrivatePaths: PrivatePathDef[] = [
  {
    name: "ukoly.notes.list",
    run: (ctx, deps) => listNotes(ctx, deps, { standalone: true, limit: 50 }),
  },
  {
    name: "ukoly.notes.clientCard",
    run: async (ctx) => {
      const [c] = await ctx.db
        .select({ id: note.companyId })
        .from(note)
        .where(and(isNotNull(note.companyId), visibleNotes(ctx)))
        .limit(1);
      return c?.id ? noteClientCard.tabCounts!(ctx, c.id) : null;
    },
  },
  {
    name: "ukoly.notes.search",
    run: (ctx, deps) => listNotes(ctx, deps, { q: "PRIVATE-CANARY", limit: 50 }),
  },
];
