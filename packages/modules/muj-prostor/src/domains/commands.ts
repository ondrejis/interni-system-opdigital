import { and, inArray, isNull, sql } from "drizzle-orm";
import { createRecord, resolveEntity, updateRecord } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { UserError, inTx } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { domainsAssignClientInput, domainsBulkAddInput, domainsListInput } from "../contract";
import { webDomain } from "../schema";
import type { AssignClientResult, BulkAddResult, DomainListResult } from "../types";
import { loadDomainList } from "./data";
import { parseDomainList } from "./logic";

/** Seznam domén s popisky klienta a hostingu a souhrnem (barvy expirace se dopočítají podle `today`). */
export const domainsList = defineCommand({
  name: "muj-prostor.domains.list",
  permission: "muj-prostor.domains",
  input: domainsListInput,
  handler: async (ctx, _input, deps): Promise<DomainListResult> =>
    loadDomainList(ctx, deps, todayIso()),
});

/**
 * Hromadné vložení domén (DOM-04): text s jednou doménou na řádek. Neplatné zápisy, opakování v zadání a domény, které
 * už evidované jsou, se přeskočí a vrátí se v odpovědi; ostatní se založí přes engine entity (historie, hledání) v jedné
 * transakci. Klienta, registrátora a další hodnoty jde zadat pro všechny najednou; jinak se doplňují později.
 */
export const domainsBulkAdd = defineCommand({
  name: "muj-prostor.domains.bulkAdd",
  permission: "muj-prostor.domains",
  input: domainsBulkAddInput,
  handler: async (ctx, input, deps): Promise<BulkAddResult> => {
    const def = deps.registry.get("web_domain");
    if (!def) throw new UserError("Evidence domén není zapnutá.");
    const parsed = parseDomainList(input.text);
    if (!parsed.valid.length && !parsed.invalid.length && !parsed.duplicates.length)
      throw new UserError("Vložte aspoň jednu doménu.");
    const entity = await resolveEntity(ctx.db, def);
    const d = input.defaults ?? {};
    const shared: Record<string, unknown> = {
      ...(d.companyId ? { company: d.companyId } : {}),
      ...(d.registrar ? { registrar: d.registrar } : {}),
      ...(d.payer ? { payer: d.payer } : {}),
      ...(d.autoRenew !== undefined ? { autoRenew: d.autoRenew } : {}),
      ...(d.warnDays ? { warnDays: d.warnDays } : {}),
    };
    return inTx(ctx, async (c) => {
      const existing = new Set<string>();
      if (parsed.valid.length) {
        const rows = await c.db
          .select({ domain: webDomain.domain })
          .from(webDomain)
          .where(
            and(
              isNull(webDomain.deletedAt),
              inArray(sql`lower(${webDomain.domain})`, parsed.valid),
            ),
          );
        for (const r of rows) existing.add(r.domain.toLowerCase());
      }
      const result: BulkAddResult = {
        created: [],
        skipped: [
          ...parsed.invalid.map((input) => ({ input, reason: "invalid" as const })),
          ...parsed.duplicates.map((input) => ({ input, reason: "duplicate_in_input" as const })),
        ],
        truncated: parsed.truncated,
      };
      for (const domain of parsed.valid) {
        if (existing.has(domain)) {
          result.skipped.push({ input: domain, reason: "exists" });
          continue;
        }
        const { row } = await createRecord(c, deps.registry, entity, { ...shared, domain });
        result.created.push({ id: row.id, domain });
      }
      return result;
    });
  },
});

/** Přiřadí (nebo odebere) klienta u vybraných domén; po hromadném vložení se tak doplňují klienti. */
export const domainsAssignClient = defineCommand({
  name: "muj-prostor.domains.assignClient",
  permission: "muj-prostor.domains",
  input: domainsAssignClientInput,
  handler: async (ctx, input, deps): Promise<AssignClientResult> => {
    const def = deps.registry.get("web_domain");
    if (!def) throw new UserError("Evidence domén není zapnutá.");
    const entity = await resolveEntity(ctx.db, def);
    const ids = [...new Set(input.ids)];
    return inTx(ctx, async (c) => {
      for (const id of ids)
        await updateRecord(c, deps.registry, entity, id, { company: input.companyId });
      return { updated: ids.length };
    });
  },
});

/** Příkazy oblasti „domains“. */
export const domainsCommands = [domainsList, domainsBulkAdd, domainsAssignClient];
