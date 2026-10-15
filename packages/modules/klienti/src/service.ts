/*
  Služba `clients` (D §2.3): volá ji modul Obchody při výhře (`setStatus(active, deal_won)`, `addServices`) a Zakázky
  při ukončení (`setStatus(former, job_ended)`, `addServices` u nové zakázky). Změna jde přes `updateRecord` entity
  `company`, takže platí oprávnění, historie, hledání i rozšíření životního cyklu (`lifecycle.ts`), které vyšle události.
  Služba je shovívavá k tomu, co aktér nevidí (soukromá organizace): nic nezmění a nevyhodí chybu, aby výhra obchodu
  nespadla.
*/
import type { ClientStatus, ServiceMap, ServiceType } from "@rebar/core/contracts";
import { resolveEntity, updateRecord } from "@rebar/core/entities";
import type { ModuleDeps, ModuleServer } from "@rebar/core/module-server";
import { inTx, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { loadVisibleCompany } from "./data";
import { isClientStatus, planStatusChange, SERVICES, todayPrague } from "./shared";

type SetStatusInput = Parameters<ServiceMap["clients"]["setStatus"]>[1];

/** Nastaví stav klienta podle pravidel KLI-02 / R-17; vrací, zda se stav změnil, a „klient od“. */
export async function setClientStatus(
  ctx: Ctx,
  deps: ModuleDeps,
  input: SetStatusInput,
  opts: { strict?: boolean } = {},
): Promise<{ changed: boolean; clientSince: string | null }> {
  return inTx(ctx, async (c) => {
    const row = await loadVisibleCompany(c, input.companyId);
    if (!row) {
      if (opts.strict) throw new UserError("Klient nebyl nalezen.");
      return { changed: false, clientSince: null };
    }
    const plan = planStatusChange(
      {
        status: isClientStatus(row.clientStatus) ? row.clientStatus : null,
        since: row.clientSince,
        until: row.clientUntil,
      },
      input.status satisfies ClientStatus,
      { reason: input.reason, endedOn: input.endedOn, source: input.source },
      todayPrague(),
    );
    if ("error" in plan) throw new UserError(plan.error);
    if (!plan.changed) return { changed: false, clientSince: row.clientSince };
    const def = deps.registry.get("company");
    if (!def) throw new UserError("Modul Kontakty není zapnutý.");
    await updateRecord(c, deps.registry, await resolveEntity(c.db, def), row.id, { ...plan.patch });
    return { changed: true, clientSince: plan.since };
  });
}

/** Přidá služby ke klientovi (sjednocení se stávajícími); nové spustí `client.service_added`. */
export async function addClientServices(
  ctx: Ctx,
  deps: ModuleDeps,
  companyId: string,
  services: ServiceType[],
): Promise<void> {
  await inTx(ctx, async (c) => {
    const row = await loadVisibleCompany(c, companyId);
    if (!row) return;
    const next = SERVICES.filter((s) => row.services.includes(s) || services.includes(s));
    if (next.length === row.services.length) return;
    const def = deps.registry.get("company");
    if (!def) return;
    await updateRecord(c, deps.registry, await resolveEntity(c.db, def), row.id, {
      services: next,
    });
  });
}

/** Služby modulu „klienti“ pro `ModuleServer.services`. */
export const services: NonNullable<ModuleServer["services"]> = {
  clients: (deps) => ({
    setStatus: (ctx, input) => setClientStatus(ctx, deps, input),
    addServices: (ctx, companyId, list) => addClientServices(ctx, deps, companyId, list),
  }),
};
