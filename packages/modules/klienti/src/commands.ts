import { defineCommand, type CommandDef } from "@rebar/core/module-server";
import {
  clientRefInput,
  listInput,
  saveContextInput,
  setServicesInput,
  setStatusInput,
} from "./contract";
import { clientSummary, clientTabs, listClients, saveContext, setServices } from "./data";
import { setClientStatus } from "./service";

/** Seznam klientů (KLI-03): výchozí lead, aktivní a pozastavení; sloupce z příspěvků modulů. */
export const listCommand = defineCommand({
  name: "klienti.list",
  permission: "klienti.read",
  input: listInput,
  handler: (ctx, i, deps) => listClients(ctx, deps, i),
});

/** Změna stavu klienta (KLI-02): Bývalý vyžaduje důvod, „klient od“ se uloží při prvním přechodu na Aktivní. */
export const setStatusCommand = defineCommand({
  name: "klienti.setStatus",
  permission: "klienti.write",
  input: setStatusInput,
  handler: (ctx, i, deps) =>
    setClientStatus(
      ctx,
      deps,
      {
        companyId: i.companyId,
        status: i.status,
        ...(i.reason ? { reason: i.reason } : {}),
        ...(i.endedOn ? { endedOn: i.endedOn } : {}),
        source: "manual",
      },
      { strict: true },
    ),
});

/** Úplný seznam služeb klienta. */
export const setServicesCommand = defineCommand({
  name: "klienti.setServices",
  permission: "klienti.write",
  input: setServicesInput,
  handler: (ctx, i, deps) => setServices(ctx, deps, i.companyId, i.services),
});

/** Uloží pole kontextu klienta (KLI-06; autosave po jednom poli). */
export const saveContextCommand = defineCommand({
  name: "klienti.saveContext",
  permission: "klienti.write",
  input: saveContextInput,
  handler: (ctx, i) => saveContext(ctx, i),
});

/** Souhrn karty klienta (KLI-05, KLI-10). */
export const summaryCommand = defineCommand({
  name: "klienti.summary",
  permission: "klienti.read",
  input: clientRefInput,
  handler: (ctx, i, deps) => clientSummary(ctx, deps, i.companyId),
});

/** Počty záložek karty a záložky bez dat (KLI-07, ORG-08). */
export const tabCountsCommand = defineCommand({
  name: "klienti.tabCounts",
  permission: "klienti.read",
  input: clientRefInput,
  handler: (ctx, i, deps) => clientTabs(ctx, deps, i.companyId),
});

/** Příkazy modulu „klienti“ (každý potřebuje probe v `tests/support/probes/klienti.ts`). */
export const commands: readonly CommandDef[] = [
  listCommand,
  setStatusCommand,
  setServicesCommand,
  saveContextCommand,
  summaryCommand,
  tabCountsCommand,
];
