"use client";

import {
  Button,
  Chip,
  FormSection,
  Notice,
  OtpInput,
  PasswordField,
  errorToast,
  successToast,
} from "@rebar/ui";
import { Copy, Download, KeyRound, LockKeyhole, ShieldCheck, ShieldOff } from "lucide-react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";

type Enrollment = { qr: string; secret: string; backupCodes: string[] };

export function TwoFactorSetup({ enabled, required }: { enabled: boolean; required: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [regenPassword, setRegenPassword] = useState("");
  const [regenError, setRegenError] = useState("");

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await authClient.twoFactor.enable({ password, method: "totp" });
    setBusy(false);
    if (error || !data || data.method !== "totp")
      return setError(authErrorMessage(error) || "Nepodařilo se zahájit nastavení.");
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setEnrollment({
      qr: await QRCode.toDataURL(data.totpURI, { width: 220, margin: 1 }),
      secret,
      backupCodes: data.backupCodes,
    });
    setPassword("");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    setBusy(false);
    if (error) {
      setCode("");
      return setError(authErrorMessage(error));
    }
    router.replace("/start");
    router.refresh();
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    setPassword("");
    router.refresh();
  }

  /** Nové záložní kódy (po zadání hesla); server staré kódy zneplatní. */
  async function regenerate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setRegenError("");
    const { data, error } = await authClient.twoFactor.generateBackupCodes({
      password: regenPassword,
    });
    setBusy(false);
    if (error || !data)
      return setRegenError(authErrorMessage(error) || "Kódy se nepodařilo vytvořit.");
    setRegenPassword("");
    setNewCodes(data.backupCodes);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      successToast(`${what} zkopírováno.`);
    } catch {
      errorToast("Zkopírování se nepovedlo. Označte text a zkopírujte ho ručně.");
    }
  }
  function download(codes: string) {
    const url = URL.createObjectURL(new Blob([codes + "\n"], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "zalozni-kody.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (enabled) {
    return (
      <div className="space-y-6">
        <FormSection
          title="Dvoufázové ověření"
          icon={<ShieldCheck />}
          description="Kromě hesla zadáváte při přihlášení i kód z aplikace pro ověření."
          badge={
            <Chip color="green" dot>
              Zapnuto
            </Chip>
          }
        >
          <p className="text-base">
            Dvoufázové ověření je <strong>zapnuté</strong>.
          </p>
        </FormSection>

        <form onSubmit={regenerate}>
          <FormSection
            title="Záložní kódy"
            icon={<KeyRound />}
            description="Každý kód jde použít jednou, když nemáte po ruce telefon. Nové kódy zneplatní všechny dosavadní."
            footer={
              !newCodes && (
                <Button type="submit" variant="primary" loading={busy}>
                  Vytvořit nové kódy
                </Button>
              )
            }
          >
            {newCodes ? (
              <div className="space-y-3">
                <Notice tone="warning" title="Uložte si je hned">
                  Tyto kódy se už znovu nezobrazí. Dosavadní záložní kódy přestaly platit.
                </Notice>
                <ul
                  data-testid="new-backup-codes"
                  className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-line bg-subtle p-3 font-mono text-sm @lg:grid-cols-3"
                >
                  {newCodes.map((c) => (
                    <li key={c} className="select-all tabular">
                      {c}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void copy(newCodes.join("\n"), "Záložní kódy")}
                  >
                    <Copy /> Zkopírovat kódy
                  </Button>
                  <Button type="button" size="sm" onClick={() => download(newCodes.join("\n"))}>
                    <Download /> Stáhnout jako soubor
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setNewCodes(null)}>
                    Hotovo
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-w-sm space-y-3">
                {regenError && <Notice tone="error">{regenError}</Notice>}
                <PasswordField
                  density="compact"
                  label="Pro vytvoření nových kódů zadejte heslo"
                  icon={<LockKeyhole />}
                  autoComplete="current-password"
                  required
                  value={regenPassword}
                  onChange={(e) => setRegenPassword(e.target.value)}
                />
              </div>
            )}
          </FormSection>
        </form>

        {required ? (
          <FormSection
            title="Vypnutí ověření"
            icon={<ShieldOff />}
            description="Pro vaši roli je dvoufázové ověření povinné, proto ho nejde vypnout."
          >
            <p className="text-muted">
              Povinnost nastavuje správce u role. Když ztratíte telefon, přihlaste se záložním
              kódem, případně požádejte správce o pomoc.
            </p>
          </FormSection>
        ) : (
          <form onSubmit={disable}>
            <FormSection
              tone="danger"
              title="Vypnout ověření"
              icon={<ShieldOff />}
              description="Účet bude chráněný jen heslem. Vypnutí potvrďte svým heslem."
              footer={
                <Button type="submit" variant="danger" loading={busy}>
                  Vypnout ověření
                </Button>
              }
            >
              <div className="max-w-sm space-y-3">
                {error && <Notice tone="error">{error}</Notice>}
                <PasswordField
                  density="compact"
                  label="Pro vypnutí zadejte heslo"
                  icon={<LockKeyhole />}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </FormSection>
          </form>
        )}
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="space-y-6">
        {required && (
          <Notice tone="warning" title="Ověření je pro vaši roli povinné">
            Dokud dvoufázové ověření nenastavíte, nemáte přístup k ostatním částem systému.
          </Notice>
        )}
        <form onSubmit={start}>
          <FormSection
            title="Zapnout dvoufázové ověření"
            icon={<ShieldCheck />}
            description="Potřebujete telefon s aplikací pro ověření (Google Authenticator, Microsoft Authenticator, 1Password…)."
            badge={<Chip>Vypnuto</Chip>}
            footer={
              <Button type="submit" variant="primary" loading={busy}>
                Nastavit ověření
              </Button>
            }
          >
            <div className="grid gap-6 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
              <ol className="space-y-3 text-base">
                <Step n={1} current>
                  Potvrďte heslem, že jste to vy.
                </Step>
                <Step n={2}>Naskenujte QR kód a uložte si záložní kódy.</Step>
                <Step n={3}>Opište kód z aplikace a ověření se zapne.</Step>
              </ol>
              <div className="space-y-3">
                {error && <Notice tone="error">{error}</Notice>}
                <PasswordField
                  density="compact"
                  label="Pro zahájení zadejte heslo"
                  icon={<LockKeyhole />}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          </FormSection>
        </form>
      </div>
    );
  }

  const codes = enrollment.backupCodes.join("\n");

  return (
    <form onSubmit={verify}>
      <FormSection
        title="Nastavení dvoufázového ověření"
        icon={<ShieldCheck />}
        description="Projděte tři kroky. Ověření se zapne, až potvrdíte kód z aplikace."
        footer={
          <Button type="submit" variant="primary" loading={busy} disabled={code.length < 6}>
            Potvrdit a zapnout
          </Button>
        }
      >
        <ol className="space-y-6">
          <StepBlock n={1} title="Naskenujte QR kód">
            <p className="text-muted">
              V aplikaci pro ověření (Google Authenticator, Microsoft Authenticator, 1Password…)
              přidejte nový účet a naskenujte tento kód.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-4">
              <img
                className="rounded-lg border border-line bg-white p-1.5"
                src={enrollment.qr}
                alt="QR kód pro aplikaci pro ověření"
                width={176}
                height={176}
              />
              <div className="min-w-0 space-y-2">
                <p className="text-muted">Nejde naskenovat? Zadejte ručně:</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="break-all rounded-md bg-hover px-2 py-1 font-mono text-sm">
                    {enrollment.secret}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void copy(enrollment.secret, "Klíč")}
                  >
                    <Copy /> Zkopírovat
                  </Button>
                </div>
              </div>
            </div>
          </StepBlock>

          <StepBlock n={2} title="Uložte si záložní kódy">
            <p className="text-muted">
              Každý jde použít jednou, když ztratíte telefon. Uložte je na bezpečné místo, třeba do
              správce hesel.
            </p>
            <ul
              data-testid="backup-codes"
              className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-line bg-subtle p-3 font-mono text-sm @lg:grid-cols-3"
            >
              {enrollment.backupCodes.map((c) => (
                <li key={c} className="select-all tabular">
                  {c}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void copy(codes, "Záložní kódy")}>
                <Copy /> Zkopírovat kódy
              </Button>
              <Button type="button" size="sm" onClick={() => download(codes)}>
                <Download /> Stáhnout jako soubor
              </Button>
            </div>
          </StepBlock>

          <StepBlock n={3} title="Potvrďte kódem z aplikace">
            <div className="max-w-sm space-y-3">
              {error && <Notice tone="error">{error}</Notice>}
              <OtpInput
                label="Kód z aplikace"
                required
                invalid={!!error}
                value={code}
                onChange={setCode}
                hint="Šestimístný kód, který se v aplikaci mění každých 30 sekund."
              />
            </div>
          </StepBlock>
        </ol>
      </FormSection>
    </form>
  );
}

function Step({ n, current, children }: { n: number; current?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={
          "flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold " +
          (current ? "bg-accent text-accent-fg" : "bg-hover text-muted")
        }
      >
        {n}
      </span>
      <span className={current ? "pt-0.5 font-medium" : "pt-0.5 text-muted"}>{children}</span>
    </li>
  );
}

function StepBlock({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-fg">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="mb-1 font-semibold">{title}</h4>
        {children}
      </div>
    </li>
  );
}
