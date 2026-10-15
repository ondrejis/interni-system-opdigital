import type { Executor } from "../db/client";

/** `all` = všechny záznamy, `own` = jen vlastní nebo přidělené. */
export type Scope = "all" | "own";

/**
 * Druh aktéra změny: uživatel, systém (úlohy), servisní přístup agentury, nebo vnější zdroj (n8n, Google, Meta,
 * naplánovaná úloha). Vnější zdroje a úlohy jsou `unrestricted`; v historii je vidět `kind` a `label`.
 */
export type ActorKind = "user" | "system" | "agency" | "n8n" | "google" | "meta" | "job";

/** Omezená relace: dokud uživatel neudělá požadovaný krok, smí jen self-service oprávnění. */
export type Restriction = "2fa_setup";

export type Actor = {
  kind: ActorKind;
  userId: string | null;
  roleKey: string | null;
  /** Popisek vnějšího aktéra do historie (např. „n8n: Disk“, „Google Kalendář“); u uživatele prázdný. */
  label?: string | undefined;
  /** Role aktéra je systémová (owner). Jen takový aktér smí přidělovat systémové role. */
  systemRole?: boolean;
  /** Oprávnění role v aktuální sestavě modulů (oprávnění vypnutých modulů tu nejsou). */
  permissions: ReadonlyMap<string, Scope>;
  /** Systémový aktér (úlohy na pozadí) smí všechno. */
  unrestricted: boolean;
  restriction: Restriction | null;
};

export type Ctx = {
  actor: Actor;
  /** Připojení, nebo transakce — viz `inTx`. */
  db: Executor;
  requestId?: string | undefined;
  ip?: string | null | undefined;
};

/** Oprávnění, která smí i omezená relace (např. nastavení vlastního 2FA). */
export const SELF_SERVICE_PERMISSIONS: readonly string[] = ["account.self"];
