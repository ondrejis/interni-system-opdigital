/**
 * Canary řetězec soukromých záznamů (D §5.4): jméno nebo částka soukromého záznamu ve fixture. Výsledek jakékoli cesty,
 * kterou spustí partner, ho nesmí obsahovat; výsledek vlastníka ho obsahovat musí.
 */
export const CANARY_PREFIX = "PRIVATE-CANARY";

/** Canary řetězec s číslem (`PRIVATE-CANARY-3`); číslo odliší záznamy, aby šlo poznat, který unikl. */
export const canary = (n: string | number): string => `${CANARY_PREFIX}-${n}`;

/** Jednotlivé znaky/části výsledku jako text (pro hledání canary v čemkoli, co cesta vrátila). */
export function serialize(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) ?? "";
}

/** Obsahuje výsledek cesty canary řetězec soukromého záznamu? */
export function hasCanary(value: unknown): boolean {
  return serialize(value).includes(CANARY_PREFIX);
}

/** Částka soukromé platby ve fixture (haléře): kdyby se objevila v součtu partnera, součet je špatně. */
export const PRIVATE_AMOUNT_MINOR = 987_654_321;
/** Částka sdílené platby ve fixture (haléře). */
export const SHARED_AMOUNT_MINOR = 123_400;
