import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCtx } from "../rbac/context";
import { PermissionError, UserError } from "../rbac/errors";
import type { Actor } from "../rbac/types";
import { makeActionRunner } from "./run";

const actor: Actor = {
  kind: "user",
  userId: "u1",
  roleKey: "x",
  permissions: new Map([["zakazky.write", "all"]]),
  unrestricted: false,
  restriction: null,
};

function runner(
  ctxFactory: () => ReturnType<typeof createCtx> | null = () => createCtx({} as never, actor),
) {
  const onError = vi.fn();
  return {
    onError,
    defineAction: makeActionRunner({ resolveCtx: async () => ctxFactory(), onError }),
  };
}

describe("defineAction", () => {
  const input = z.object({ title: z.string().min(2, "Vyplňte název.") });

  it("spustí handler s kontextem a validovaným vstupem", async () => {
    const { defineAction } = runner();
    const act = defineAction({
      permission: "zakazky.write",
      input,
      handler: async (ctx, i) => `${ctx.actor.userId}:${i.title}`,
    });
    expect(await act({ title: "Dům" })).toEqual({ ok: true, data: "u1:Dům" });
  });

  it("bez přihlášení vrátí chybu a handler nespustí", async () => {
    const { defineAction } = runner(() => null);
    const handler = vi.fn();
    const res = await defineAction({ input, handler })({ title: "Dům" });
    expect(res).toMatchObject({ ok: false, code: "forbidden" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("bez oprávnění vrátí chybu a handler nespustí", async () => {
    const { defineAction } = runner();
    const handler = vi.fn();
    const res = await defineAction({ permission: "fakturace.write", input, handler })({
      title: "Dům",
    });
    expect(res).toMatchObject({ ok: false, code: "forbidden" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("stačí jedno z více oprávnění", async () => {
    const { defineAction } = runner();
    const res = await defineAction({
      permission: ["fakturace.write", "zakazky.write"],
      input,
      handler: async () => 1,
    })({ title: "Dům" });
    expect(res).toEqual({ ok: true, data: 1 });
  });

  it("špatný vstup vrátí první českou hlášku validace", async () => {
    const { defineAction } = runner();
    const res = await defineAction({ input, handler: async () => 1 })({ title: "x" });
    expect(res).toEqual({ ok: false, error: "Vyplňte název.", code: "invalid_input" });
  });

  it("UserError a PermissionError z handleru projdou, neočekávaná chyba se skryje a nahlásí", async () => {
    const { defineAction, onError } = runner();
    const user = await defineAction({
      input,
      handler: async () => {
        throw new UserError("Faktura je uzavřená.");
      },
    })({ title: "Dům" });
    expect(user).toMatchObject({ ok: false, error: "Faktura je uzavřená.", code: "user_error" });
    const perm = await defineAction({
      input,
      handler: async () => {
        throw new PermissionError();
      },
    })({ title: "Dům" });
    expect(perm).toMatchObject({ ok: false, code: "forbidden" });
    expect(onError).not.toHaveBeenCalled();

    const boom = await defineAction({
      input,
      handler: async () => {
        throw new Error("SQL: tajná podrobnost");
      },
    })({ title: "Dům" });
    expect(boom).toMatchObject({ ok: false, code: "internal" });
    // uživatel dostane kód chyby a stejný kód dostane i log (podle něj se chyba dohledá)
    const errorId = /\(Kód chyby: (E-[0-9a-f]{8})\)/.exec((boom as { error: string }).error)?.[1];
    expect(errorId).toBeDefined();
    expect((boom as { error: string }).error).not.toContain("SQL");
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { errorId });

    // očekávané chyby databáze mají konkrétní větu a nejdou do error trackingu
    onError.mockClear();
    const dup = await defineAction({
      input,
      handler: async () => {
        throw Object.assign(new Error("Failed query"), {
          cause: Object.assign(new Error("duplicate key"), { code: "23505" }),
        });
      },
    })({ title: "Dům" });
    expect(dup).toMatchObject({ ok: false, code: "user_error" });
    expect((dup as { error: string }).error).toContain("už existuje");
    const fk = await defineAction({
      input,
      handler: async () => {
        throw Object.assign(new Error("fk"), { code: "23503" });
      },
    })({ title: "Dům" });
    expect((fk as { error: string }).error).toContain("souvisí s jinými záznamy");
    expect(onError).not.toHaveBeenCalled();

    // tatáž třída chyby ve druhé kopii svazku (vývojový server): pozná se podle jména a věta se zachová
    const twin = Object.assign(new Error("Cement: na umístění je jen 30 pytel."), {
      name: "UserError",
      code: "user_error",
    });
    const copy = await defineAction({
      input,
      handler: async () => {
        throw twin;
      },
    })({ title: "Dům" });
    expect(copy).toEqual({
      ok: false,
      error: "Cement: na umístění je jen 30 pytel.",
      code: "user_error",
    });
    expect(onError).not.toHaveBeenCalled();
  });
});
