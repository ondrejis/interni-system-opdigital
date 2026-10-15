import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { loadActor } from "../rbac/actor";
import { createCtx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { connectAppDb, uniqueEmail } from "../testing";
import { getAccount, updateOwnProfile } from "./account";
import { getOwnAppearance, updateOwnAppearance } from "./prefs";
import { listSecurityEvents, recordSecurityEvent } from "./security-events";
import { listTrustedDevices, revokeAllTrustedDevices, revokeTrustedDevice } from "./trusted-devices";
import {
  listManagedUsers,
  listUserSessions,
  revokeUserSession,
  updateUserFields,
} from "./user-admin";

const app = connectAppDb();
afterAll(() => app.close());

const catalog = new Set(["users.manage", "zakazky.read", "account.self"]);

async function makeUser(opts: { owner?: boolean; name?: string; shortName?: string | null } = {}) {
  const [role] = await app.db
    .insert(schema.role)
    .values({
      key: `ua-${newId().slice(-8)}`,
      name: "Role",
      isSystem: opts.owner ?? false,
    })
    .returning();
  const [u] = await app.db
    .insert(schema.user)
    .values({
      name: opts.name ?? "Test Uživatel",
      email: uniqueEmail("ua"),
      roleId: role!.id,
      shortName: opts.shortName ?? null,
    })
    .returning();
  const ctx = createCtx(app.db, (await loadActor(app.db, u!.id, { catalog }))!);
  return { id: u!.id, ctx };
}

describe("správa uživatelů (jen majitel)", () => {
  it("přehled obsahuje zkratku, IČO, nástroj a počet přihlášených zařízení; ostatní ho nevidí", async () => {
    const owner = await makeUser({ owner: true });
    const other = await makeUser();
    await app.db.insert(schema.session).values({
      userId: other.id,
      token: `t-${newId()}`,
      expiresAt: new Date(Date.now() + 3_600_000),
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605 Version/17.0 Safari/605.1",
    });
    const rows = await listManagedUsers(owner.ctx);
    const row = rows.find((r) => r.id === other.id)!;
    expect(row).toMatchObject({ ico: null, billingTool: null, sessionCount: 1 });
    await expect(listManagedUsers(other.ctx)).rejects.toBeInstanceOf(PermissionError);
    expect((await listUserSessions(owner.ctx, other.id))[0]!.label).toMatch(/Safari/);
    await expect(listUserSessions(other.ctx, owner.id)).rejects.toBeInstanceOf(PermissionError);
  });

  it("majitel nastaví zkratku, IČO a fakturační nástroj; změna je v historii před → po", async () => {
    const owner = await makeUser({ owner: true });
    const patrik = await makeUser({ name: "Patrik Šilhánek" });
    await updateUserFields(owner.ctx, {
      userId: patrik.id,
      shortName: "ps",
      ico: "45 274 649",
      billingTool: " Fakturoid ",
    });
    const [u] = await app.db.select().from(schema.user).where(eq(schema.user.id, patrik.id));
    expect(u).toMatchObject({ shortName: "PS", ico: "45274649", billingTool: "Fakturoid" });
    const [log] = await app.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityId, patrik.id), eq(schema.auditLog.action, "update")));
    expect(log!.changes.map((c) => c.field).sort()).toEqual(["billingTool", "ico", "shortName"]);

    // prázdná hodnota pole smaže; neuvedené pole zůstane
    await updateUserFields(owner.ctx, { userId: patrik.id, billingTool: "" });
    const [after] = await app.db.select().from(schema.user).where(eq(schema.user.id, patrik.id));
    expect(after).toMatchObject({ shortName: "PS", ico: "45274649", billingTool: null });
  });

  it("jiný uživatel pole měnit nesmí; neplatné nebo duplicitní IČO a zkratka se zamítnou", async () => {
    const owner = await makeUser({ owner: true });
    const a = await makeUser({ name: "Alena Nová" });
    const b = await makeUser({ name: "Boris Nový" });
    await expect(updateUserFields(a.ctx, { userId: b.id, ico: "45274649" })).rejects.toBeInstanceOf(
      PermissionError,
    );
    await expect(updateUserFields(owner.ctx, { userId: a.id, ico: "12345678" })).rejects.toThrow();
    await updateUserFields(owner.ctx, { userId: a.id, ico: "00006947", shortName: "XQ" });
    await expect(
      updateUserFields(owner.ctx, { userId: b.id, ico: "00006947" }),
    ).rejects.toThrow(/už je přiřazené/);
    await expect(
      updateUserFields(owner.ctx, { userId: b.id, shortName: "xq" }),
    ).rejects.toThrow(/už používá/);
    await expect(
      updateUserFields(owner.ctx, { userId: newId(), shortName: "ZZ" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("majitel odhlásí jedno zařízení cizího uživatele; sebe tak ne a cizí zařízení se tváří jako neexistující", async () => {
    const owner = await makeUser({ owner: true });
    const u = await makeUser();
    const v = await makeUser();
    const [s] = await app.db
      .insert(schema.session)
      .values({ userId: u.id, token: `t-${newId()}`, expiresAt: new Date(Date.now() + 3_600_000) })
      .returning();
    await expect(revokeUserSession(u.ctx, u.id, s!.id)).rejects.toBeInstanceOf(PermissionError);
    await expect(revokeUserSession(owner.ctx, v.id, s!.id)).rejects.toBeInstanceOf(NotFoundError);
    await revokeUserSession(owner.ctx, u.id, s!.id);
    expect(await app.db.select().from(schema.session).where(eq(schema.session.userId, u.id))).toHaveLength(0);
    const events = await listSecurityEvents(u.ctx);
    expect(events[0]).toMatchObject({ action: "revoke_session", actorName: expect.any(String) });
  });
});

describe("profil a vzhled", () => {
  it("uživatel si změní zkratku a barvu avataru; zkratka je mezi aktivními jedinečná; prázdná se odvodí z jména", async () => {
    const a = await makeUser({ name: "Ondřej Dvořák" });
    const b = await makeUser({ name: "Jiný Člověk" });
    await updateOwnProfile(a.ctx, {
      name: "Ondřej Dvořák",
      phone: null,
      shortName: "od",
      avatarColor: "teal",
    });
    expect(await getAccount(a.ctx)).toMatchObject({ shortName: "OD", avatarColor: "teal" });
    await expect(
      updateOwnProfile(b.ctx, { name: "Jiný Člověk", phone: null, shortName: "OD" }),
    ).rejects.toBeInstanceOf(UserError);
    await updateOwnProfile(a.ctx, { name: "Ondřej Dvořák", phone: null, shortName: "" });
    expect((await getAccount(a.ctx)).shortName).toBe("OD"); // odvozeno z jména
    // neuvedená pole zůstanou: barva se bez klíče nemění
    expect((await getAccount(a.ctx)).avatarColor).toBe("teal");
    await updateOwnProfile(a.ctx, { name: "Ondřej Dvořák", phone: null, avatarColor: null });
    expect((await getAccount(a.ctx)).avatarColor).toBeNull();
  });

  it("IČO a fakturační nástroj si uživatel sám změnit nemůže (profil je nemá)", async () => {
    const a = await makeUser();
    await updateOwnProfile(a.ctx, {
      name: "Test Uživatel",
      phone: null,
      ico: "45274649",
      billingTool: "Excel",
    } as never);
    const [u] = await app.db.select().from(schema.user).where(eq(schema.user.id, a.id));
    expect(u).toMatchObject({ ico: null, billingTool: null });
  });

  it("vzhled: výchozí hodnoty, změna jednoho klíče nepřepíše ostatní ani cizí klíče v předvolbách", async () => {
    const a = await makeUser();
    expect(await getOwnAppearance(a.ctx)).toEqual({
      theme: "system",
      density: "comfortable",
      startPage: null,
    });
    await app.db
      .update(schema.user)
      .set({ prefs: { lastFilter: { q: "x" } } })
      .where(eq(schema.user.id, a.id));
    await updateOwnAppearance(a.ctx, { theme: "dark" }, ["/prehled"]);
    await updateOwnAppearance(a.ctx, { density: "compact" }, ["/prehled"]);
    await updateOwnAppearance(a.ctx, { startPage: "/prehled" }, ["/prehled", "/obchody"]);
    expect(await getOwnAppearance(a.ctx)).toEqual({
      theme: "dark",
      density: "compact",
      startPage: "/prehled",
    });
    const [u] = await app.db
      .select({ prefs: schema.user.prefs })
      .from(schema.user)
      .where(eq(schema.user.id, a.id));
    expect(u!.prefs).toMatchObject({ lastFilter: { q: "x" }, theme: "dark" });
    // zrušení úvodní stránky; nedostupná stránka se nepřijme
    await updateOwnAppearance(a.ctx, { startPage: null }, []);
    expect((await getOwnAppearance(a.ctx)).startPage).toBeNull();
    await expect(
      updateOwnAppearance(a.ctx, { startPage: "/finance" }, ["/prehled"]),
    ).rejects.toThrow(/nemáte přístup/);
    await expect(updateOwnAppearance(a.ctx, { theme: "neon" as never }, [])).rejects.toThrow();
  });
});

describe("důvěryhodná zařízení: správa", () => {
  async function trust(userId: string, ageHours = 0) {
    const [row] = await app.db
      .insert(schema.verification)
      .values({
        identifier: `trust-device-${newId().replace(/-/g, "")}`,
        value: userId,
        expiresAt: new Date(Date.now() + 30 * 86_400_000 - ageHours * 3_600_000),
      })
      .returning();
    return row!;
  }

  it("uživatel vidí jen svá platná zařízení, jedno nebo všechna odvolá; cizí zařízení se tváří jako neexistující", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const d1 = await trust(a.id);
    const d2 = await trust(a.id, 5);
    const expired = await trust(a.id);
    await app.db
      .update(schema.verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.verification.id, expired.id));
    const other = await trust(b.id);

    const list = await listTrustedDevices(a.ctx, `better-auth.trust_device=x!${d2.identifier}.sig`);
    expect(list.map((d) => d.id)).toEqual([d1.id, d2.id]);
    expect(list.map((d) => d.current)).toEqual([false, true]);

    await expect(revokeTrustedDevice(a.ctx, other.id)).rejects.toBeInstanceOf(NotFoundError);
    await revokeTrustedDevice(a.ctx, d1.id);
    expect((await listTrustedDevices(a.ctx)).map((d) => d.id)).toEqual([d2.id]);
    expect(await revokeAllTrustedDevices(a.ctx)).toBe(1);
    expect(await listTrustedDevices(a.ctx)).toEqual([]);
    expect(await listTrustedDevices(b.ctx)).toHaveLength(1);
    const events = await listSecurityEvents(a.ctx);
    expect(events.map((e) => e.action)).toEqual(
      expect.arrayContaining(["trusted_device_revoked", "trusted_devices_revoked"]),
    );
  });
});

describe("bezpečnostní události: zápis", () => {
  it("neznámý účet jde do historie pod `unknown`, bez e-mailu a hesla; vidí ho jen majitel", async () => {
    const owner = await makeUser({ owner: true });
    await recordSecurityEvent(app.db, {
      action: "login_failed",
      userId: null,
      actorId: null,
      summary: "Neúspěšné přihlášení neznámého účtu",
      ip: "203.0.113.9",
    });
    const [row] = await app.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityId, "unknown"), eq(schema.auditLog.ip, "203.0.113.9")));
    expect(row).toMatchObject({
      category: "security",
      actorId: null,
      actorKind: "system",
      isPrivate: false,
    });
    await expect(listSecurityEvents(owner.ctx, { userId: "unknown" })).resolves.toBeInstanceOf(Array);
  });
});
