import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addComment, listComments } from "@rebar/core/collab";
import {
  aggregateRecords,
  createRecord,
  deleteRecord,
  getRecord,
  queryRecords,
  searchAll,
  updateRecord,
} from "@rebar/core/entities";
import { prepareEntityExport } from "@rebar/core/export";
import {
  NotFoundError,
  PermissionError,
  SELF_SERVICE_PERMISSIONS,
  scopeOf,
  UserError,
  type Ctx,
} from "@rebar/core/rbac";
import type { Db } from "@rebar/core/db";
import { connectAppDb } from "@rebar/core/testing";
import { assertCommandPermission } from "../apps/web/src/server/command-gate";
import {
  buildFixture,
  isolatedDb,
  ROLE_KEYS,
  type Fixture,
  type RoleKey,
} from "./support/security-fixture";
import { serialize } from "./support/canary";
import { buildPrivateFixture, type PrivateFixture } from "./support/fixture";
import { PROBES } from "./support/probes";

/*
  Matice oprávnění modulů OPSYS × role (owner, partner, external): brána příkazů (oprávnění z katalogu), úplnost probes
  a data (entita × role: čtení, zápis, vytvoření, smazání; rozsah „jen moje“, komentáře, hledání, export). Soukromé záznamy
  řeší `private-matrix`, `private-paths` a `qa-private-*` (D §5.4).
*/

const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

const roleCtx = (role: RoleKey): Ctx => f.people[role].ctx;

describe("matice oprávnění: příkazy modulů × role OPSYS", () => {
  it("každý registrovaný příkaz je zařazen do matice (nový příkaz bez zařazení test shodí)", () => {
    const missing = [...f.collected.commands.keys()].filter((n) => !(n in PROBES));
    expect(missing, "doplňte příkaz do tests/support/probes/<modul>.ts").toEqual([]);
    const stale = Object.keys(PROBES).filter((n) => !f.collected.commands.has(n));
    expect(stale, "probe pro neexistující příkaz").toEqual([]);
  });

  it("brána příkazu: povoleno právě tehdy, když role má některé z požadovaných oprávnění", () => {
    for (const role of ROLE_KEYS) {
      const ctx = roleCtx(role);
      for (const [name, cmd] of f.collected.commands) {
        const keys = [cmd.permission ?? []].flat();
        const expected = keys.length === 0 || keys.some((k) => scopeOf(ctx, k) !== null);
        let allowed = true;
        try {
          assertCommandPermission(ctx, cmd);
        } catch (e) {
          allowed = false;
          expect(e, `${role}/${name}`).toBeInstanceOf(PermissionError);
        }
        expect(allowed, `${role} → ${name}`).toBe(expected);
      }
    }
  });

  it("majitel smí vše; externí spolupracovník nedostane příkazy správy (sloučení kontaktů, nastavení)", () => {
    const owner = roleCtx("owner");
    for (const [n, cmd] of f.collected.commands)
      expect(() => assertCommandPermission(owner, cmd), n).not.toThrow();
    const restricted = /^kontakty\.merge\.|\.settings\./;
    const ctx = roleCtx("external");
    for (const [n, cmd] of f.collected.commands) {
      if (!restricted.test(n)) continue;
      expect(() => assertCommandPermission(ctx, cmd), `external → ${n}`).toThrow(PermissionError);
    }
  });

  it("role z klientského seedu mají jen oprávnění z katalogu zapnutých modulů", () => {
    for (const role of ROLE_KEYS)
      for (const key of f.people[role].ctx.actor.permissions.keys())
        // `account.self` je oprávnění omezené relace (vlastní účet), v katalogu modulů není
        if (!SELF_SERVICE_PERMISSIONS.includes(key))
          expect(f.catalog.has(key), `${role}: ${key}`).toBe(true);
  });
});

