"use client";

import { AUTH_SUBMIT, AuthShell, Button, TextField, type AuthBrand } from "@rebar/ui";
import { ArrowLeft, KeyRound, Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const back = (
  <Link
    href="/prihlaseni"
    className="inline-flex items-center gap-1.5 rounded font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg"
  >
    <ArrowLeft className="size-4" aria-hidden />
    Zpět na přihlášení
  </Link>
);

export function ForgotForm({ brand }: { brand: AuthBrand }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await authClient.requestPasswordReset({ email, redirectTo: "/obnova-hesla" });
    setBusy(false);
    setSent(true); // odpověď je vždy stejná, aby nešlo zjišťovat, které e-maily v systému jsou
  }

  if (sent)
    return (
      <AuthShell
        brand={brand}
        icon={<MailCheck />}
        title="Zkontrolujte e-mail"
        description="Pokud je tento e-mail v systému, poslali jsme na něj odkaz pro nastavení hesla. Platí 1 hodinu."
        footer={back}
      >
        <div role="status" className="rounded-lg bg-subtle px-4 py-3 text-base text-muted">
          Nic nepřišlo? Podívejte se do složky s nevyžádanou poštou, nebo to zkuste s jinou adresou.
        </div>
        <Button
          variant="secondary"
          size="lg"
          className={`${AUTH_SUBMIT} mt-4 font-medium`}
          onClick={() => {
            setSent(false);
            setEmail("");
          }}
        >
          Zadat jiný e-mail
        </Button>
      </AuthShell>
    );

  return (
    <AuthShell
      brand={brand}
      icon={<KeyRound />}
      title="Zapomenuté heslo"
      description="Zadejte e-mail k účtu a pošleme vám odkaz pro nastavení nového hesla."
      footer={back}
    >
      <form onSubmit={submit} className="space-y-5">
        <TextField
          label="E-mail"
          icon={<Mail />}
          type="email"
          name="email"
          autoComplete="username"
          placeholder="jmeno@firma.cz"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="primary" size="lg" loading={busy} className={AUTH_SUBMIT}>
          {busy ? "Odesílám…" : "Poslat odkaz"}
        </Button>
      </form>
    </AuthShell>
  );
}
