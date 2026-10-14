import { AUTH_LINK_BUTTON, AuthShell } from "@rebar/ui";
import { LinkIcon } from "lucide-react";
import Link from "next/link";
import { authBrand } from "@/lib/auth-brand";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Nové heslo" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const brand = await authBrand();
  if (sp.token && !sp.error)
    return (
      <AuthShell
        brand={brand}
        title="Nové heslo"
        description="Zvolte si nové heslo. Použijte alespoň 12 znaků."
      >
        <ResetForm token={sp.token} />
      </AuthShell>
    );
  return (
    <AuthShell
      brand={brand}
      icon={<LinkIcon />}
      title="Odkaz už neplatí"
      description="Odkaz je neplatný nebo vypršel. Požádejte o nový na stránce „Zapomenuté heslo“."
    >
      <Link href="/zapomenute-heslo" className={AUTH_LINK_BUTTON}>
        Požádat o nový odkaz
      </Link>
    </AuthShell>
  );
}
