import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { recordAudit } from "../audit";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { connectAppDb, uniqueEmail } from "../testing";
import { loadActor } from "./actor";
import { createCtx, inTx, systemCtx } from "./context";
import { can, scopedWhere } from "./permissions";

const app = connectAppDb();
afterAll(() => app.close());

async function setup(
  opts: {
    isSystem?: boolean;
    require2fa?: boolean;
    twoFactorEnabled?: boolean;
    perms?: [string, "all" | "own"][];
  } = {},
) {
  const [role] = await app.db
    .insert(schema.role)
    .values({
      key: `r-${newId().slice(-8)}`,
      name: "Test",
      isSystem: opts.isSystem ?? false,
      require2fa: opts.require2fa ?? false,
    })
    .returning();
  if (opts.perms?.length) {
    await app.db
      .insert(schema.rolePermission)
      .values(opts.perms.map(([permission, scope]) => ({ roleId: role!.id, permission, scope })));
  }
  const [user] = await app.db
    .insert(schema.user)
    .values({
      name: "T",
      email: uniqueEmail(),
      roleId: role!.id,
      twoFactorEnabled: opts.twoFactorEnabled ?? false,
    })
    .returning();
  return { role: role!, user: user! };
}

describe("loadActor", () => {
  it("načte oprávnění role včetně rozsahu", async () => {
    const { user } = await setup({
      perms: [
        ["zakazky.read", "own"],
        ["zakazky.write", "all"],
      ],
    });
    const actor = await loadActor(app.db, user.id);
    expect(actor?.permissions.get("zakazky.read")).toBe("own");
    expect(actor?.permissions.get("zakazky.write")).toBe("all");
    expect(actor?.restriction).toBeNull();
  });

  it("zahodí oprávnění modulů, které nejsou v katalogu (vypnutý modul)", async () => {
    const { user } = await setup({
      perms: [
        ["zakazky.read", "all"],
        ["sklad.read", "all"],
      ],
    });
    const actor = await loadActor(app.db, user.id, { catalog: new Set(["zakazky.read"]) });
    expect([...actor!.permissions.keys()].sort()).toEqual(["account.self", "zakazky.read"]);
  });

  it("systémová role dostane všechna oprávnění katalogu", async () => {
    const { user } = await setup({ isSystem: true });
    const actor = await loadActor(app.db, user.id, { catalog: new Set(["a.read", "b.write"]) });
    expect(actor?.permissions.get("a.read")).toBe("all");
    expect(actor?.permissions.get("b.write")).toBe("all");
  });

  it("deaktivovaný nebo smazaný uživatel aktér není", async () => {
    const a = await setup();
    await app.db.update(schema.user).set({ active: false }).where(eq(schema.user.id, a.user.id));
    expect(await loadActor(app.db, a.user.id)).toBeNull();
    const b = await setup();
    await app.db
      .update(schema.user)
      .set({ deletedAt: new Date() })
      .where(eq(schema.user.id, b.user.id));
    expect(await loadActor(app.db, b.user.id)).toBeNull();
    expect(await loadActor(app.db, newId())).toBeNull();
  });

  it("role s povinným 2FA bez nastaveného 2FA dá omezenou relaci", async () => {
    const { user } = await setup({ require2fa: true, perms: [["zakazky.read", "all"]] });
    const actor = await loadActor(app.db, user.id);
    expect(actor?.restriction).toBe("2fa_setup");
    expect(can(createCtx(app.db, actor!), "zakazky.read")).toBe(false);

    await app.db
      .update(schema.user)
      .set({ twoFactorEnabled: true })
      .where(eq(schema.user.id, user.id));
    const after = await loadActor(app.db, user.id);
    expect(after?.restriction).toBeNull();
    expect(can(createCtx(app.db, after!), "zakazky.read")).toBe(true);
  });
});

describe("scopedWhere v dotazu", () => {
  it("rozsah own vrátí jen záznamy aktéra, all všechny, bez oprávnění chyba", async () => {
    const mine = await setup({ perms: [["audit.read", "own"]] });
    const other = await setup();
    const marker = `scope-${newId()}`;
    const sys = systemCtx(app.db);
    await recordAudit(
      { ...sys, actor: { ...sys.actor, userId: mine.user.id, kind: "user" } },
      { action: "t", entityType: marker, entityId: "1" },
    );
    await recordAudit(
      { ...sys, actor: { ...sys.actor, userId: other.user.id, kind: "user" } },
      { action: "t", entityType: marker, entityId: "2" },
    );

    const list = async (ctx: ReturnType<typeof createCtx>) =>
      app.db
        .select({ id: schema.auditLog.entityId })
        .from(schema.auditLog)
        .where(
          and2(
            eq(schema.auditLog.entityType, marker),
            scopedWhere(ctx, "audit.read", [schema.auditLog.actorId]),
          ),
        );

    const ownCtx = createCtx(app.db, (await loadActor(app.db, mine.user.id))!);
    expect((await list(ownCtx)).map((r) => r.id)).toEqual(["1"]);

    const allUser = await setup({ perms: [["audit.read", "all"]] });
    const allCtx = createCtx(app.db, (await loadActor(app.db, allUser.user.id))!);
    expect((await list(allCtx)).map((r) => r.id).sort()).toEqual(["1", "2"]);

    const none = await setup();
    const noneCtx = createCtx(app.db, (await loadActor(app.db, none.user.id))!);
    expect(() => scopedWhere(noneCtx, "audit.read", [schema.auditLog.actorId])).toThrow();
  });
});

describe("audit v transakci", () => {
  it("zápis auditu se vrátí spolu s transakcí", async () => {
    const marker = `tx-${newId()}`;
    const ctx = systemCtx(app.db);
    await expect(
      inTx(ctx, async (tx) => {
        await recordAudit(tx, {
          action: "create",
          entityType: marker,
          entityId: "1",
          changes: [{ field: "a", old: null, new: 1 }],
        });
        throw new Error("selhání po zápisu");
      }),
    ).rejects.toThrow("selhání");
    const rows = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityType, marker));
    expect(rows).toHaveLength(0);
  });

  it("potvrzená transakce zapíše audit s aktérem, požadavkem a maskovanými tajemstvími", async () => {
    const { user } = await setup();
    const marker = `ok-${newId()}`;
    const actor = (await loadActor(app.db, user.id))!;
    const ctx = createCtx(app.db, actor, { requestId: "req-1", ip: "203.0.113.5" });
    await inTx(ctx, (tx) =>
      recordAudit(tx, {
        action: "update",
        entityType: marker,
        entityId: "9",
        summary: "test",
        changes: [{ field: "passwordHash", old: "a", new: "b" }],
      }),
    );
    const [row] = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityType, marker));
    expect(row).toMatchObject({
      actorKind: "user",
      actorId: user.id,
      requestId: "req-1",
      ip: "203.0.113.5",
      action: "update",
    });
    expect(row?.changes).toEqual([{ field: "passwordHash", old: "***", new: "***" }]);
  });
});

import { and } from "drizzle-orm";
const and2 = and;
