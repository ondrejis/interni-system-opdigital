import { removeSessionSubscriptions } from "@rebar/core/push";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

// Přihlášení, odhlášení, 2FA, obnova hesla — vše obsluhuje Better Auth (rate limit v DB).
export const GET = (req: Request) => getServices().auth.handler(req);

export async function POST(req: Request) {
  const s = getServices();
  // odhlášení zruší push odběry zařízení, které se přihlásilo touto relací (po odhlášení nesmí chodit upozornění dalšímu uživateli)
  if (!new URL(req.url).pathname.endsWith("/sign-out")) return s.auth.handler(req);
  const session = await s.auth.api.getSession({ headers: req.headers }).catch(() => null);
  const res = await s.auth.handler(req);
  if (session && res.ok)
    await removeSessionSubscriptions(s.db, session.session.id).catch(() => undefined);
  return res;
}
