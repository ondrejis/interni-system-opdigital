/*
  Životní cyklus klienta jako rozšíření entity `company` (D §2.4, `extendEntity`): pravidla stavů a události platí
  stejně pro příkaz, službu `clients`, inline úpravu v seznamu i detail organizace, protože běží v háčcích úpravy:
  - `beforeUpdate`/`beforeCreate`: „klient od“ při prvním přechodu na Aktivní (R-17), datum ukončení u Bývalého;
  - `afterUpdate`/`afterCreate`: `client.status_changed`, `client.renamed`, `client.service_added` (Disk na ně reaguje).
*/
import type { ClientSnap, ClientStatus, ServiceType } from "@rebar/core/contracts";
import { emitDomain } from "@rebar/core/events";
import { extendEntity } from "@rebar/core/entities";
import type { Ctx } from "@rebar/core/rbac";
import { isClientStatus, planStatusChange, todayPrague } from "./shared";

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const statusOf = (r: Row): ClientStatus | null =>
  isClientStatus(r.clientStatus) ? r.clientStatus : null;
const servicesOf = (r: Row): ServiceType[] =>
  Array.isArray(r.services)
    ? (r.services.filter((s) => typeof s === "string") as ServiceType[])
    : [];

/** Snímek klienta pro události `client.*` (nikdy celý řádek). */
export function clientSnap(r: Row): ClientSnap {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    ico: str(r.ico),
    status: statusOf(r),
    since: str(r.clientSince),
  };
}

const entityOf = (r: Row) => ({
  type: "company",
  id: String(r.id),
  isPrivate: r.isPrivate === true,
});

/**
 * Vyšle události podle rozdílu před a po změně (`before` = `null` při založení). Organizace, která není klient
 * (`client_status` null), události nevyvolává; přejmenování a nová služba se hlásí jen klientům (Disk by neměl co dělat).
 */
export async function emitClientChanges(ctx: Ctx, before: Row | null, after: Row): Promise<void> {
  const from = before ? statusOf(before) : null;
  const to = statusOf(after);
  if (from !== to) {
    await emitDomain(
      ctx,
      "client.status_changed",
      {
        client: clientSnap(after),
        from,
        to,
        ...(to === "former" && str(after.clientEndReason)
          ? { reason: str(after.clientEndReason)! }
          : {}),
        ...(to === "former" && str(after.clientUntil) ? { endedOn: str(after.clientUntil)! } : {}),
      },
      { entity: entityOf(after) },
    );
  }
  if (to === null || !before) return;
  const oldName = String(before.name ?? "");
  const newName = String(after.name ?? "");
  if (oldName !== newName) {
    await emitDomain(
      ctx,
      "client.renamed",
      { clientId: String(after.id), from: oldName, to: newName },
      { entity: entityOf(after) },
    );
  }
  const had = new Set(servicesOf(before));
  for (const service of servicesOf(after)) {
    if (had.has(service)) continue;
    await emitDomain(
      ctx,
      "client.service_added",
      { clientId: String(after.id), service },
      { entity: entityOf(after) },
    );
  }
}

/** Rozšíření entity `company` o pravidla stavů a události klienta (`entities` modulu v `server.ts`). */
export const clientLifecycle = extendEntity("company", {
  beforeCreate: async (_ctx, values) => {
    // organizace založená rovnou jako aktivní klient má „klient od“ dnes
    if (values.clientStatus === "active" && !values.clientSince)
      return { ...values, clientSince: todayPrague() };
    return values;
  },
  beforeUpdate: async (_ctx, before, changes) => {
    if (!("clientStatus" in changes)) return;
    const to = statusOf(changes);
    if (!to) return;
    const plan = planStatusChange(
      {
        status: statusOf(before),
        since: str(before.clientSince),
        until: str(before.clientUntil),
      },
      to,
      { source: "deal_won" /* pravidla bez vynucení důvodu: ten vyžaduje příkaz a služba */ },
      todayPrague(),
    );
    if ("error" in plan || !plan.changed) return;
    // co už změna obsahuje (ruční datum, důvod), se nepřepisuje
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(plan.patch)) {
      if (k === "clientStatus") continue;
      if (!(k in changes)) extra[k] = v;
    }
    return extra;
  },
  afterCreate: async (ctx, created) => {
    if (statusOf(created)) await emitClientChanges(ctx, null, created);
  },
  afterUpdate: async (ctx, before, after) => {
    await emitClientChanges(ctx, before, after);
  },
});
