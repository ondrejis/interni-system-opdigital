import { AuthShell } from "@rebar/ui";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { authBrand } from "@/lib/auth-brand";
import { TwoFactorForm } from "./two-factor-form";

export const metadata = { title: "Ověření přihlášení" };

export default async function VerifyPage() {
  return (
    <AuthShell
      brand={await authBrand()}
      icon={<ShieldCheck />}
      title="Ověření přihlášení"
      description="Zadejte šestimístný kód z aplikace pro ověření (Google Authenticator, Microsoft Authenticator, 1Password…)."
      footer={
        <Link
          href="/prihlaseni"
          className="inline-flex items-center gap-1.5 rounded font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Zpět na přihlášení
        </Link>
      }
    >
      <TwoFactorForm />
    </AuthShell>
  );
}
