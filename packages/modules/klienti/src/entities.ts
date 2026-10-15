import type { EntityDef } from "@rebar/core/entities";

/** Modul „klienti“ nemá vlastní entity: klient je organizace (`company`) se stavem klienta; pravidla přidává `lifecycle.ts`. */
export const entities: readonly EntityDef[] = [];
