import type { Executor } from "@rebar/core/db";
import { createCredentialStore } from "@rebar/core/integrations";
import type { ModuleDeps } from "@rebar/core/module-server";
import { UserError } from "@rebar/core/rbac";
import { MetaApiError, type MetaAdsClient } from "./client";
import { createRealMetaClient } from "./real-client";

/*
  Napojení na Meta: přístupový token je v `integration_credential` (poskytovatel `meta`, společný pro agenturu,
  šifrovaný přes `cipher`; do UI, auditu ani logu se nedostane). `getMetaClient` z něj složí skutečného klienta; testy
  podstrčí `fake-meta` přes `setMetaClientForTests`.
*/

let override: MetaAdsClient | null = null;

/** Podstrčí klienta (fake) místo skutečného; `null` vrátí běžné chování. Jen pro testy. */
export function setMetaClientForTests(client: MetaAdsClient | null): void {
  override = client;
}

/** Tvar uložených tajemství poskytovatele `meta`. */
export type MetaCredentialData = { accessToken: string };

/**
 * Klient Meta pro synchronizaci. Chybí-li přístup, srozumitelná chyba pro uživatele. Neplatný token zapíše do stavu
 * přístupu (`reauth`) volající (viz `markCredentialFailure`).
 */
export async function getMetaClient(
  db: Executor,
  deps: Pick<ModuleDeps, "cipher">,
): Promise<MetaAdsClient> {
  if (override) return override;
  const loaded = await createCredentialStore(deps.cipher).load<MetaCredentialData>(db, "meta");
  if (!loaded?.data.accessToken)
    throw new UserError("Meta není napojená. Uložte přístupový token v Nastavení → Integrace.");
  return createRealMetaClient({ accessToken: loaded.data.accessToken });
}

/** Chyba přístupu (neplatný token) se promítne do stavu přístupu, aby to bylo vidět v Nastavení. */
export async function markCredentialFailure(
  db: Executor,
  deps: Pick<ModuleDeps, "cipher">,
  err: unknown,
): Promise<void> {
  if (override) return;
  if (err instanceof MetaApiError)
    await createCredentialStore(deps.cipher).setStatus(db, "meta", null, err.auth ? "reauth" : "error");
}
