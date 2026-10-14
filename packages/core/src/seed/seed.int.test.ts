import { and, eq, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getLookup } from "../config-data/lookups";
import { getPipeline } from "../config-data/pipelines";
import { listVatRates } from "../config-data/vat";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { nextNumber } from "../numbering";
import { bootstrapOwner } from "../auth/bootstrap";
import { safeEqual, isSameOrigin, consumeRateLimit } from "../http";
import { connectAppDb, createTestAuth, fakeMailer, uniqueEmail } from "../testing";
import { ensureRoles } from "../rbac/seed";
import { defineSeed, runSeed } from "./seed";
import { UserError } from "../rbac/errors";

const app = connectAppDb();
afterAll(() => app.close());
const k = () => `s${newId().slice(-10).replace(/-/g, "")}`;
const rolePerms = async (key: string) => {
  const [role] = await app.db
    .select()
    .from(schema.role)
    .where(and(eq(schema.role.key, key), isNull(schema.role.deletedAt)));
  const perms = role
    ? await app.db
        .select()
        .from(schema.rolePermission)
        .where(eq(schema.rolePermission.roleId, role.id))
    : [];
  return { role, perms: Object.fromEntries(perms.map((p) => [p.permission, p.scope])) };
};

describe("ensureRoles", () => {
  it("založí roli s oprávněními a rozsahem; true = all; klíče mimo katalog přeskočí", async () => {
    const key = k();
    await ensureRoles(
      app.db,
      [
        {
          key,
          name: "Montér",
          permissions: { "zakazky.read": "own", "dochazka.own": true, "sklad.read": "all" },
        },
      ],
      { catalog: new Set(["zakazky.read", "dochazka.own"]) },
    );
    const { role, perms } = await rolePerms(key);
    expect(role?.name).toBe("Montér");
    expect(perms).toEqual({ "zakazky.read": "own", "dochazka.own": "all" }); // sklad není v katalogu (vypnutý modul)
  });

  it("existující roli nemění (správce ji upravil), jen dorovná povinné 2FA", async () => {
    const key = k();
    await ensureRoles(app.db, [{ key, name: "Kancelář", permissions: { "kontakty.read": "all" } }]);
    await app.db
      .update(schema.role)
      .set({ name: "Upraveno správcem" })
      .where(eq(schema.role.key, key));
    await app.db
      .delete(schema.rolePermission)
      .where(eq(schema.rolePermission.permission, "kontakty.read"));

    await ensureRoles(
      app.db,
      [{ key, name: "Kancelář", permissions: { "kontakty.read": "all", "zakazky.read": "all" } }],
      { require2faRoles: [key] },
    );
    const { role, perms } = await rolePerms(key);
    expect(role?.name).toBe("Upraveno správcem");
    expect(role?.require2fa).toBe(true);
    expect(perms["zakazky.read"]).toBeUndefined(); // oprávnění se nepřidávají zpětně
  });

  it("povinné 2FA z konfigurace se nikdy nesnižuje", async () => {
    const key = k();
    await ensureRoles(app.db, [{ key, name: "X" }], { require2faRoles: [key] });
    await ensureRoles(app.db, [{ key, name: "X" }], { require2faRoles: [] });
    expect((await rolePerms(key)).role?.require2fa).toBe(true);
  });
});

