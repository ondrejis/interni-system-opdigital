import { createCredentialStore } from "@rebar/core/integrations";
import type { Executor } from "@rebar/core/db";
import type { Cipher } from "@rebar/core/security";
import { z } from "zod";
import { FakturoidError, type FakturoidClient, type FakturoidConfig } from "./client";
import { createFakeFakturoid, type FakeFakturoid } from "./fake-client";
import { createHttpFakturoidClient } from "./http-client";

export * from "./client";
export { createFakeFakturoid } from "./fake-client";
export type { FakeFakturoid } from "./fake-client";
export { createHttpFakturoidClient } from "./http-client";

/** Tvar, v jakém je přístup k Fakturoidu uložený (šifrovaně) v `integration_credential` (poskytovatel `fakturoid`). */
export const fakturoidConfigSchema = z.object({
  account: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/i,
      "Název účtu smí obsahovat písmena, číslice, pomlčku a podtržítko.",
    ),
  clientId: z.string().trim().min(1, "Vyplňte Client ID."),
  clientSecret: z.string().min(1, "Vyplňte Client Secret."),
  contactEmail: z.email("Zadejte platný e-mail."),
});

type Slot = { fake: FakeFakturoid | null; override: FakturoidClient | null };
const KEY = Symbol.for("opsys.muj-prostor.fakturoid");
const slot = (): Slot => {
  const g = globalThis as unknown as Record<symbol, Slot | undefined>;
  return (g[KEY] ??= { fake: null, override: null });
};

/**
 * Nahradí klienta (testy). Předaný klient se použije místo uložených přístupů; `null` návrat k běžnému výběru.
 * Slot je v `globalThis`, takže ho sdílí i oddělené balíčky téhož procesu.
 */
export function setFakturoidClientOverride(client: FakturoidClient | null): void {
  slot().override = client;
}

/** Je zapnutý vývojový režim s fake Fakturoidem (`FAKTUROID_MODE=fake`; pro lokální vývoj a e2e, nikdy v provozu)? */
export const isFakeMode = (): boolean => process.env.FAKTUROID_MODE === "fake";

/** Sdílený fake pro vývojový režim (stav v paměti procesu). */
export function devFake(): FakeFakturoid {
  const s = slot();
  return (s.fake ??= createFakeFakturoid({ invoiceYear: new Date().getFullYear() }));
}

/** Který klient se právě používá. */
export type ResolvedFakturoid = { client: FakturoidClient; mode: "real" | "fake" };

/**
 * Vybere klienta: přepsání (testy) → vývojový fake (`FAKTUROID_MODE=fake`) → uložené šifrované přístupy. `null`, když
 * Fakturoid není nastaven (nebo se přístup nedá dešifrovat).
 */
export async function resolveFakturoid(
  db: Executor,
  cipher: Cipher,
): Promise<ResolvedFakturoid | null> {
  const s = slot();
  if (s.override) return { client: s.override, mode: "fake" };
  if (isFakeMode()) return { client: devFake(), mode: "fake" };
  const stored = await createCredentialStore(cipher).load(db, "fakturoid");
  if (!stored) return null;
  const parsed = fakturoidConfigSchema.safeParse(stored.data);
  if (!parsed.success) return null;
  return { client: createHttpFakturoidClient(parsed.data as FakturoidConfig), mode: "real" };
}

/** Přístup uložený k Fakturoidu bez tajemství (pro panel). */
export async function loadStoredConfig(
  db: Executor,
  cipher: Cipher,
): Promise<{ config: FakturoidConfig; status: "ok" | "reauth" | "error" } | null> {
  const stored = await createCredentialStore(cipher).load(db, "fakturoid");
  if (!stored) return null;
  const parsed = fakturoidConfigSchema.safeParse(stored.data);
  return parsed.success ? { config: parsed.data, status: stored.status } : null;
}

export { FakturoidError };
