"use client";

import { AUTH_SUBMIT, Button, Notice, OtpInput, TextField } from "@rebar/ui";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function TwoFactorForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: code.trim() })
      : await authClient.twoFactor.verifyTotp({ code: code.trim() });
    if (error) {
      setBusy(false);
      if (!backup) setCode("");
      return setError(authErrorMessage(error));
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      {backup ? (
        <TextField
          key="backup"
          label="Záložní kód"
          icon={<KeyRound />}
          name="backup-code"
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          hint="Každý záložní kód jde použít jen jednou."
        />
      ) : (
        <OtpInput
          key="totp"
          label="Kód z aplikace pro ověření"
          required
          autoFocus
          invalid={!!error}
          value={code}
          onChange={setCode}
        />
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={busy}
        disabled={!backup && code.length < 6}
        className={AUTH_SUBMIT}
      >
        {busy ? "Ověřuji…" : "Ověřit"}
      </Button>
      <div className="text-center">
        <button
          type="button"
          className="cursor-pointer rounded text-base font-medium text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg hover:decoration-fg"
          onClick={() => {
            setBackup(!backup);
            setCode("");
            setError("");
          }}
        >
          {backup ? "Použít kód z aplikace" : "Použít záložní kód"}
        </button>
      </div>
    </form>
  );
}
