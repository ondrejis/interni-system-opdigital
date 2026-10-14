import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "../audit/audit";
import { schema, type Db } from "../db/client";
import { createCtx } from "../rbac/context";
import { UserError } from "../rbac/errors";
import type { Auth } from "./create-auth";
import { MIN_PASSWORD_LENGTH } from "./password";

/**
 * Založí prvního uživatele (majitele) při instalaci. Idempotentní: když uživatel s e-mailem už je, nedělá nic.
 * Roli `owner` musí předtím založit seed. Heslo se nikam nezapisuje a vynutí se jeho změna až přes 2FA a pozvánky.
 */
export async function bootstrapOwner(
  deps: { auth: Auth; db: Db },
  input: { email: string; name: string; password: string; roleKey?: string },
) {
  const { auth, db } = deps;
  const email = input.email.trim().toLowerCase();
  if (input.password.length < MIN_PASSWORD_LENGTH)
    throw new UserError(`Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`);

  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(and(sql`lower(${schema.user.email}) = ${email}`, isNull(schema.user.deletedAt)));
  if (existing) return { userId: existing.id, created: false };

  const [role] = await db
    .select({ id: schema.role.id })
    .from(schema.role)
    .where(and(eq(schema.role.key, input.roleKey ?? "owner"), isNull(schema.role.deletedAt)));
  if (!role)
    throw new Error(`Role „${input.roleKey ?? "owner"}“ neexistuje. Nejdřív spusťte seed.`);

  const bac = await auth.$context;
  const user = await bac.internalAdapter.createUser(
    { email, name: input.name, emailVerified: true, roleId: role.id, active: true },
    { method: "bootstrap" },
  );
  await bac.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await bac.password.hash(input.password),
  });
  await recordAudit(
    createCtx(db, {
      kind: "system",
      userId: null,
      roleKey: null,
      permissions: new Map(),
      unrestricted: true,
      restriction: null,
    }),
    {
      action: "create",
      entityType: "user",
      entityId: user.id,
      summary: `Založen první uživatel ${email}`,
      changes: [{ field: "email", old: null, new: email }],
    },
  );
  return { userId: user.id, created: true };
}
