import type { ClientConfig } from "../config/schema";
import type { ModuleSeed } from "../modules/manifest";
import { ensureLookup, ensurePipeline, type LookupDef, type PipelineDef } from "../config-data";
import type { Executor } from "../db/client";
import { schema } from "../db/client";
import { ensureSeries, type SeriesDef } from "../numbering";
import { ensureSeedDashboards } from "../dashboards/service";
import { ensureSeedViews } from "../views/seed";
import { ensureRoles, type RoleDef } from "../rbac/seed";

/** Výchozí data klienta: role, pipeline, číselníky a číselné řady. Spouští se při instalaci a po aktualizaci (idempotentně). */
export type Seed = {
  roles: readonly RoleDef[];
  pipelines?: readonly PipelineDef[];
  lookups?: readonly LookupDef[];
  series?: readonly SeriesDef[];
};

export function defineSeed(seed: Seed): Seed {
  return seed;
}

/** Sazby DPH v ČR od 1. 1. 2024: základní 21 %, snížená 12 %, nulová. */
const CZ_VAT = [
  { code: "standard", label: "Základní 21 %", rateBp: 2100 },
  { code: "reduced", label: "Snížená 12 %", rateBp: 1200 },
  { code: "zero", label: "Nulová 0 %", rateBp: 0 },
];

export type RunSeedOptions = {
  config: Pick<ClientConfig, "security"> & Partial<Pick<ClientConfig, "dashboards">>;
  catalog: ReadonlySet<string>;
  /** Výchozí data zapnutých modulů (z jejich manifestů). */
  moduleSeeds?: readonly ModuleSeed[];
};

/** Založí chybějící výchozí data. Nic existujícího nepřepisuje (správce to mohl změnit v administraci). */
export async function runSeed(
  db: Executor,
  seed: Seed,
  { config, catalog, moduleSeeds = [] }: RunSeedOptions,
): Promise<void> {
  await ensureRoles(db, seed.roles, { catalog, require2faRoles: config.security.require2faRoles });
  for (const p of [...moduleSeeds.flatMap((m) => m.pipelines ?? []), ...(seed.pipelines ?? [])])
    await ensurePipeline(db, p);
  for (const l of [...moduleSeeds.flatMap((m) => m.lookups ?? []), ...(seed.lookups ?? [])])
    await ensureLookup(db, l);
  await ensureSeries(db, [...moduleSeeds.flatMap((m) => m.series ?? []), ...(seed.series ?? [])]);
  // výchozí nástěnky pro role z konfigurace klienta (zakládají se jen jednou, role musí existovat)
  if (config.dashboards?.enabled !== false && config.dashboards?.defaults.length)
    await ensureSeedDashboards(db, config.dashboards.defaults);
  await ensureSeedViews(
    db,
    moduleSeeds.flatMap((m) => m.views ?? []),
  );
  await db
    .insert(schema.vatRate)
    .values(CZ_VAT.map((v) => ({ ...v, validFrom: "2024-01-01" })))
    .onConflictDoNothing();
}