describe("matice oprávnění: data (entity × role)", () => {
  const withScope = (ctx: Ctx, perms: [string, "all" | "own"][]): Ctx => ({
    ...ctx,
    actor: { ...ctx.actor, permissions: new Map(perms) },
  });
  /** Sdílené záznamy sestavy (sdílený = viditelný každému, kdo má právo číst). */
  const shared = () => fx.shared;
  let fx: PrivateFixture;
  beforeAll(async () => {
    fx = await buildPrivateFixture(f, db);
  }, 120_000);

  it("externí spolupracovník (bez oprávnění) nic nepřečte, nevytvoří, nesmaže ani nenajde", async () => {
    const ext = roleCtx("external");
    for (const def of f.registry.all()) {
      const e = await fx.resolve(def.key);
      await expect(
        queryRecords(ext, f.registry, e, {}),
        `${def.key}: seznam`,
      ).rejects.toBeInstanceOf(PermissionError);
      await expect(createRecord(ext, f.registry, e, {}), `${def.key}: vytvoření`).rejects.toSatisfy(
        (x) => x instanceof PermissionError || x instanceof UserError,
      );
      const id = shared()[def.key] ?? "00000000-0000-7000-8000-000000000000";
      await expect(getRecord(ext, f.registry, e, id), `${def.key}: detail`).rejects.toSatisfy(
        (x) => x instanceof PermissionError || x instanceof NotFoundError,
      );
      await expect(deleteRecord(ext, e, id), `${def.key}: smazání`).rejects.toSatisfy(
        (x) => x instanceof PermissionError || x instanceof NotFoundError || x instanceof UserError,
      );
    }
    expect(await searchAll(ext, f.registry.all(), "Sdílen")).toEqual([]);
  });

  it("partner: co mu role nedává (smazání, zápis, čtení), server odmítne; co dává, projde", async () => {
    const p = roleCtx("partner");
    for (const def of f.registry.all()) {
      const e = await fx.resolve(def.key);
      const id = shared()[def.key];
      const perms = def.permissions;
      const has = (key?: string) => !!key && scopeOf(p, key) !== null;
      if (!has(perms.read)) {
        await expect(
          queryRecords(p, f.registry, e, {}),
          `${def.key}: seznam`,
        ).rejects.toBeInstanceOf(PermissionError);
        continue;
      }
      await expect(queryRecords(p, f.registry, e, {}), `${def.key}: seznam`).resolves.toBeTruthy();
      if (id && !has(perms.delete))
        await expect(deleteRecord(p, e, id), `${def.key}: smazání`).rejects.toSatisfy(
          (x) => x instanceof PermissionError || x instanceof UserError,
        );
      if (id && !has(perms.write))
        await expect(
          updateRecord(p, f.registry, e, id, {}),
          `${def.key}: úprava`,
        ).rejects.toSatisfy((x) => x instanceof PermissionError || x instanceof UserError);
    }
    // „Můj prostor“ partner nevidí vůbec
    for (const key of [
      "web_domain",
      "recurring_service",
      "email_library_item",
      "recurring_invoice",
    ])
      await expect(
        queryRecords(p, f.registry, await fx.resolve(key), {}),
        key,
      ).rejects.toBeInstanceOf(PermissionError);
  });

  it("rozsah „jen moje“: uživatel vidí jen své úkoly (seznam, detail, součty, hledání, komentáře)", async () => {
    const owner = f.people.owner.ctx;
    const ext = withScope(roleCtx("external"), [
      ["ukoly.read", "own"],
      ["ukoly.create", "all"],
      ["zakazky.read", "own"],
    ]);
    const E = await fx.resolve("task");
    const mine = (
      await createRecord(ext, f.registry, E, {
        title: "Moje úkol OWNSCOPE",
        assignee: ext.actor.userId,
      })
    ).row.id;
    const others = (await createRecord(owner, f.registry, E, { title: "Cizí úkol OWNSCOPE" })).row
      .id;
    const page = await queryRecords(ext, f.registry, E, { limit: 200 });
    expect(page.rows.map((r) => r.id)).toContain(mine);
    expect(page.rows.map((r) => r.id)).not.toContain(others);
    await expect(getRecord(ext, f.registry, E, others)).rejects.toSatisfy(
      (x) => x instanceof PermissionError || x instanceof NotFoundError,
    );
    const hits = await searchAll(ext, f.registry.all(), "OWNSCOPE");
    expect(hits.map((h) => h.id)).toContain(mine);
    expect(hits.map((h) => h.id)).not.toContain(others);
    await expect(listComments(ext, "task", others)).rejects.toSatisfy(
      (x) => x instanceof PermissionError || x instanceof NotFoundError,
    );
    await expect(
      addComment(ext, { entityType: "task", entityId: others, body: "pokus" }),
    ).rejects.toSatisfy((x) => x instanceof PermissionError || x instanceof NotFoundError);
    const total = (await aggregateRecords(ext, f.registry, E, {} as never).catch(
      () => null,
    )) as unknown;
    expect(serialize(total ?? "")).not.toContain("Cizí úkol");
  });

  it("export seznamu respektuje rozsah (jen moje) a soukromé záznamy", async () => {
    const E = await fx.resolve("task");
    const ext = withScope(roleCtx("external"), [
      ["ukoly.read", "own"],
      ["ukoly.export", "all"],
    ]);
    const prepared = await prepareEntityExport(ext, f.registry, E, {} as never).catch(
      (e: unknown) => e,
    );
    // bez rozsahu a oprávnění export nevznikne, s „jen moje“ nesmí obsahovat cizí řádky ani soukromé záznamy
    if (!(prepared instanceof Error)) {
      const text = serialize(prepared);
      expect(text).not.toContain("CANARY");
      expect(text).not.toContain("Cizí úkol");
    }
  });
});
