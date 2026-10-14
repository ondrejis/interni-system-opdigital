import "server-only";
import { resolveCtx } from "@rebar/core/auth";
import { makeActionRunner } from "@rebar/core/actions";
import { captureError } from "@rebar/core/observability";
import { can, type Ctx } from "@rebar/core/rbac";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getServices } from "./services";
import { isTerminalOnly } from "./terminal";

/** Kontext přihlášeného uživatele pro stránky a server actions (jednou za požadavek). */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const s = getServices();
  return resolveCtx({
    auth: s.auth,
    db: s.db,
    headers: await headers(),
    catalog: s.catalog,
    maxSessionAgeDays: 30,
  });
});

/**
 * Pro stránky: nepřihlášeného pošle na přihlášení, uživatele s povinným, ale nenastaveným 2FA na jeho nastavení a uživatele
 * s rolí jen pro terminál řemeslníka na terminál (`/t`). Terminál a stránky vlastního účtu to vypínají `allowTerminalOnly`.
 */
export async function requireCtx(
  opts: { allowRestricted?: boolean; allowTerminalOnly?: boolean } = {},
): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/prihlaseni");
  if (ctx.actor.restriction && !opts.allowRestricted) redirect("/nastaveni/zabezpeceni");
  if (!opts.allowTerminalOnly && !ctx.actor.restriction && (await isTerminalOnly(ctx)))
    redirect("/t");
  return ctx;
}

/**
 * Pro stránky vyhrazené oprávnění (Nastavení…): bez oprávnění je to „Stránka nenalezena“ (stejně jako adresa, která
 * neexistuje), ne chyba. Stačí kterékoli z uvedených oprávnění.
 */
export async function requireCan(
  permission: string | readonly string[],
  opts: { allowRestricted?: boolean; allowTerminalOnly?: boolean } = {},
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
