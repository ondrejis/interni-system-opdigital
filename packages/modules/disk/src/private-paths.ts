/*
  Ruční čtecí cesty modulu „disk“ pro canary test soukromí (D §5.4, `tests/private-paths.int.test.ts`): každá čte
  složky a požadavky nad VŠEMI klienty a zakázkami v databázi, aby test ověřil, že výsledek pro aktéra bez
  `private.read` neobsahuje nic ze soukromých záznamů (ID, názvy, složky).
*/
import { getTableColumns, isNull } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { PrivatePathDef } from "@rebar/core/module-server";
import type { Executor } from "@rebar/core/db";
import type { EntityRegistry } from "@rebar/core/entities";
import { clientCardProvider } from "./contributions";
import { folderInfos } from "./service";
import { diskStatus } from "./status";
import type { DriveEntityType } from "./types";

async function allIds(db: Executor, registry: EntityRegistry, key: DriveEntityType) {
  const def = registry.get(key);
  if (!def) return [];
  const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
  const rows = await db.select({ id: cols.id! }).from(def.table).where(isNull(cols.deletedAt!));
  return rows.map((r) => String(r.id));
}

/** Čtecí cesty pro canary test (`ModuleServer.privatePaths`). */
export const privatePaths: readonly PrivatePathDef[] = [
  {
    name: "disk.clientCard.summary",
    run: async (ctx, deps) => {
      const ids = await allIds(ctx.db, deps.registry, "company");
      return Promise.all(ids.map((id) => clientCardProvider.summary!(ctx, id)));
    },
  },
  {
    name: "disk.clientCard.listMetrics",
    run: async (ctx, deps) =>
      clientCardProvider.listMetrics!(ctx, await allIds(ctx.db, deps.registry, "company")),
  },
  {
    name: "disk.service.folderState",
    run: async (ctx, deps) => {
      const company = await folderInfos(
        ctx,
        deps,
        "company",
        await allIds(ctx.db, deps.registry, "company"),
      );
      const job = await folderInfos(ctx, deps, "job", await allIds(ctx.db, deps.registry, "job"));
      return { company: [...company], job: [...job] };
    },
  },
  { name: "disk.status", run: (ctx, deps) => diskStatus(ctx, deps) },
];
