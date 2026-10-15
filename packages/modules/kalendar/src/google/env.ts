import { z } from "zod";
import type { Executor } from "@rebar/core/db";
import type { ModuleDeps, ModuleJobDeps, ServiceRegistry } from "@rebar/core/module-server";
import { sourceCtx, UserError, type Ctx } from "@rebar/core/rbac";
import { defineSetting } from "@rebar/core/settings";
import type { GoogleCalendarClient } from "./client";
import { createGoogleClient } from "./real-client";

/*
  Prostředí oblasti Google: co z `ModuleDeps` (příkazy, obsluhy událostí) a z `ModuleJobDeps` (úlohy) potřebuje
  synchronizace, nastavení s šifrovaným tajemstvím a výběr klienta (skutečný z nastavení, nebo podstrčený v testech).
*/

/** Společná podmnožina `ModuleDeps` a `ModuleJobDeps` (databáze je zvlášť v `ctx`). */
export type KalEnv = {
  registry: ModuleDeps["registry"];
  queue: ModuleDeps["queue"];
  settings: ModuleDeps["settings"];
  cipher: ModuleDeps["cipher"];
  baseURL: string;
  services?: ServiceRegistry | undefined;
};

/** Prostředí z `ModuleDeps` (příkazy, obsluhy událostí). */
export const envOfDeps = (d: ModuleDeps): KalEnv => d;
/** Prostředí z `ModuleJobDeps` (úlohy ve workeru). */
export const envOfJob = (d: ModuleJobDeps): KalEnv => d;

/** Kontext pro změny z Googlu: smí všechno, v historii je vidět jako „Google Kalendář“ (aktér `google`). */
export const googleCtx = (db: Executor): Ctx => sourceCtx(db, "google", "Google Kalendář");

/**
 * Nastavení kalendáře: Google OAuth klient (`clientSecret` je v DB zašifrované) a R-14 — soukromá schůzka se do
 * Googlu zapíše s příznakem „soukromé“ (jinak se do Googlu vůbec nezapisuje).
 */
export const googleCalendarSetting = defineSetting({
  key: "google_calendar",
  schema: z.object({
    clientId: z.string().trim(),
    clientSecret: z.string().nullable(),
    privateMeetingsToGoogle: z.boolean(),
  }),
  default: { clientId: "", clientSecret: null, privateMeetingsToGoogle: true } as {
    clientId: string;
    clientSecret: string | null;
    privateMeetingsToGoogle: boolean;
  },
  secret: ["clientSecret"],
});

const g = globalThis as { __kalendarGoogleClient?: GoogleCalendarClient | null };

/** Podstrčí klienta (fake Google v testech); `null` se vrátí ke skutečnému. Globálně: Next bundluje trasy zvlášť. */
export function setGoogleClientOverride(client: GoogleCalendarClient | null): void {
  g.__kalendarGoogleClient = client;
}

/** Je Google OAuth klient nastavený (nebo podstrčený)? */
export async function isConfigured(db: Executor, env: KalEnv): Promise<boolean> {
  if (g.__kalendarGoogleClient) return true;
  const s = await env.settings.get(db, googleCalendarSetting);
  return !!(s.clientId && s.clientSecret);
}

/** Klient Google API: podstrčený, jinak skutečný z nastavení. Bez nastavení srozumitelná chyba. */
export async function googleClient(db: Executor, env: KalEnv): Promise<GoogleCalendarClient> {
  if (g.__kalendarGoogleClient) return g.__kalendarGoogleClient;
  const s = await env.settings.get(db, googleCalendarSetting);
  if (!s.clientId || !s.clientSecret)
    throw new UserError(
      "Google Kalendář není nastavený. Správce musí v Nastavení → Google Kalendář zadat OAuth klienta (viz docs/moduly/kalendar.md).",
    );
  return createGoogleClient({ clientId: s.clientId, clientSecret: s.clientSecret });
}

/** Adresa, na kterou se Google vrací po souhlasu (musí být v Google Cloud Console jako „Authorized redirect URI“). */
export const redirectUri = (env: Pick<KalEnv, "baseURL">) =>
  `${env.baseURL.replace(/\/$/, "")}/api/kalendar/google/callback`;
/** Adresa push kanálů. */
export const webhookUrl = (env: Pick<KalEnv, "baseURL">) =>
  `${env.baseURL.replace(/\/$/, "")}/api/kalendar/google/webhook`;
/** Push kanály Google povolí jen na `https`; jinak běží jen pravidelná synchronizace. */
export const pushAvailable = (env: Pick<KalEnv, "baseURL">) => env.baseURL.startsWith("https://");
