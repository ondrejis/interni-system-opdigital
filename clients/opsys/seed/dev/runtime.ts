import type { Db } from "@rebar/core/db";
import type { EntityRegistry } from "@rebar/core/entities";
import type { Ctx } from "@rebar/core/rbac";

/**
 * Co vývojový seed potřebuje od prostředí: databázi, registr entit, kontexty obou vývojových uživatelů a volání
 * příkazů modulů tak, jak je volá aplikace (vstup projde zod schématem, běží hooky, události a kontrola oprávnění).
 */
export type DevSeedRuntime = {
  db: Db;
  registry: EntityRegistry;
  /** Vývojový vlastník (role `owner`). */
  owner: Ctx;
  /** Vývojový partner (role `partner`). */
  partner: Ctx;
  /** Zavolá příkaz modulu jako daný kontext. */
  run: <T = Record<string, unknown>>(name: string, ctx: Ctx, input: unknown) => Promise<T>;
  log?: (message: string) => void;
};

/** Souhrn toho, co vývojový seed založil (pro výpis a test). */
export type DevSeedResult = {
  skipped: boolean;
  companies: number;
  people: number;
  deals: number;
  jobs: number;
  payments: number;
  tasks: number;
  notes: number;
  timeEntries: number;
  privateJobId: string | null;
};
