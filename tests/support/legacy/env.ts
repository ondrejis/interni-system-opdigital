import type { Db } from "@rebar/core/db";
import type { EntityDef } from "@rebar/core/entities";
import type { Ctx } from "@rebar/core/rbac";
import type { Collected } from "../../../apps/web/src/server/modules-server";

/** Role OPSYS (`clients/opsys/seed`): vlastník, partner a externista (vidí jen své zakázky). */
export const ROLE_KEYS = ["owner", "partner", "externista"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export type Person = { id: string; ctx: Ctx; role: RoleKey; name: string };

/** Co dostává každá část fixtury: databáze, sebrané registry modulů a lidé. */
export type FixtureEnv = {
  db: Db;
  collected: Collected;
  entityDef: (key: string) => EntityDef;
  people: Record<"owner" | "partner" | "externistaA" | "externistaB", Person>;
};
