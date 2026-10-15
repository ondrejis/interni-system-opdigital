import { getOwnAppearance } from "@rebar/core/auth";
import { requireCtx } from "@/server/request";
import { allowedStartPages } from "@/server/start-pages";
import { AppearanceForm } from "./appearance-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vzhled" };

/** Vzhled: motiv, hustota řádků a úvodní stránka po přihlášení. Osobní nastavení každého uživatele. */
export default async function Page() {
  const ctx = await requireCtx();
  return (
    <AppearanceForm initial={await getOwnAppearance(ctx)} startPages={allowedStartPages(ctx)} />
  );
}
