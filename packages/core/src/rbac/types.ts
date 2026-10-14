import type { Executor } from "../db/client";

/** `all` = všechny záznamy, `own` = jen vlastní nebo přidělené. */
export type Scope = "all" | "own";

export type ActorKind = "user" | "system" | "agency";

/** Omezená relace: dokud uživatel neudělá požadovaný krok, smí jen self-service oprávnění. */
export type Restriction = "2fa_setup";

export type Actor = {
  kind: ActorKind;
  userId: string | null;
  roleKey: string | null;
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
