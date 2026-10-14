"use client";

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({ plugins: [twoFactorClient()] });

/** Přeloží chybu z autentizace na srozumitelnou hlášku. */
export function authErrorMessage(
  error: { status?: number; message?: string; code?: string } | null | undefined,
): string {
  if (!error) return "";
  // Nejdřív konkrétní kódy — stavový kód 401 mají i chybné kódy druhého faktoru.
  switch (error.code) {
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_CODE":
      return "Kód není správný.";
    case "INVALID_BACKUP_CODE":
      return "Záložní kód není správný nebo už byl použit.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "Účet je dočasně zamčený po opakovaných chybách. Zkuste to za chvíli.";
    case "INVALID_TWO_FACTOR_COOKIE":
    case "TWO_FACTOR_NOT_ENABLED":
      return "Přihlášení vypršelo. Přihlaste se znovu heslem.";
    case "INVALID_TOKEN":
      return "Odkaz je neplatný nebo vypršel. Požádejte o nový.";
    case "TWO_FACTOR_REQUIRED_FOR_ROLE":
      return "Pro vaši roli je dvoufázové ověření povinné, nejde vypnout.";
    case "INVALID_PASSWORD":
      return "Nesprávné heslo.";
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Nesprávný e-mail nebo heslo.";
    case "PASSWORD_TOO_SHORT":
      return "Heslo je příliš krátké.";
    case "PASSWORD_TOO_LONG":
      return "Heslo je příliš dlouhé.";
    case "USER_ALREADY_EXISTS":
      return "Uživatel s tímto e-mailem už existuje.";
    case "SESSION_EXPIRED":
    case "FAILED_TO_GET_SESSION":
      return "Přihlášení vypršelo. Přihlaste se znovu.";
  }
  if (error.status === 429) return "Příliš mnoho pokusů. Zkuste to za minutu.";
  if (error.status === 401) return "Nesprávný e-mail nebo heslo.";
  // text z knihovny bývá anglicky; uživateli se ukáže jen, když je česky (má diakritiku)
  if (error.message && /[ěščřžýáíéúůďťňó]/i.test(error.message)) return error.message;
  return "Něco se nepovedlo. Zkuste to prosím znovu.";
}
