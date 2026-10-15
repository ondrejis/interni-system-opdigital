import "server-only";
import { resolveCtx } from "@rebar/core/auth";
import { makeActionRunner } from "@rebar/core/actions";
import { captureError } from "@rebar/core/observability";
import { can, type Ctx } from "@rebar/core/rbac";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getServices } from "./services";

/** Kontext přihlášeného uživatele pro stránky a server actions (jednou za požadavek). */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const s = getServices();
  return resolveCtx({
    auth: s.auth,
    db: s.db,
    headers: await headers(),
    catalog: s.catalog,
  });
});

/**
 * Pro stránky: nepřihlášeného pošle na přihlášení a uživatele s povinným, ale nenastaveným 2FA na jeho nastavení.
 */
export async function requireCtx(opts: { allowRestricted?: boolean } = {}): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/prihlaseni");
  if (ctx.actor.restriction && !opts.allowRestricted) redirect("/nastaveni/zabezpeceni");
  return ctx;
}

/**
 * Pro stránky vyhrazené oprávnění (Nastavení…): bez oprávnění je to „Stránka nenalezena“ (stejně jako adresa, která
 * neexistuje), ne chyba. Stačí kterékoli z uvedených oprávnění.
 */
export async function requireCan(
  permission: string | readonly string[],
  opts: { allowRestricted?: boolean } = {},
): Promise<Ctx> {
  const ctx = await requireCtx(opts);
  if (![permission].flat().some((k) => can(ctx, k))) notFound();
  return ctx;
}

/** Továrna na server actions: oprávnění, validace a převod chyb jsou pro všechny akce stejné. */
export const defineAction = makeActionRunner({
  resolveCtx: getCtx,
  onError: (err, info) => captureError(err, { errorId: info.errorId }),
});
