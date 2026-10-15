import { countActive } from "@rebar/core/entities";
import type { ClientTabProvider } from "@rebar/core/contracts";
import type { DeleteBlocker } from "@rebar/core/entities";
import { PermissionError, can, type Ctx } from "@rebar/core/rbac";
import { eq } from "drizzle-orm";
import { recurringService, webDomain } from "../schema";

/** Smí aktér vidět evidenci hostingu nebo domén (jen vlastník; Patrik nikdy). */
export const canSeeMujProstor = (ctx: Ctx): boolean =>
  can(ctx, "muj-prostor.hosting") || can(ctx, "muj-prostor.domains");

/**
 * Příspěvek ke kartě klienta (KLI-09): počet služeb a domén klienta pro záložku „Hosting a domény“. Bez oprávnění
 * `muj-prostor.*` nevrací nic, takže klient u Patrika žádnou stopu po hostingu ani doménách nemá.
 */
export const clientCardProvider: ClientTabProvider = {
  async tabCounts(ctx, companyId) {
    if (!canSeeMujProstor(ctx)) return {};
    const [services, domains] = await Promise.all([
      can(ctx, "muj-prostor.hosting")
        ? countActive(ctx, recurringService, eq(recurringService.companyId, companyId))
        : 0,
      can(ctx, "muj-prostor.domains")
        ? countActive(ctx, webDomain, eq(webDomain.companyId, companyId))
        : 0,
    ]);
    return { hosting: services + domains };
  },
};

/**
 * Firma s evidovaným hostingem nebo doménami se nemaže mimochodem. Blokace se týká jen vlastníka evidence (kdo nemá
 * oprávnění, nic nezjistí a z hlášky se o hostingu nedozví).
 */
export const companyDeleteBlockers: readonly DeleteBlocker[] = [
  {
    id: "muj-prostor.company-hosting",
    entity: "company",
    count: async (ctx, id) =>
      can(ctx, "muj-prostor.hosting")
        ? countActive(ctx, recurringService, eq(recurringService.companyId, id))
        : 0,
    noun: ["služba hostingu a údržby", "služby hostingu a údržby", "služeb hostingu a údržby"],
    fix: "nejdřív je zrušte nebo přesuňte na jiného klienta",
  },
  {
    id: "muj-prostor.company-domains",
    entity: "company",
    count: async (ctx, id) =>
      can(ctx, "muj-prostor.domains")
        ? countActive(ctx, webDomain, eq(webDomain.companyId, id))
        : 0,
    noun: ["doména", "domény", "domén"],
    fix: "nejdřív je přesuňte na jiného klienta nebo smažte",
  },
];

/** Čtecí cesta pro canary test: bez oprávnění vrátí `null` místo chyby (test chce vidět, že nic neuniklo). */
export async function unlessDenied<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PermissionError) return null;
    throw e;
  }
}
