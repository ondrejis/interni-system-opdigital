import { getAccount, listOwnSessions } from "@rebar/core/auth";
import { requireCtx } from "@/server/request";
import { currentSessionId } from "@/server/current-session";
import { AccountPage } from "./account-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Můj účet" };

/** Můj účet: profil, změna hesla, přihlášená zařízení a odkaz na dvoufázové ověření. Dostupné každému přihlášenému. */
export default async function MyAccountPage() {
  const ctx = await requireCtx();
  const [account, sid] = await Promise.all([getAccount(ctx), currentSessionId()]);
  const sessions = await listOwnSessions(ctx, sid);
  return (
    <AccountPage
      account={account}
      sessions={sessions.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        lastActiveAt: s.lastActiveAt.toISOString(),
      }))}
    />
  );
}
