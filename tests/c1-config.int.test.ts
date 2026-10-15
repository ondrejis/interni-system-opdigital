import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setRolePermissions } from "@rebar/core/admin";
import { auditReadScope, recordAudit } from "@rebar/core/audit";
import { createFieldDef, updateFieldDef } from "@rebar/core/custom-fields";
import { schema, type Db } from "@rebar/core/db";
import { createRecord, describeEntity, getRecord, writeSystemFields } from "@rebar/core/entities";
import { ensureRoles, sourceCtx, UserError, PermissionError, type Ctx } from "@rebar/core/rbac";
import { createTag, deleteTag, listTags, updateTag } from "@rebar/core/tags";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Konfigurace jádra (C1): štítky s rozsahem, vlastní pole (dlouhý text, archivace, zobrazení při vytvoření), role
  (soukromé nejde přidělit, seed jen přidává), druhy autora v historii a skryté bezpečnostní události.
*/
const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let owner: Ctx;
let partner: Ctx;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  owner = f.people.owner.ctx;
  partner = f.people.partner.ctx;
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

describe("štítky", () => {
  it("štítek s rozsahem se nabízí jen u své entity; použitý se archivuje, nepoužitý smaže; partner je smí spravovat", async () => {
    const t = await createTag(partner, { label: "VIP klient", color: "red", scopes: ["company"] });
    const company = f.registry.get("company")!;
    const job = f.registry.get("job")!;
    const { resolveEntity } = await import("@rebar/core/entities");
    const choices = async (def: typeof company, key: string) =>
      (await resolveEntity(db, def)).attributes.find((a) => a.key === key)?.choices ?? [];
    expect((await choices(company, "tags")).map((c) => c.value)).toContain(t.value);
    expect((await choices(job, "tags")).map((c) => c.value)).not.toContain(t.value);
    const made = await createRecord(owner, f.registry, await resolveEntity(db, company), {
      name: "Firma se štítkem",
      tags: [t.value],
    });
    const listed = await listTags(partner, f.registry);
    expect(listed.tags.find((x) => x.id === t.id)?.usage.company).toBe(1);
    expect(await deleteTag(partner, f.registry, t.id)).toEqual({ archived: true });
    const arch = (await choices(company, "tags")).find((c) => c.value === t.value);
    expect(arch?.archived).toBe(true);
    const row = (await getRecord(owner, f.registry, await resolveEntity(db, company), made.row.id))
      .row;
    expect(row.tags).toEqual([t.value]);
    const free = await createTag(owner, { label: "Zbytečný" });
    expect(await deleteTag(owner, f.registry, free.id)).toEqual({ archived: false });
    await expect(createTag(owner, { label: "vip klient" })).rejects.toThrow(UserError);
    await updateTag(owner, t.id, { color: "green" });
  });

  it("bez settings.tags štítky spravovat nejde", async () => {
    const nobody = await makeUser(db, [], {});
    await expect(createTag(nobody.ctx, { label: "X" })).rejects.toThrow(PermissionError);
  });
});

describe("vlastní pole", () => {
  it("dlouhý text, zobrazení při vytvoření a archivace beze ztráty dat; stačí settings.custom_fields", async () => {
    const mgr = await makeUser(db, [["settings.custom_fields", "all"]]);
    const def = await createFieldDef(mgr.ctx, {
      entityType: "company",
      key: "poznamka_dlouha",
      label: "Dlouhá poznámka",
      type: "longtext",
      showInForm: true,
    });
    expect(def.showInForm).toBe(true);
    const { resolveEntity } = await import("@rebar/core/entities");
    const e = await resolveEntity(db, f.registry.get("company")!);
    const d = await describeEntity(owner, db, e, f.registry);
    expect(d.attributes.find((a) => a.key === "custom.poznamka_dlouha")).toMatchObject({
      type: "longtext",
      showInForm: true,
    });
    const rec = await createRecord(owner, f.registry, e, {
      name: "Firma s polem",
      "custom.poznamka_dlouha": "Dlouhý\ntext",
    });
    await updateFieldDef(mgr.ctx, def.id, { options: { hidden: true } });
    const after = await resolveEntity(db, f.registry.get("company")!);
    expect(after.attributes.some((a) => a.key === "custom.poznamka_dlouha")).toBe(false);
    const [raw] = await db
      .select({ c: f.registry.get("company")!.table["custom" as never] })
      .from(f.registry.get("company")!.table)
      .where(
        eq((f.registry.get("company")!.table as never as { id: never }).id, rec.row.id as never),
      );
    expect(JSON.stringify(raw)).toContain("Dlouhý");
  });
});

