import "server-only";
import { headers } from "next/headers";
import { getServices } from "./services";

/** Id relace, ze které požadavek přišel; `null`, když není platná. Slouží k označení „toto zařízení“ a k tomu, aby zůstalo přihlášené. */
export async function currentSessionId(): Promise<string | null> {
  const session = await getServices()
    .auth.api.getSession({ headers: await headers() })
    .catch(() => null);
  return session?.session.id ?? null;
}
