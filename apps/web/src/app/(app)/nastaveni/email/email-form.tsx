"use client";

import { Button, Checkbox, Field, FormSection, Input, Notice, SettingsPage } from "@rebar/ui";
import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { runAction } from "@/lib/run-action";
import { saveSmtpAction, sendTestMailAction, verifySmtpAction } from "@/server/email-actions";

type Smtp = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
};

/** Odesílání e-mailů: SMTP server, přihlášení a odesílatel. Používají ho pozvánky, obnova hesla i faktury a upomínky. */
export function EmailForm({ initial, passwordSet }: { initial: Smtp; passwordSet: boolean }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"save" | "verify" | "test" | null>(null);
  const [verified, setVerified] = useState<string | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial) || password !== "";
  const conn = { host: s.host, port: s.port, secure: s.secure, user: s.user, password };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    const r = await runAction(saveSmtpAction({ ...s, password }), "Nastavení e-mailů uloženo.");
    setBusy(null);
    if (r) {
      setPassword("");
      router.refresh();
    }
  }
  async function verify() {
    setBusy("verify");
    setVerified(null);
    const r = await runAction(verifySmtpAction(conn));
    setBusy(null);
    if (r) setVerified("Spojení se serverem funguje.");
  }
  async function test() {
    setBusy("test");
    const r = await runAction(sendTestMailAction({}));
    setBusy(null);
    if (r)
      setVerified(
        `Zkušební e-mail je ve frontě pro ${r.data.to}. Odešle ho worker; dorazí do minuty.`,
      );
  }

  return (
    <SettingsPage
      title="E-maily"
      description="Server pro odesílání e-mailů: pozvánky, obnova hesla, faktury a upomínky."
      icon={<Mail />}
    >
      <form onSubmit={save}>
        <FormSection
          title="Odesílání (SMTP)"
          description="Údaje dostanete od poskytovatele e-mailu nebo hostingu."
          icon={<Mail />}
          footer={
            <>
              {dirty && <span className="mr-auto text-sm text-muted">Neuložené změny</span>}
              <Button
                type="button"
                variant="ghost"
                loading={busy === "verify"}
                disabled={!s.host}
                onClick={() => void verify()}
              >
                Ověřit spojení
              </Button>
              <Button
                type="button"
                variant="ghost"
                loading={busy === "test"}
                disabled={dirty || !initial.enabled}
                onClick={() => void test()}
              >
                Poslat zkušební e-mail
              </Button>
              <Button type="submit" variant="primary" loading={busy === "save"}>
                Uložit
              </Button>
            </>
          }
        >
          <label className="mb-3 flex cursor-pointer items-center gap-2">
            <Checkbox checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: !!v })} />{" "}
            Odesílání e-mailů je zapnuté
          </label>
          <div className="grid gap-x-3 sm:grid-cols-[1fr_8rem]">
            <Field label="Server (host)" htmlFor="smtp-host">
              <Input
                id="smtp-host"
                value={s.host}
                onChange={(e) => setS({ ...s, host: e.target.value })}
                placeholder="smtp.firma.cz"
              />
            </Field>
            <Field label="Port" htmlFor="smtp-port">
              <Input
                id="smtp-port"
                inputMode="numeric"
                value={String(s.port)}
                onChange={(e) => setS({ ...s, port: Number(e.target.value.replace(/\D/g, "")) })}
              />
            </Field>
          </div>
          <label className="mb-3 flex cursor-pointer items-center gap-2">
            <Checkbox checked={s.secure} onCheckedChange={(v) => setS({ ...s, secure: !!v })} />{" "}
            Šifrované spojení hned při připojení (SSL, obvykle port 465; port 587 používá STARTTLS)
          </label>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Přihlašovací jméno" htmlFor="smtp-user">
              <Input
                id="smtp-user"
                autoComplete="off"
                value={s.user}
                onChange={(e) => setS({ ...s, user: e.target.value })}
              />
            </Field>
            <Field
              label="Heslo"
              htmlFor="smtp-pass"
              hint={passwordSet ? "Uložené. Vyplňte jen při změně." : undefined}
            >
              <Input
                id="smtp-pass"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={passwordSet ? "••••••••" : ""}
              />
            </Field>
          </div>
          <Field
            label="Adresa odesílatele"
            htmlFor="smtp-from"
            hint="Např. faktury@firma.cz. Jako jméno odesílatele se doplní název firmy."
          >
            <Input
              id="smtp-from"
              type="email"
              value={s.from}
              onChange={(e) => setS({ ...s, from: e.target.value })}
            />
          </Field>
          {verified && <Notice tone="success">{verified}</Notice>}
        </FormSection>
      </form>
    </SettingsPage>
  );
}
