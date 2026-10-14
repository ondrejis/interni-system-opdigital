import { describe, expect, it } from "vitest";
import { createCtx, SYSTEM_ACTOR } from "./context";
import { assertCan, can, requireScope, scopeOf } from "./permissions";
import { PermissionError } from "./errors";
import type { Actor, Scope } from "./types";

const actor = (perms: Record<string, Scope>, over: Partial<Actor> = {}): Actor => ({
  kind: "user",
  userId: "u1",
  roleKey: "test",
  permissions: new Map(Object.entries(perms)),
  unrestricted: false,
  restriction: null,
  ...over,
});
const ctx = (a: Actor) => createCtx({} as never, a);

describe("oprávnění a rozsah", () => {
  it("bez oprávnění nic nesmí", () => {
    const c = ctx(actor({}));
    expect(scopeOf(c, "zakazky.read")).toBeNull();
    expect(can(c, "zakazky.read")).toBe(false);
    expect(() => assertCan(c, "zakazky.read")).toThrow(PermissionError);
    expect(() => requireScope(c, "zakazky.read")).toThrow(PermissionError);
  });

  it("rozsah all smí všechny záznamy", () => {
    const c = ctx(actor({ "zakazky.read": "all" }));
    expect(can(c, "zakazky.read", { ownerIds: ["jiny"] })).toBe(true);
  });

  it("rozsah own smí jen záznamy, kde je aktér vlastníkem", () => {
    const c = ctx(actor({ "zakazky.read": "own" }));
    expect(can(c, "zakazky.read")).toBe(true); // „má vůbec přístup“
    expect(can(c, "zakazky.read", { ownerIds: ["jiny", null] })).toBe(false);
    expect(can(c, "zakazky.read", { ownerIds: ["jiny", "u1"] })).toBe(true);
    expect(() => assertCan(c, "zakazky.read", { ownerIds: [] })).toThrow(PermissionError);
  });

  it("omezená relace (chybí 2FA) smí jen self-service", () => {
    const c = ctx(
      actor({ "zakazky.read": "all", "account.self": "all" }, { restriction: "2fa_setup" }),
    );
    expect(can(c, "zakazky.read")).toBe(false);
    expect(can(c, "account.self")).toBe(true);
  });

  it("systémový aktér smí všechno", () => {
    const c = ctx(SYSTEM_ACTOR);
    expect(can(c, "cokoli.write", { ownerIds: [] })).toBe(true);
  });

  it("omezení má přednost i před systémovým aktérem označeným jako unrestricted", () => {
    const c = ctx(actor({}, { unrestricted: true, restriction: "2fa_setup" }));
    expect(can(c, "zakazky.read")).toBe(false);
  });
});
