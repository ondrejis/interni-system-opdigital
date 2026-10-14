import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createInvitation } from "../auth/invitations";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { loadActor } from "../rbac/actor";
import { createCtx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { companySetting, createSettings } from "../settings";
import { createCipher, parseKeyRing } from "../security";
import { connectAppDb, createTestAuth, fakeMailer, uniqueEmail } from "../testing";
import {
  createRole,
  deleteRole,
  listRoles,
  lookupRoles,
  setRolePermissions,
  updateRole,
} from "./roles";
import {
  listLoginEvents,
  listUsers,
  revokeSessions,
  sendPasswordReset,
  setUserActive,
  setUserRole,
  updateOwnName,
} from "./users";
import { randomBytes } from "node:crypto";

const app = connectAppDb();
const mailer = fakeMailer();
const auth = createTestAuth(app.db, mailer);
afterAll(() => app.close());
const catalog = new Set([
  "users.manage",
  "roles.manage",
  "settings.manage",
  "zakazky.read",
  "zakazky.write",
  "sklad.read",
]);

async function role(over: { isSystem?: boolean; perms?: [string, "all" | "own"][] } = {}) {
  const [r] = await app.db
    .insert(schema.role)
    .values({
      key: `r-${newId().slice(-8)}`,
      name: `Role ${newId().slice(-4)}`,
      isSystem: over.isSystem ?? false,
    })
    .returning();
  if (over.perms?.length)
    await app.db
      .insert(schema.rolePermission)
      .values(over.perms.map(([permission, scope]) => ({ roleId: r!.id, permission, scope })));
  return r!;
}
async function person(r: { id: string }, name = "T") {
  const [u] = await app.db
    .insert(schema.user)
    .values({ name, email: uniqueEmail(), roleId: r.id })
    .returning();
  const actor = (await loadActor(app.db, u!.id, { catalog }))!;
  return { id: u!.id, email: u!.email, ctx: createCtx(app.db, actor) };
}
const admin = async () =>
  person(
    await role({
      perms: [
        ["users.manage", "all"],
        ["roles.manage", "all"],
      ],
    }),
    "Správce",
  );
const owner = async () => person(await role({ isSystem: true }), "Majitel");

describe("správa uživatelů", () => {
  it("seznam uživatelů vidí jen správce uživatelů", async () => {
    const a = await admin();
    const plain = await person(await role());
    expect((await listUsers(a.ctx)).some((u) => u.id === a.id)).toBe(true);
    await expect(listUsers(plain.ctx)).rejects.toThrow(PermissionError);
  });

  it("změna role: nová oprávnění platí hned (relace se ukončí), vlastní roli změnit nejde, audit zná změnu", async () => {
    const a = await admin();
    const target = await person(await role());
    const newRole = await role({ perms: [["zakazky.read", "all"]] });
    await app.db
      .insert(schema.session)
      .values({ token: newId(), userId: target.id, expiresAt: new Date(Date.now() + 3_600_000) });

    await setUserRole(a.ctx, target.id, newRole.id);
    const [u] = await app.db.select().from(schema.user).where(eq(schema.user.id, target.id));
    expect(u?.roleId).toBe(newRole.id);
    expect(
      await app.db.select().from(schema.session).where(eq(schema.session.userId, target.id)),
    ).toHaveLength(0);
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, target.id));
    expect(audit.find((x) => x.action === "update")?.changes[0]).toMatchObject({
      field: "role",
      new: newRole.name,
    });

    await expect(setUserRole(a.ctx, a.id, newRole.id)).rejects.toThrow(/vlastní roli/);
    await expect(setUserRole(a.ctx, newId(), newRole.id)).rejects.toThrow(NotFoundError);
    await expect(setUserRole(a.ctx, target.id, newId())).rejects.toThrow(/neexistuje/);
  });

  it("systémovou roli (majitele) přidělí, odebere ani deaktivuje jen majitel", async () => {
    const a = await admin();
    const sys = await role({ isSystem: true });
    const o = await person(sys, "Majitel");
    const victim = await person(await role());

    await expect(setUserRole(a.ctx, victim.id, sys.id)).rejects.toThrow(/jen majitel/);
    await expect(setUserActive(a.ctx, o.id, false)).rejects.toThrow(/jen majitel/);
    await expect(setUserRole(a.ctx, o.id, (await role()).id)).rejects.toThrow(/jen majitel/);
    await setUserRole(o.ctx, victim.id, sys.id); // majitel smí
    expect(
      (await app.db.select().from(schema.user).where(eq(schema.user.id, victim.id)))[0]?.roleId,
    ).toBe(sys.id);
  });

  it("poslední aktivní majitel nejde deaktivovat ani přeřadit, dokud není další", async () => {
    const sys = await role({ isSystem: true });
    const only = await person(sys, "Jediný majitel");
    const other = await owner(); // majitel v jiné systémové roli smí spravovat, ale poslední v roli nesmí zrušit
    const normal = await role();
    await expect(setUserActive(other.ctx, only.id, false)).rejects.toThrow(
      /zůstat alespoň jeden aktivní majitel/,
    );
    await expect(setUserRole(other.ctx, only.id, normal.id)).rejects.toThrow(
      /zůstat alespoň jeden aktivní majitel/,
    );

    const second = await person(sys, "Druhý majitel");
    await setUserActive(other.ctx, only.id, false); // teď je druhý → lze
    expect(
      (await app.db.select().from(schema.user).where(eq(schema.user.id, only.id)))[0]?.active,
    ).toBe(false);
    await expect(setUserActive(other.ctx, second.id, false)).rejects.toThrow(
      /zůstat alespoň jeden aktivní majitel/,
    );
  });

  it("deaktivace okamžitě ukončí relace; sám sebe deaktivovat nejde; obnovení účet vrátí", async () => {
    const a = await admin();
    const target = await person(await role());
    await app.db
      .insert(schema.session)
      .values({ token: newId(), userId: target.id, expiresAt: new Date(Date.now() + 3_600_000) });
    await setUserActive(a.ctx, target.id, false);
    expect(
      (await app.db.select().from(schema.user).where(eq(schema.user.id, target.id)))[0]?.active,
    ).toBe(false);
    expect(
      await app.db.select().from(schema.session).where(eq(schema.session.userId, target.id)),
    ).toHaveLength(0);
    expect(await loadActor(app.db, target.id)).toBeNull();
    await setUserActive(a.ctx, target.id, true);
    expect(await loadActor(app.db, target.id)).not.toBeNull();
    await expect(setUserActive(a.ctx, a.id, false)).rejects.toThrow(/Sami sebe/);
  });

  it("odhlášení ze všech zařízení: sebe kdykoli, cizí jen správce", async () => {
    const a = await admin();
    const u1 = await person(await role());
    const u2 = await person(await role());
    for (const id of [u1.id, u2.id])
      await app.db
        .insert(schema.session)
        .values({ token: newId(), userId: id, expiresAt: new Date(Date.now() + 3_600_000) });
    await revokeSessions(u1.ctx, u1.id);
    await expect(revokeSessions(u1.ctx, u2.id)).rejects.toThrow(PermissionError);
    await revokeSessions(a.ctx, u2.id);
    for (const id of [u1.id, u2.id])
      expect(
        await app.db.select().from(schema.session).where(eq(schema.session.userId, id)),
      ).toHaveLength(0);
  });

  it("správce pošle odkaz pro nastavení hesla (heslo nenastavuje); odkaz není v auditu", async () => {
    const a = await admin();
    const [acc] = await app.db
      .insert(schema.user)
      .values({ name: "Cíl", email: uniqueEmail("reset"), roleId: (await role()).id })
      .returning();
    await app.db
      .insert(schema.account)
      .values({ accountId: acc!.id, providerId: "credential", userId: acc!.id, password: "x" });
    await sendPasswordReset(a.ctx, { auth }, acc!.id);
    const mail = mailer.last("password-reset")!;
    expect(mail.to).toBe(acc!.email);
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, acc!.id));
    expect(JSON.stringify(audit)).not.toContain(new URL(mail.vars.url!).pathname.split("/").pop()!);
    await expect(
      sendPasswordReset((await person(await role())).ctx, { auth }, acc!.id),
    ).rejects.toThrow(PermissionError);
  });

  it("historii přihlášení vidí uživatel o sobě a správce o všech; jméno si každý změní sám", async () => {
    const a = await admin();
    const u = await person(await role());
    const other = await person(await role());
    await app.db
      .insert(schema.loginEvent)
      .values({ userId: u.id, outcome: "failed", ipAddress: "203.0.113.9" });
    expect((await listLoginEvents(u.ctx, u.id))[0]).toMatchObject({
      outcome: "failed",
      ipAddress: "203.0.113.9",
    });
    expect(await listLoginEvents(a.ctx, u.id)).toHaveLength(1);
    await expect(listLoginEvents(other.ctx, u.id)).rejects.toThrow(PermissionError);
    await updateOwnName(u.ctx, "Nové Jméno");
    expect((await app.db.select().from(schema.user).where(eq(schema.user.id, u.id)))[0]?.name).toBe(
      "Nové Jméno",
    );
    await expect(updateOwnName(u.ctx, "x")).rejects.toThrow(UserError);
  });

  it("pozvat do systémové role smí jen majitel", async () => {
    const a = await admin();
    const sys = await role({ isSystem: true });
    await expect(
      createInvitation(
        a.ctx,
        { email: uniqueEmail(), roleId: sys.id },
        { mailer, baseURL: "http://localhost:3000" },
      ),
    ).rejects.toThrow(/jen majitel/);
    const o = await owner();
    await expect(
      createInvitation(
        o.ctx,
        { email: uniqueEmail(), roleId: sys.id },
        { mailer, baseURL: "http://localhost:3000" },
      ),
    ).resolves.toBeDefined();
  });
});

