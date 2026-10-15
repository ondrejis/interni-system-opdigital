import { sql, type SQL } from "drizzle-orm";
import type { Executor } from "../db/client";

/** Kanál PostgreSQL `LISTEN/NOTIFY`, na kterém se šíří změny záznamů do prohlížečů (SSE `/api/realtime`). */
export const REALTIME_CHANNEL = "opsys_change";

/**
 * Zpráva o změně. Nese jen typ a id záznamu, nikdy data: klient si je po signálu dotáhne přes engine, který
 * vynucuje viditelnost (soukromé záznamy partnerovi nevrátí). `p` = soukromý záznam (server ho nepošle
 * tomu, kdo soukromé nesmí vidět), `x` = typ nadřazeného záznamu (komentář, soubor, platba…).
 */
export type RealtimeChange = {
  /** Typ záznamu (klíč entity, nebo typ vedlejšího záznamu). */
  e: string;
  /** Id záznamu. */
  i: string;
  /** Akce (`create`, `update`, `delete`, `restore`, `visibility_changed`, název doménové události…). */
  a: string;
  /** Soukromý záznam. */
  p: boolean;
  /** Typ nadřazeného záznamu z kontextu změny. */
  x?: string;
  /** Id nadřazeného záznamu z kontextu změny. */
  y?: string;
};

/** Vstup `notifyChange`: změněný záznam, akce a zda je záznam soukromý. */
export type NotifyInput = {
  entityType: string;
  entityId: string;
  action: string;
  /** Hodnota, nebo SQL výraz (zjištění z `private_record`). */
  isPrivate: boolean | SQL<boolean>;
  parentType?: string | undefined;
  parentId?: string | undefined;
};

/**
 * Pošle signál o změně záznamu. Volat v téže transakci jako změna: PostgreSQL ho doručí až při commitu (zrušená
 * transakce nic nerozešle) a shodné zprávy v jedné transakci sloučí. Zpráva je malá (jen typ, id a akce), nepřekročí limit
 * 8 kB payloadu.
 */
export async function notifyChange(db: Executor, input: NotifyInput): Promise<void> {
  const isPrivate =
    typeof input.isPrivate === "boolean" ? sql`${input.isPrivate}::boolean` : input.isPrivate;
  await db.execute(
    sql`select pg_notify(${REALTIME_CHANNEL}, json_strip_nulls(json_build_object(
      'e', ${input.entityType}::text,
      'i', ${input.entityId}::text,
      'a', ${input.action}::text,
      'p', coalesce((${isPrivate})::boolean, false),
      'x', ${input.parentType ?? null}::text,
      'y', ${input.parentId ?? null}::text))::text)`,
  );
}
