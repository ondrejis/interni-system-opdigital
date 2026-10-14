import { inspectInvitation } from "@rebar/core/auth";
import { AuthShell, Chip } from "@rebar/ui";
import { MailQuestion, Mail, UserCog } from "lucide-react";
import Link from "next/link";
import { authBrand } from "@/lib/auth-brand";
import { getServices } from "@/server/services";
import { AcceptForm } from "./accept-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pozvánka" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [inv, brand] = await Promise.all([inspectInvitation(getServices().db, token), authBrand()]);
  if (!inv)
    return (
      <AuthShell
        brand={brand}
        icon={<MailQuestion />}
        title="Pozvánka neplatí"
        description="Pozvánka je neplatná nebo vypršela. Požádejte o novou."
        footer={
          <Link
            href="/prihlaseni"
            className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
          >
            Přejít na přihlášení
          </Link>
        }
      >
        <p className="rounded-lg bg-subtle px-4 py-3 text-base text-muted">
          Novou pozvánku vám pošle správce systému {brand.name}.
        </p>
      </AuthShell>
    );
  return (
    <AuthShell
      brand={brand}
      title="Vítejte"
      description={`Byli jste pozváni do systému ${brand.name}. Zbývá nastavit jméno a heslo.`}
    >
      <dl className="mb-6 divide-y divide-line rounded-xl border border-line bg-subtle text-base">
        <div className="flex items-center gap-3 px-4 py-3">
          <Mail className="size-4 shrink-0 text-faint" aria-hidden />
          <dt className="w-14 shrink-0 text-muted">E-mail</dt>
          <dd className="min-w-0 flex-1 truncate font-medium">{inv.email}</dd>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <UserCog className="size-4 shrink-0 text-faint" aria-hidden />
          <dt className="w-14 shrink-0 text-muted">Role</dt>
          <dd className="min-w-0 flex-1">
            <Chip color="blue">{inv.roleName}</Chip>
          </dd>
        </div>
      </dl>
      <AcceptForm token={token} />
    </AuthShell>
  );
}
