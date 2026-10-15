import { and, eq, isNull } from "drizzle-orm";
import { resolveEntity, updateRecord } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { NotFoundError, UserError, inTx } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import {
  clientOverviewInput,
  hostingMarkRenewedInput,
  hostingOverviewInput,
  hostingUndoRenewedInput,
} from "../contract";
import { selectDomains, serviceNames, toDomainRow } from "../domains/data";
import { recurringService } from "../schema";
import type { ClientHostingOverview, HostingOverview, MarkRenewedResult } from "../types";
import { companyNames, loadHostingOverview, selectServices, toServiceRow } from "./data";
import { shiftRenewal } from "./logic";

/** Souhrn hostingu a údržby a nejbližší obnovy (karty nad seznamem a panel „K obnově“). */
export const hostingOverview = defineCommand({
  name: "muj-prostor.hosting.overview",
  permission: "muj-prostor.hosting",
  input: hostingOverviewInput,
  handler: async (ctx, _input, deps): Promise<HostingOverview> =>
    loadHostingOverview(ctx, deps, todayIso()),
});

/**
 * Označí obnovu jako vyfakturovanou: další obnova se posune o období (HOST-03, R-47). Jen aktivní služba s vyplněným
 * datem. Dvojí kliknutí nebo druhé okno nic nezdvojí: příkaz nese datum, které uživatel viděl, a při neshodě skončí
 * chybou. Změna jde přes engine entity, takže je v historii před → po.
 */
export const hostingMarkRenewed = defineCommand({
  name: "muj-prostor.hosting.markRenewed",
  permission: "muj-prostor.hosting",
  input: hostingMarkRenewedInput,
  handler: async (ctx, input, deps): Promise<MarkRenewedResult> => {
    const def = deps.registry.get("recurring_service");
    if (!def) throw new UserError("Evidence hostingu není zapnutá.");
    const entity = await resolveEntity(ctx.db, def);
    return inTx(ctx, async (c) => {
      const [row] = await c.db
        .select()
        .from(recurringService)
        .where(and(eq(recurringService.id, input.id), isNull(recurringService.deletedAt)))
        .for("update");
      if (!row) throw new NotFoundError();
      if (row.status !== "active") throw new UserError("Obnovu jde označit jen u aktivní služby.");
      if (!row.nextRenewal) throw new UserError("Služba nemá vyplněné datum další obnovy.");
      if (row.nextRenewal !== input.expectedNextRenewal)
        throw new UserError(
          "Datum další obnovy se mezitím změnilo. Obnovte stránku a zkontrolujte ho.",
        );
      const next = shiftRenewal(row.nextRenewal, row.period, row.since);
      await updateRecord(c, deps.registry, entity, row.id, { nextRenewal: next });
      return { id: row.id, previous: row.nextRenewal, next };
    });
  },
});

/**
 * Vrátí poslední posun obnovy (tlačítko „Zpět“ v oznámení): jen když má služba pořád datum, na které ji posunula
 * `markRenewed`; jinak by přepsala pozdější úpravu.
 */
export const hostingUndoRenewed = defineCommand({
  name: "muj-prostor.hosting.undoRenewed",
  permission: "muj-prostor.hosting",
  input: hostingUndoRenewedInput,
  handler: async (ctx, input, deps): Promise<MarkRenewedResult> => {
    const def = deps.registry.get("recurring_service");
    if (!def) throw new UserError("Evidence hostingu není zapnutá.");
    const entity = await resolveEntity(ctx.db, def);
    return inTx(ctx, async (c) => {
      const [row] = await c.db
        .select()
        .from(recurringService)
        .where(and(eq(recurringService.id, input.id), isNull(recurringService.deletedAt)))
        .for("update");
      if (!row) throw new NotFoundError();
      if (row.nextRenewal !== input.from)
        throw new UserError("Datum obnovy se mezitím změnilo, vrácení už nejde.");
      await updateRecord(c, deps.registry, entity, row.id, { nextRenewal: input.to });
      return { id: row.id, previous: input.from, next: input.to };
    });
  },
});

/** Hosting, údržba a domény jednoho klienta pro záložku „Hosting a domény“ na kartě klienta (KLI-09). */
export const clientOverview = defineCommand({
  name: "muj-prostor.client.overview",
  permission: ["muj-prostor.hosting", "muj-prostor.domains"],
  input: clientOverviewInput,
  handler: async (ctx, input, deps): Promise<ClientHostingOverview> => {
    const today = todayIso();
    const [services, domains] = await Promise.all([
      selectServices(ctx, { companyId: input.companyId }),
      selectDomains(ctx, { companyId: input.companyId }),
    ]);
    const [names, hosting] = await Promise.all([
      companyNames(ctx, deps, [input.companyId]),
      serviceNames(
        ctx,
        domains.map((d) => d.recurringServiceId),
      ),
    ]);
    return {
      today,
      services: services.map((s) => toServiceRow(s, names, today)),
      domains: domains.map((d) => toDomainRow(d, names, hosting)),
    };
  },
});

/** Příkazy oblasti „hosting“. */
export const hostingCommands = [
  hostingOverview,
  hostingMarkRenewed,
  hostingUndoRenewed,
  clientOverview,
];
