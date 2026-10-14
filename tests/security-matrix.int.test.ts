import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PermissionError, SELF_SERVICE_PERMISSIONS, scopeOf, type Ctx } from "@rebar/core/rbac";
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
import { PROBES } from "./support/probes";

/*
  Matice oprávnění modulů OPSYS × role (owner, partner, external). Kostra po S0: platí brána příkazů (oprávnění z katalogu)
  a úplnost probes; datové části (cizí záznamy, rozsah „jen moje“, soubory, komentáře, export) čekají na novou sestavu
  od QA-SEC, protože modely modulů se přepracovávají (starý test: `packages/_donor/tests/security/`).
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

describe("matice oprávnění: data (čeká na QA-SEC)", () => {
  it.todo(
    "entity × role: čtení, zápis, vytvoření, smazání (bez oprávnění PermissionError, rozsah „jen moje“)",
  );
  it.todo("external vidí jen své záznamy: seznam, detail, úprava, smazání, hledání");
  it.todo("soubory, komentáře a úkoly se řídí oprávněním k záznamu");
  it.todo("export seznamu respektuje rozsah a soukromé záznamy");
});
