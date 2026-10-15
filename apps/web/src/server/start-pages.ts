import "server-only";
import { collectNav } from "@rebar/core";
import { can, type Ctx } from "@rebar/core/rbac";
import { getServices } from "./services";

/** Stránky, které si uživatel smí zvolit jako úvodní po přihlášení: položky navigace, na které má oprávnění. */
export function allowedStartPages(ctx: Ctx): { href: string; label: string }[] {
  const seen = new Set<string>();
  return collectNav(getServices().runtime.modules)
    .filter((n) => n.permission === undefined || [n.permission].flat().some((p) => can(ctx, p)))
    .filter((n) => !seen.has(n.href) && !!seen.add(n.href))
    .map((n) => ({ href: n.href, label: n.label }));
}
