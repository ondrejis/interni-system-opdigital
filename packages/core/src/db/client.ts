import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Cokoli, čím jde posílat dotazy: připojení nebo transakce. */
export type Executor = Db | Tx;

export type DbHandle = {
  db: Db;
  sql: ReturnType<typeof postgres>;
  close: () => Promise<void>;
};

export type CreateDbOptions = {
  /** Max. počet spojení v poolu. Na 1 vCPU / 4 GB stačí málo. */
  max?: number;
  /** Zachytávání dotazů (měření výkonu, počítání dotazů v testech na N+1). */
  logger?: { logQuery(query: string, params: unknown[]): void };
};

/** Připojení k databázi pod uživatelem s minimálními právy. */
export function createDb(url: string, { max = 10, logger }: CreateDbOptions = {}): DbHandle {
  const sql = postgres(url, { max, onnotice: () => {}, prepare: true });
  const db = drizzle(sql, { schema, ...(logger ? { logger } : {}) });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}

export { schema };
