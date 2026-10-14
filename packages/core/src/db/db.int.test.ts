import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { connectAppDb, expectPgError, uniqueEmail } from "../testing";
import { newId } from "./ids";
import { schema } from "./client";

const app = connectAppDb();
afterAll(() => app.close());

async function makeRole() {
  const [r] = await app.db
    .insert(schema.role)
    .values({ key: `r-${newId().slice(-8)}`, name: "Test" })
    .returning();
  return r!;
}

describe("základ databáze", () => {
  it("migrace vytvořily tabulky a rozšíření", async () => {
    const tables = await app.sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public'`;
    const names = tables.map((t) => t.table_name);
    for (const t of [
      "user",
      "role",
      "role_permission",
      "session",
      "audit_log",
      "invitation",
      "two_factor",
      "rate_limit",
    ]) {
      expect(names).toContain(t);
    }
    const ext = await app.sql<{ extname: string }[]>`select extname from pg_extension`;
    expect(ext.map((e) => e.extname)).toEqual(expect.arrayContaining(["unaccent", "pg_trgm"]));
  });

  it("ID jsou UUID v7 a řadí se podle času", () => {
    const a = newId();
    const b = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b || a.slice(0, 13) === b.slice(0, 13)).toBe(true);
  });

  it("e-mail uživatele je unikátní bez ohledu na velikost písmen", async () => {
    const role = await makeRole();
    const email = uniqueEmail("Case");
    await app.db.insert(schema.user).values({ name: "A", email, roleId: role.id });
    await expect(
      app.db.insert(schema.user).values({ name: "B", email: email.toUpperCase(), roleId: role.id }),
    ).rejects.toThrow();
  });

  it("updated_at se při změně přes Drizzle posune", async () => {
    const role = await makeRole();
    const [u] = await app.db
      .insert(schema.user)
      .values({ name: "A", email: uniqueEmail(), roleId: role.id })
      .returning();
    await new Promise((r) => setTimeout(r, 15));
    const [after] = await app.db
      .update(schema.user)
      .set({ name: "Nové" })
      .where(eq(schema.user.id, u!.id))
      .returning();
    expect(after!.updatedAt.getTime()).toBeGreaterThan(u!.updatedAt.getTime());
  });

  it("aplikační role smí do auditu zapisovat a číst, ale ne měnit ani mazat", async () => {
    const id = newId();
    await app.db.insert(schema.auditLog).values({
      id,
      actorKind: "system",
      action: "test",
      entityType: "test",
      entityId: "1",
    });
    const rows = await app.db.select().from(schema.auditLog).where(eq(schema.auditLog.id, id));
    expect(rows).toHaveLength(1);
    await expectPgError(
      app.db.update(schema.auditLog).set({ action: "x" }).where(eq(schema.auditLog.id, id)),
      /permission denied/,
    );
    await expectPgError(
      app.db.delete(schema.auditLog).where(eq(schema.auditLog.id, id)),
      /permission denied/,
    );
    await expectPgError(app.sql`truncate audit_log`, /permission denied/);
  });

  it("aplikační role nesmí měnit schéma", async () => {
    await expectPgError(app.sql`create table zz_nope (id int)`, /permission denied/);
    await expectPgError(app.sql`drop table role_permission`, /must be owner|permission denied/);
  });

  it("řazení respektuje češtinu (ICU cs-CZ)", async () => {
    const rows = await app.sql<{ v: string }[]>`
      select v from (values ('Cecil'), ('Čapek'), ('Chalupa'), ('Hana')) t(v) order by v collate "cs-x-icu"`;
    expect(rows.map((r) => r.v)).toEqual(["Cecil", "Čapek", "Hana", "Chalupa"]);
  });
});
