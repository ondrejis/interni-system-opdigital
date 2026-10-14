import { AuthShell } from "@rebar/ui";
import { redirect } from "next/navigation";
import { authBrand } from "@/lib/auth-brand";
import { getCtx } from "@/server/request";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Přihlášení" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ pozvanka?: string; heslo?: string }>;
}) {
  if (await getCtx()) redirect("/");
  const sp = await searchParams;
  const notice = sp.pozvanka
    ? "Přístup je nastavený. Můžete se přihlásit."
    : sp.heslo
      ? "Heslo je změněné. Přihlaste se novým heslem."
      : undefined;
  return (
    <AuthShell
      brand={await authBrand()}
      title="Přihlášení"
      description="Vítejte zpět. Zadejte své přihlašovací údaje."
    >
      <LoginForm notice={notice} />
    </AuthShell>
  );
}
