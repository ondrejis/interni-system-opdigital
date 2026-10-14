import { and, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { defineModuleJob, type AttentionItem, type ModuleServer } from "@rebar/core/module-server";
import { scopeOf } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { notifyReceivedOverdue } from "../due";
import { receivedInvoice } from "../schema";
import { costLinesForJob } from "./api";
import { commands } from "./commands";
import { receivedEntity } from "./entity";
import { registerReceivedApproval } from "./service";

// schvalování přijatých faktur: výsledek rozhodnutí zapíše stav a zámek (handler se registruje při sestavení modulu)
registerReceivedApproval();

const canRead = (ctx: Parameters<typeof scopeOf>[0]) => scopeOf(ctx, "fakturace.read") !== null;

/**
 * Oblast „received“ modulu Fakturace (ADR 015): Přijaté faktury: příjem, rozpad na oddíly rozpočtu zakázky,
 * schvalování, úhrada. Do této složky píše jen její vlastník.
 */
export const area: ModuleServer = {
  entities: [receivedEntity],
  commands,
  // schválené a uhrazené faktury zakázky jsou skutečné náklady (základ bez DPH, po řádcích)
  costProviders: [
    { key: "fakturace.received", costs: (ctx, jobId) => costLinesForJob(ctx, jobId) },
  ],
  attention: [
    async (ctx) => {
      if (!canRead(ctx)) return [];
      const rows = await ctx.db
        .select({
          id: receivedInvoice.id,
          number: receivedInvoice.number,
          due: receivedInvoice.dueDate,
          gross: receivedInvoice.grossMinor,
          supplier: receivedInvoice.supplier,
        })
        .from(receivedInvoice)
        .where(
          and(
            inArray(receivedInvoice.state, ["pending", "approved"]),
            lte(receivedInvoice.dueDate, addDaysIso(todayIso(), -1)),
            isNull(receivedInvoice.deletedAt),
          ),
        )
        .limit(8);
      return rows.map((r): AttentionItem => ({
        id: `received-overdue-${r.id}`,
        module: "fakturace",
        severity: "danger",
        title: `Přijatá faktura ${r.number} je po splatnosti`,
        detail: `${r.supplier?.name ?? "Dodavatel"} · ${formatMinor(r.gross)} · splatnost ${r.due ?? ""}`,
        href: `/fakturace/prijate/${r.id}`,
      }));
    },
  ],
  calendarLayers: [
    {
      key: "fakturace.received.due",
      label: "Splatnosti přijatých faktur",
      color: "orange",
      items: async (ctx, range) => {
        if (!canRead(ctx)) return [];
        const rows = await ctx.db
          .select({
            id: receivedInvoice.id,
            number: receivedInvoice.number,
            due: receivedInvoice.dueDate,
          })
          .from(receivedInvoice)
          .where(
            and(
              inArray(receivedInvoice.state, ["pending", "approved"]),
              gte(receivedInvoice.dueDate, range.from),
              lte(receivedInvoice.dueDate, range.to),
              isNull(receivedInvoice.deletedAt),
            ),
          );
        return rows.map((r) => ({
          id: `rdue-${r.id}`,
          layer: "fakturace.received.due",
          title: `Splatnost přijaté ${r.number}`,
          start: r.due!,
          allDay: true,
          href: `/fakturace/prijate/${r.id}`,
        }));
      },
    },
  ],
  jobs: [
    // denně ráno: faktury, kterým včera uplynula splatnost, upozorní ty, kdo je platí
    defineModuleJob({
      name: "fakturace.received.overdue",
      schema: z.object({}),
      cron: "40 5 * * *",
      retryLimit: 2,
      async handler(deps) {
        await notifyReceivedOverdue(deps.db);
      },
    }),
  ],
};

export { receivedEntity };
