import {
  getAccount,
  listOwnSessions,
  listTrustedDevices,
  type AvatarColor,
} from "@rebar/core/auth";
import { headers } from "next/headers";
import { requireCtx } from "@/server/request";
import { currentSessionId } from "@/server/current-session";
import { AccountPage } from "./account-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil" };

/** Profil: údaje a avatar, změna hesla, přihlášená a důvěryhodná zařízení, odkaz na dvoufázové ověření. Dostupné každému přihlášenému. */
export default async function MyAccountPage() {
  const ctx = await requireCtx();
  const [account, sid] = await Promise.all([getAccount(ctx), currentSessionId()]);
  const [sessions, trusted] = await Promise.all([
    listOwnSessions(ctx, sid),
    listTrustedDevices(ctx, (await headers()).get("cookie")),
  ]);
  return (
    <AccountPage
      account={{
        id: account.id,
        name: account.name,
        email: account.email,
        roleName: account.roleName,
        twoFactorEnabled: account.twoFactorEnabled,
        twoFactorRequired: account.twoFactorRequired,
        phone: account.phone,
        shortName: account.shortName,
        avatarColor: account.avatarColor as AvatarColor | null,
        ico: account.ico,
        billingTool: account.billingTool,
      }}
      trusted={trusted.map((d) => ({
        id: d.id,
        current: d.current,
        createdAt: d.createdAt.toISOString(),
        expiresAt: d.expiresAt.toISOString(),
      }))}
      sessions={sessions.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        lastActiveAt: s.lastActiveAt.toISOString(),
      }))}
    />
  );
}
