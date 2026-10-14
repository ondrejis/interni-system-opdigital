import { z } from "zod";
import {
  defineCommand,
  defineModuleJob,
  type ModuleServer,
  type CommandDef,
} from "@rebar/core/module-server";
import { PermissionError, scopeOf } from "@rebar/core/rbac";
import {
  bulkPreview,
  listDispatches,
  prepareDispatch,
  sendBulk,
  sendDispatch,
  sendInput,
  syncDispatches,
  type RenderPdf,
} from "./service";

export { syncDispatches, listDispatches, prepareDispatch, sendDispatch, sendBulk } from "./service";
export type { DispatchRecord, BulkResult, DispatchKind } from "./service";

/** Příkazy odesílání faktur e-mailem. PDF faktury dodává volající (cyklu importů se tím vyhneme). */
export function dispatchCommands(renderPdf: RenderPdf): CommandDef[] {
  const kind = z.enum(["invoice", "reminder"]);
  return [
    defineCommand({
      name: "fakturace.mail.prepare",
      permission: "fakturace.write",
      input: z.object({ invoiceId: z.uuid(), kind, retryOf: z.uuid().optional() }),
      handler: (ctx, i, deps) => prepareDispatch(ctx, deps, i),
    }),
    defineCommand({
      name: "fakturace.mail.send",
      permission: "fakturace.write",
      input: sendInput,
      handler: (ctx, i, deps) => sendDispatch(ctx, deps, renderPdf, i),
    }),
    defineCommand({
      name: "fakturace.mail.bulk",
      permission: "fakturace.write",
      input: z.object({ invoiceIds: z.array(z.uuid()).min(1).max(50), kind }),
      handler: (ctx, i, deps) => sendBulk(ctx, deps, renderPdf, i),
    }),
    defineCommand({
      name: "fakturace.mail.bulkPreview",
      permission: "fakturace.write",
      input: z.object({ invoiceIds: z.array(z.uuid()).min(1).max(50), kind }),
      handler: (ctx, i, deps) => bulkPreview(ctx, deps, i),
    }),
    defineCommand({
      name: "fakturace.mail.list",
      permission: "fakturace.read",
      input: z.object({ invoiceId: z.uuid() }),
      handler: async (ctx, i) => {
        if (!scopeOf(ctx, "fakturace.read")) throw new PermissionError();
        return listDispatches(ctx, i.invoiceId);
      },
    }),
  ];
}

/** Každou minutu: stav odeslaných e-mailů z fronty se přenese do evidence u faktur (a při selhání upozorní autora). */
const syncJob = defineModuleJob({
  name: "fakturace.dispatch.sync",
  schema: z.object({}),
  cron: "* * * * *",
  retryLimit: 0,
  keepCompletedSeconds: 120,
  async handler(deps) {
    await syncDispatches(deps.db);
  },
});

export function dispatchArea(renderPdf: RenderPdf): ModuleServer {
  return { commands: dispatchCommands(renderPdf), jobs: [syncJob] };
}