describe("runSeed", () => {
  it("založí role, pipeline, číselníky, řady a sazby DPH; opakované spuštění nic nezdvojí", async () => {
    const t = k();
    const seed = defineSeed({
      roles: [{ key: `owner-${t}`, name: "Majitel", isSystem: true }],
      pipelines: [
        {
          entityType: t,
          key: "default",
          name: "Zakázky",
          stages: [{ name: "Příprava" }, { name: "Hotovo", kind: "done" }],
        },
      ],
      lookups: [{ key: `zdroje-${t}`, name: "Zdroje", items: [{ value: "web", label: "Web" }] }],
      series: [{ key: `faktury-${t}`, pattern: "FV-{YYYY}-{NNNN}" }],
    });
    const opts = {
      config: { security: { idleTimeoutMinutes: 480, require2faRoles: [`owner-${t}`] } },
      catalog: new Set<string>(),
    };
    await runSeed(app.db, seed, opts);
    await runSeed(app.db, seed, opts);

    expect((await rolePerms(`owner-${t}`)).role).toMatchObject({
      isSystem: true,
      require2fa: true,
    });
    expect((await getPipeline(app.db, t, "default"))?.stages).toHaveLength(2);
    expect(await getLookup(app.db, `zdroje-${t}`)).toHaveLength(1);
    expect(await nextNumber(app.db, `faktury-${t}`, new Date(2026, 0, 1))).toBe("FV-2026-0001");
    const vat = await listVatRates(app.db, "2026-10-08");
    const byCode = Object.fromEntries(vat.map((v) => [v.code, v.rateBp]));
    expect(byCode).toMatchObject({ standard: 2100, reduced: 1200, zero: 0 });
    expect(vat.filter((v) => v.code === "standard")).toHaveLength(1);
  });
});

describe("bootstrapOwner", () => {
  const auth = createTestAuth(app.db, fakeMailer());

  it("založí prvního uživatele s rolí owner; podruhé nic; přihlásí se zadaným heslem", async () => {
    await ensureRoles(app.db, [{ key: "owner", name: "Majitel", isSystem: true }]);
    const email = uniqueEmail("owner");
    const first = await bootstrapOwner(
      { auth, db: app.db },
      { email, name: "Jan Majitel", password: "dostatecne-dlouhe-heslo" },
    );
    expect(first.created).toBe(true);
    const second = await bootstrapOwner(
      { auth, db: app.db },
      { email: email.toUpperCase(), name: "Jan Majitel", password: "jine-dlouhe-heslo-123" },
    );
    expect(second).toEqual({ userId: first.userId, created: false });
    await expect(
      auth.api.signInEmail({ body: { email, password: "dostatecne-dlouhe-heslo" } }),
    ).resolves.toBeDefined();
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, first.userId));
    expect(audit[0]).toMatchObject({ actorKind: "system", action: "create" });
  });

  it("krátké heslo a chybějící role se odmítnou srozumitelnou chybou", async () => {
    await expect(
      bootstrapOwner(
        { auth, db: app.db },
        { email: uniqueEmail(), name: "X Y", password: "krátké" },
      ),
    ).rejects.toThrow(UserError);
    await expect(
      bootstrapOwner(
        { auth, db: app.db },
        {
          email: uniqueEmail(),
          name: "X Y",
          password: "dostatecne-dlouhe-heslo",
          roleKey: "neexistuje",
        },
      ),
    ).rejects.toThrow(/neexistuje/);
  });
});

describe("HTTP pomocníci", () => {
  it("safeEqual porovnává tajemství bez ohledu na délku vstupu", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });

  it("isSameOrigin: povolí jen naši adresu (Origin, jinak Referer); bez hlaviček odmítne", () => {
    const app = "https://system.example.cz";
    expect(isSameOrigin(new Headers({ origin: app }), app)).toBe(true);
    expect(isSameOrigin(new Headers({ origin: "https://evil.example" }), app)).toBe(false);
    expect(
      isSameOrigin(new Headers({ origin: "https://system.example.cz.evil.example" }), app),
    ).toBe(false);
    expect(isSameOrigin(new Headers({ referer: `${app}/zakazky/1` }), app)).toBe(true);
    expect(isSameOrigin(new Headers({ referer: "https://evil.example/x" }), app)).toBe(false);
    expect(isSameOrigin(new Headers({ referer: "není url" }), app)).toBe(false);
    expect(isSameOrigin(new Headers(), app)).toBe(false);
  });

  it("consumeRateLimit: povolí limit požadavků v okně, pak odmítá, po uplynutí okna znovu povolí", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
      const key = `test:${newId()}`;
      const results: boolean[] = [];
      for (let i = 0; i < 5; i++) results.push(await consumeRateLimit(app.db, key, 3, 60));
      expect(results).toEqual([true, true, true, false, false]);
      vi.setSystemTime(new Date("2026-10-08T10:01:01Z"));
      expect(await consumeRateLimit(app.db, key, 3, 60)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
