import { z } from "zod";
import { defineModuleJob, defineModuleServer } from "@rebar/core/module-server";
import { can, sourceCtx, type Ctx } from "@rebar/core/rbac";
import { invoicesCommands } from "./commands";
import {
  countOpenInvoices,
  loadInvoicesOverview,
  prepareInvoiceDrafts,
  reconcileInvoicePayments,
} from "./data";

/** Čtecí cesta pro canary test: bez oprávnění vrátí prázdný výsledek. */
const guarded = async <T>(ctx: Ctx, fn: () => Promise<T>): Promise<T | null> =>
  can(ctx, "muj-prostor.recurring_invoices") ? fn() : null;

/**
 * Serverová oblast „invoices“ modulu „muj-prostor“ (MPR-3, v3): návrhy opakovaných faktur, schválení a vytvoření ve
 * Fakturoidu, platba vlastníkovi přes službu `finance`, denní úloha „připrav návrhy“ (bez e-mailů a notifikací, návrh je
 * vidět v UI a v odznaku) a odznak u položky menu. Zapojuje ji `server.ts` přes `mergeServers`.
 */
export const area = defineModuleServer({
  commands: invoicesCommands,
  jobs: [
    defineModuleJob({
      name: "muj-prostor.invoices.prepare",
      schema: z.object({}),
      cron: "30 5 * * *",
      retryLimit: 2,
      async handler(deps) {
        const ctx = sourceCtx(deps.db, "job", "Příprava návrhů faktur");
        await prepareInvoiceDrafts(ctx, deps);
        await reconcileInvoicePayments(ctx, deps);
      },
    }),
  ],
  navBadges: [
    { href: "/muj-prostor/faktury", tone: "warning", count: (ctx) => countOpenInvoices(ctx) },
  ],
  privatePaths: [
    {
      name: "muj-prostor.invoices.overview",
      run: (ctx, deps) => guarded(ctx, () => loadInvoicesOverview(ctx, deps)),
    },
    { name: "muj-prostor.invoices.navBadge", run: (ctx) => countOpenInvoices(ctx) },
  ],
});

export { prepareInvoiceDrafts, approveInvoice } from "./data";
