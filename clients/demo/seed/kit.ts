import type { ClientConfig, ModuleManifest } from "@rebar/core";
import type { Auth } from "@rebar/core/auth";
import type { Db } from "@rebar/core/db";
import { can, assertCan, NotFoundError, type Ctx } from "@rebar/core/rbac";
import { createRecord, resolveEntity, type EntityRegistry } from "@rebar/core/entities";
import type { CommandDef, ModuleDeps } from "@rebar/core/module-server";
import type { SettingsService } from "@rebar/core/settings";
import { sql } from "drizzle-orm";

/**
 * Služby, které demo seed potřebuje. Staví je skript `scripts/demo-seed.ts` (skutečná aplikace) nebo test;
 * seed sám nezná prostředí, jen volá příkazy a entity zapnutých modulů (stejná cesta jako uživatel v aplikaci).
 */
export type DemoServices = {
  db: Db;
  config: Pick<ClientConfig, "security" | "slug">;
  modules: readonly ModuleManifest[];
  registry: EntityRegistry;
  deps: ModuleDeps;
  commands: ReadonlyMap<string, CommandDef>;
  catalog: ReadonlySet<string>;
  auth: Auth;
  settings: SettingsService;
  /** Idempotentní doplnění dat zapnutých modulů (výchozí stavy CRM…), po `runSeed`. */
  ensure?: readonly ((db: Db) => Promise<unknown>)[];
};

export type SeedOptions = {
  /** Smaže dřívější demo data (jen když je všechna obchodní data v databázi označená jako demo). */
  reset?: boolean;
  /** Smaže VŠECHNA obchodní data (zakázky, kontakty, faktury…) – jen pro vývojové databáze. */
  wipe?: boolean;
  /** Ponechá povinné 2FA rolí (výchozí: demo uživatelé se přihlašují bez 2FA). */
  keep2fa?: boolean;
  /** Připojení pod vlastníkem schématu pro `wipe` (aplikační role nesmí TRUNCATE). */
  migratorUrl?: string;
  log?: (message: string) => void;
};

/** Spouštěč příkazů a entit pod jedním uživatelem. */
export class Kit {
  constructor(
    readonly s: DemoServices,
    readonly log: (m: string) => void,
  ) {}

  /** Zavolá příkaz modulu jako uživatel (oprávnění příkazu, validace vstupu, handler). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- výsledky příkazů se v seedu čtou volně (tvar hlídá test)
  async run<T = any>(ctx: Ctx, name: string, input: unknown): Promise<T> {
    const cmd = this.s.commands.get(name);
    if (!cmd) throw new NotFoundError(`Neznámý příkaz ${name}.`);
    if (cmd.permission) {
      const keys = [cmd.permission].flat();
      if (!keys.some((k) => can(ctx, k))) assertCan(ctx, keys[0]!);
    }
    try {
      return (await cmd.handler(ctx, cmd.input.parse(input), this.s.deps)) as T;
    } catch (err) {
      throw new Error(`${name}: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }
  }

  /** Založí záznam entity (stejná cesta jako formulář v aplikaci). */
  async create(ctx: Ctx, entity: string, values: Record<string, unknown>) {
    const def = this.s.registry.get(entity);
    if (!def) throw new NotFoundError(`Neznámá entita ${entity}.`);
    try {
      const res = await createRecord(
        ctx,
        this.s.registry,
        await resolveEntity(ctx.db, def),
        values,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- řádek entity má dynamické atributy
      return res.row as Record<string, any> & { id: string };
    } catch (err) {
      throw new Error(`${entity}: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }
  }

  sqlJob(id: string) {
    return sql`select number from job where id = ${id}`;
  }

  sqlSetAddress(id: string, address: string) {
    return sql`update job set address = ${address} where id = ${id}`;
  }

  /** Přímý SQL zásah (zpětné datování, označení demo dat); jen pro to, co aplikace sama nenabízí. */
  async exec(query: ReturnType<typeof sql>) {
    return this.s.db.execute(query);
  }
}

export { sql };
