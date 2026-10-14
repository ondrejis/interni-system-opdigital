"use client";

import { AUTH_SUBMIT, Button, Notice, PasswordField, TextField } from "@rebar/ui";
import { LockKeyhole, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function LoginForm({ notice }: { notice?: string | undefined }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await authClient.signIn.email({ email, password });
    if (error) {
      setBusy(false);
      return setError(authErrorMessage(error));
    }
    // tlačítko zůstává ve stavu načítání, dokud se nepřejde na další stránku
    router.replace(
      data && "twoFactorRedirect" in data && data.twoFactorRedirect ? "/overeni" : "/",
    );
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
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
      <PasswordField
        label="Heslo"
        icon={<LockKeyhole />}
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        labelAction={
          <Link
            href="/zapomenute-heslo"
            className="rounded text-sm font-medium text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg hover:decoration-fg"
          >
            Zapomenuté heslo?
          </Link>
        }
      />
      <Button type="submit" variant="primary" size="lg" loading={busy} className={AUTH_SUBMIT}>
        {busy ? "Přihlašuji…" : "Přihlásit se"}
      </Button>
    </form>
  );
}
