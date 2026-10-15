import { getOwnAppearance, resolveStartPage } from "@rebar/core/auth";
import { requireCtx } from "@/server/request";
import { allowedStartPages } from "@/server/start-pages";
import { StartRedirect } from "./start-redirect";

export const dynamic = "force-dynamic";
export const metadata = { title: "Přihlášení" };

/**
 * Cíl po přihlášení a ověření druhého faktoru: přenese uložený vzhled (motiv, hustotu) do tohoto prohlížeče a přesměruje
 * na úvodní stránku zvolenou ve Vzhledu. Nedostupná nebo žádná volba = Přehled, bez přístupu na Přehled vlastní účet.
 */
export default async function StartPage() {
  const ctx = await requireCtx();
  const [appearance, pages] = await Promise.all([getOwnAppearance(ctx), allowedStartPages(ctx)]);
  const allowed = pages.map((p) => p.href);
  const fallback = allowed.includes("/prehled") ? "/prehled" : "/nastaveni/ucet";
  const target = resolveStartPage(appearance, [...allowed, "/nastaveni/ucet"], fallback);
  return <StartRedirect target={target} theme={appearance.theme} density={appearance.density} />;
}
