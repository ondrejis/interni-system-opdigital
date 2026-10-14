import { inject } from "vitest";
import { createDb, schema, type Db, type DbHandle } from "../db/client";
import { newId } from "../db/ids";
import { loadActor } from "../rbac/actor";
import { createCtx } from "../rbac/context";

export type TestDbUrls = { app: string; migrator: string; admin: string };

declare module "vitest" {
  export interface ProvidedContext {
    rebarDb: TestDbUrls;
  }
}

/**
 * Adresy databáze, kterou má k dispozici právě běžící soubor testů: vlastní kopie šablony (viz `setup-file.ts`),
 * jinak sdílená databáze z globálního nastavení.
 */
export function rebarDbUrls(): TestDbUrls {
  return (globalThis as { __rebarFileDb?: TestDbUrls }).__rebarFileDb ?? inject("rebarDb");
}

/** Připojení k testovací DB pod aplikační rolí (minimální práva) — stejně jako v produkci. */
export function connectAppDb(): DbHandle {
  return createDb(rebarDbUrls().app, { max: 4 });
}

/** Připojení pod uživatelem migrací; jen pro přípravu dat, kterou aplikační role nesmí. */
export function connectMigratorDb(): DbHandle {
  return createDb(rebarDbUrls().migrator, { max: 2 });
}

export function uniqueEmail(prefix = "u") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@test.example`;
}

/** Drizzle obaluje chyby PostgreSQL do „Failed query“; skutečná příčina je v `cause`. */
export async function expectPgError(promise: PromiseLike<unknown>, pattern: RegExp) {
  try {
    await promise;
  } catch (err) {
    const messages: string[] = [];
    for (let e: unknown = err; e instanceof Error; e = e.cause) messages.push(e.message);
    const text = messages.join(" | ");
    if (!pattern.test(text))
      throw new Error(`Chyba DB neodpovídá ${pattern}: ${text}`, { cause: err });
    return;
  }
  throw new Error(`Očekávána chyba DB ${pattern}, ale dotaz proběhl.`);
}

export { fakeMailer, createTestAuth, cookieHeader, totpCode, secretFromTotpUri } from "./auth";

/** Čeká, až podmínka platí (např. až worker zpracuje úlohu). */
export async function waitFor<T>(
  fn: () => Promise<T | false | null | undefined>,
  timeoutMs = 15_000,
  intervalMs = 100,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("Vypršel čas čekání na podmínku.");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Uživatel s vlastní rolí a danými oprávnění (`[klíč, rozsah]`) a kontextem pro volání služeb.
 * Role i uživatel jsou unikátní, takže testy se navzájem neovlivňují.
 */
export async function makeUser(
  db: Db,
  perms: readonly [string, "all" | "own"][] = [],
  opts: { name?: string; systemRole?: boolean } = {},
) {
  const [role] = await db
    .insert(schema.role)
    .values({
      key: `r-${newId().slice(-8)}`,
      name: `Role ${newId().slice(-4)}`,
      isSystem: opts.systemRole ?? false,
    })
    .returning();
  if (perms.length)
    await db
      .insert(schema.rolePermission)
      .values(perms.map(([permission, scope]) => ({ roleId: role!.id, permission, scope })));
  const [user] = await db
    .insert(schema.user)
    .values({
      name: opts.name ?? `Test ${newId().slice(-4)}`,
      email: uniqueEmail(),
      roleId: role!.id,
    })
    .returning();
  const actor = (await loadActor(db, user!.id))!;
  return { id: user!.id, name: user!.name, email: user!.email, ctx: createCtx(db, actor) };
}