describe("role a oprávnění", () => {
  it("oprávnění private.read nejde přidělit žádné roli", async () => {
    const [role] = await db
      .insert(schema.role)
      .values({ key: `c1-${Date.now()}`, name: "Testovací" })
      .returning();
    await expect(
      setRolePermissions(owner, role!.id, { "private.read": "all" }, f.catalog),
    ).rejects.toThrow(/soukromé/i);
    await setRolePermissions(owner, role!.id, { "kontakty.read": "all" }, f.catalog);
  });

  it("seed existující roli jen doplní o nová oprávnění, odebrané nevrací", async () => {
    const key = `seeded-${Date.now()}`;
    const def = { key, name: "Seed", permissions: { "kontakty.read": "all" as const } };
    await ensureRoles(db, [def], { catalog: f.catalog });
    const [role] = await db.select().from(schema.role).where(eq(schema.role.key, key));
    // správce oprávnění odebere
    await db.delete(schema.rolePermission).where(eq(schema.rolePermission.roleId, role!.id));
    await ensureRoles(db, [def], { catalog: f.catalog });
    expect(
      await db
        .select()
        .from(schema.rolePermission)
        .where(eq(schema.rolePermission.roleId, role!.id)),
    ).toHaveLength(0);
    // seed přidá nové oprávnění; staré (odebrané) zůstává odebrané
    await ensureRoles(
      db,
      [{ ...def, permissions: { "kontakty.read": "all", "kontakty.write": "all" } }],
      { catalog: f.catalog },
    );
    const perms = await db
      .select()
      .from(schema.rolePermission)
      .where(eq(schema.rolePermission.roleId, role!.id));
    expect(perms.map((p) => p.permission)).toEqual(["kontakty.write"]);
    // žádná role kromě systémové nedostane private.read ze seedu
    await ensureRoles(
      db,
      [{ key: `${key}-p`, name: "P", permissions: { "private.read": "all" as const } }],
      { catalog: f.catalog },
    );
    const [p] = await db
      .select()
      .from(schema.role)
      .where(eq(schema.role.key, `${key}-p`));
    expect(
      await db.select().from(schema.rolePermission).where(eq(schema.rolePermission.roleId, p!.id)),
    ).toHaveLength(0);
  });

  it("změna oprávnění platí hned (aktér se načítá při každém požadavku)", async () => {
    const u = await makeUser(db, [["kontakty.read", "all"]]);
    const { loadActor } = await import("@rebar/core/rbac");
    expect((await loadActor(db, u.id))!.permissions.has("kontakty.write")).toBe(false);
    const [r] = await db.select().from(schema.user).where(eq(schema.user.id, u.id));
    await setRolePermissions(
      owner,
      r!.roleId,
      { "kontakty.read": "all", "kontakty.write": "all" },
      f.catalog,
    );
    expect((await loadActor(db, u.id))!.permissions.has("kontakty.write")).toBe(true);
  });
});

describe("historie: druh autora a viditelnost", () => {
  it("změna z n8n/Google nese druh a popisek; tajná pole se nezapisují; bezpečnostní události vidí partner jen své", async () => {
    const src = sourceCtx(db, "n8n", "n8n: Disk");
    const co = await createRecord(
      owner,
      f.registry,
      await (await import("@rebar/core/entities")).resolveEntity(db, f.registry.get("company")!),
      { name: "Firma pro Disk" },
    );
    await writeSystemFields(
      src,
      f.registry,
      "company",
      co.row.id,
      { driveStatus: "ready" },
      { actorLabel: "n8n: Disk" },
    );
    const [row] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityId, co.row.id), eq(schema.auditLog.actorKind, "n8n")));
    expect(row?.actorLabel).toBe("n8n: Disk");
    await recordAudit(owner, {
      action: "update",
      entityType: "setting",
      entityId: "smtp",
      changes: [
        { field: "password", old: "a", new: "tajne" },
        { field: "host", old: null, new: "x" },
      ],
    });
    const [s] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, "smtp"));
    expect(s!.category).toBe("integration");
    expect(JSON.stringify(s!.changes)).not.toContain("tajne");
    // bezpečnostní událost cizího účtu partner nevidí, svůj ano
    await recordAudit(owner, {
      action: "login_failed",
      entityType: "user",
      entityId: f.people.owner.id,
      category: "security",
    });
    await recordAudit(owner, {
      action: "login",
      entityType: "user",
      entityId: f.people.partner.id,
      category: "security",
    });
    const seen = await db
      .select({ e: schema.auditLog.entityId })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.category, "security"), auditReadScope(partner)));
    expect(seen.map((x) => x.e)).toContain(f.people.partner.id);
    expect(seen.map((x) => x.e)).not.toContain(f.people.owner.id);
  });
});
