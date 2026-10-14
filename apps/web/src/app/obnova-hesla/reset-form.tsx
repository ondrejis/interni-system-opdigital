"use client";

import { AUTH_SUBMIT, Button, Notice, PasswordField, PasswordStrength } from "@rebar/ui";
import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setBusy(false);
      return setError(authErrorMessage(error));
    }
    router.replace("/prihlaseni?heslo=ok");
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="space-y-3">
        <PasswordField
          label="Nové heslo"
          icon={<LockKeyhole />}
          name="new-password"
          autoComplete="new-password"
          minLength={12}
          autoFocus
          required
          aria-describedby="pw-strength"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordStrength id="pw-strength" password={password} />
      </div>
      <Button type="submit" variant="primary" size="lg" loading={busy} className={AUTH_SUBMIT}>
        {busy ? "Ukládám…" : "Nastavit heslo"}
      </Button>
    </form>
  );
}
