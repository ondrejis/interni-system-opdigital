"use client";

import { AUTH_SUBMIT, Button, Notice, PasswordField, PasswordStrength, TextField } from "@rebar/ui";
import { LockKeyhole, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, name, password }),
    });
    if (!res.ok) {
      setBusy(false);
      return setError(
        ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
          "Něco se nepovedlo.",
      );
    }
    router.replace("/prihlaseni?pozvanka=ok");
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      <TextField
        label="Jméno a příjmení"
        icon={<UserRound />}
        name="name"
        autoComplete="name"
        autoFocus
        required
        minLength={2}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="space-y-3">
        <PasswordField
          label="Heslo"
          icon={<LockKeyhole />}
          name="new-password"
          autoComplete="new-password"
          minLength={12}
          required
          aria-describedby="pw-strength"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordStrength id="pw-strength" password={password} />
      </div>
      <Button type="submit" variant="primary" size="lg" loading={busy} className={AUTH_SUBMIT}>
        {busy ? "Ukládám…" : "Nastavit přístup"}
      </Button>
    </form>
  );
}