describe("správa rolí", () => {
  it("výběr rolí pro přidělování vidí správce uživatelů i bez správy rolí, ostatní ne", async () => {
    const usersOnly = await person(await role({ perms: [["users.manage", "all"]] }));
    const plain = await person(await role());
    expect((await lookupRoles(usersOnly.ctx)).length).toBeGreaterThan(0);
    await expect(listRoles(usersOnly.ctx)).rejects.toThrow(PermissionError);
    await expect(lookupRoles(plain.ctx)).rejects.toThrow(PermissionError);
  });

  it("vytvoření, úprava a smazání role; klíč je unikátní; změny jdou do auditu", async () => {
    const a = await admin();
    const key = `r_${newId().slice(-8).replace(/-/g, "")}`;
    const r = await createRole(a.ctx, {
      key,
      name: "Skladník",
      description: "Sklad",
      require2fa: false,
    });
    await expect(createRole(a.ctx, { key, name: "Duplicita" })).rejects.toThrow(/už existuje/);
    await expect(createRole(a.ctx, { key: "Špatný klíč", name: "X" })).rejects.toThrow(/Klíč role/);
    await updateRole(a.ctx, r.id, { name: "Skladový referent", require2fa: true });
    const listed = (await listRoles(a.ctx)).find((x) => x.id === r.id)!;
    expect(listed).toMatchObject({ name: "Skladový referent", require2fa: true, userCount: 0 });
    await deleteRole(a.ctx, r.id);
    expect((await listRoles(a.ctx)).some((x) => x.id === r.id)).toBe(false);
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, r.id));
    expect(audit.map((x) => x.action).sort()).toEqual(["create", "delete", "update"]);
    await expect(
      createRole((await person(await role())).ctx, { key: "abc", name: "Nedovolené" }),
    ).rejects.toThrow(PermissionError);
  });

  it("oprávnění role: nastavení s rozsahem, kontrola proti katalogu, audit po jednotlivých oprávněních", async () => {
    const a = await admin();
    const r = await role();
    await setRolePermissions(a.ctx, r.id, { "zakazky.read": "own", "sklad.read": "all" }, catalog);
    await setRolePermissions(
      a.ctx,
      r.id,
      { "zakazky.read": "all", "zakazky.write": "own" },
      catalog,
    );
    const listed = (await listRoles(a.ctx)).find((x) => x.id === r.id)!;
    expect(listed.permissions).toEqual({ "zakazky.read": "all", "zakazky.write": "own" });

    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, r.id));
    const second = audit.filter((x) => x.action === "update").at(-1)!;
    expect(second.changes).toEqual(
      expect.arrayContaining([
        { field: "oprávnění sklad.read", old: "all", new: null },
        { field: "oprávnění zakazky.read", old: "own", new: "all" },
        { field: "oprávnění zakazky.write", old: null, new: "own" },
      ]),
    );
    await expect(
      setRolePermissions(a.ctx, r.id, { "neexistuje.read": "all" }, catalog),
    ).rejects.toThrow(/Neznámá oprávnění/);
    await expect(
      setRolePermissions(a.ctx, r.id, { "zakazky.read": "vsechno" as never }, catalog),
    ).rejects.toThrow(/Neplatný rozsah/);
  });

  it("systémovou roli nejde upravit, ořezat ani smazat; roli s uživateli nejde smazat", async () => {
    const a = await admin();
    const sys = await role({ isSystem: true });
    await expect(updateRole(a.ctx, sys.id, { name: "Jiné" })).rejects.toThrow(/Systémovou roli/);
    await expect(setRolePermissions(a.ctx, sys.id, {}, catalog)).rejects.toThrow(/systémové role/);
    await expect(deleteRole(a.ctx, sys.id)).rejects.toThrow(/Systémovou roli/);

    const used = await role();
    await person(used);
    await expect(deleteRole(a.ctx, used.id)).rejects.toThrow(/přiřazeno 1 uživatelů/);
  });
});

describe("údaje o firmě", () => {
  const settings = createSettings(
    createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") })),
  );
  it("uloží se, IČO se kontroluje a bez settings.manage nejde měnit", async () => {
    const a = await person(await role({ perms: [["settings.manage", "all"]] }));
    const plain = await person(await role());
    await settings.set(a.ctx, companySetting, {
      name: "Stavby Novák s.r.o.",
      ico: "12345678",
      email: "info@novak.cz",
    });
    expect(await settings.get(app.db, companySetting)).toMatchObject({
      name: "Stavby Novák s.r.o.",
      ico: "12345678",
    });
    await expect(settings.set(a.ctx, companySetting, { ico: "123" })).rejects.toThrow();
    await expect(settings.set(plain.ctx, companySetting, { name: "X" })).rejects.toThrow(
      PermissionError,
    );
  });
});
