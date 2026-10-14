import { collectNav } from "@rebar/core";
import { can } from "@rebar/core/rbac";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/request";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * Úvodní adresa: přesměruje na Přehled. Kdo Přehled nesmí vidět (např. externí spolupracovník bez oprávnění), jde na
 * svůj účet (cíle jsou pevné adresy aplikace).
 */
export default async function HomePage() {
  const ctx = await requireCtx();
  const overview = collectNav(getServices().runtime.modules).some(
    (n) =>
      n.href === "/prehled" &&
      (n.permission === undefined || [n.permission].flat().some((p) => can(ctx, p))),
  );
  if (overview) redirect("/prehled");
  redirect("/nastaveni/ucet");
}
