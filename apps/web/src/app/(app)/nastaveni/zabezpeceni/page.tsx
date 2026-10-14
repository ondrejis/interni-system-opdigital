import { getAccount } from "@rebar/core/auth";
import { SettingsPage } from "@rebar/ui";
import { ShieldCheck } from "lucide-react";
import { requireCtx } from "@/server/request";
import { TwoFactorSetup } from "./two-factor-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zabezpečení účtu" };

export default async function SecurityPage() {
  const ctx = await requireCtx({ allowRestricted: true });
  const account = await getAccount(ctx);
  return (
    <SettingsPage
      title="Zabezpečení účtu"
      description="Dvoufázové ověření chrání váš účet i tehdy, když se někdo dozví heslo. Heslo a přihlášená zařízení spravujete v části Můj účet."
      icon={<ShieldCheck />}
    >
      <TwoFactorSetup enabled={account.twoFactorEnabled} required={account.twoFactorRequired} />
    </SettingsPage>
  );
}
