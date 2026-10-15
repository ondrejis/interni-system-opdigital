import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { recordAudit } from "../audit/audit";
import { schema, type Db } from "../db/client";
import { createCtx, inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import type { Auth } from "./create-auth";
import type { Mailer } from "./mailer";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password";
import { assertPasswordAcceptable, type BreachCheck } from "./password-policy";
import { deriveShortName } from "./user-fields";

/** Pozvánka platí 48 hodin od vytvoření (AUT-02); pak ji musí majitel vystavit znovu. */
export const INVITATION_TTL_HOURS = 48;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export const inviteInput = z.object({
  email: z.email("Neplatný e-mail."),
  roleId: z.uuid("Vyberte roli."),
});

/** Pozve uživatele e-mailem. Předchozí nevyřízené pozvánky na stejný e-mail se zneplatní. */
export async function createInvitation(
  ctx: Ctx,
  input: z.input<typeof inviteInput>,
  deps: { mailer: Mailer; baseURL: string },
) {
  assertCan(ctx, "users.manage");
  const { email, roleId } = inviteInput.parse(input);
  const normalized = email.trim().toLowerCase();

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3_600_000);

  const invitation = await inTx(ctx, async (c) => {
    const [role] = await c.db
      .select()
      .from(schema.role)
      .where(and(eq(schema.role.id, roleId), isNull(schema.role.deletedAt)));
    if (!role) throw new UserError("Vybraná role neexistuje.");
    if (role.isSystem && !c.actor.unrestricted && !c.actor.systemRole)
      throw new PermissionError("Systémovou roli smí přidělit jen majitel.");
    const [existing] = await c.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(and(sql`lower(${schema.user.email}) = ${normalized}`, isNull(schema.user.deletedAt)));
    if (existing) throw new UserError("Uživatel s tímto e-mailem už existuje.");

    await c.db
      .update(schema.invitation)
      .set({ revokedAt: new Date(), updatedBy: c.actor.userId })
      .where(
        and(
          sql`lower(${schema.invitation.email}) = ${normalized}`,
          isNull(schema.invitation.acceptedAt),
          isNull(schema.invitation.revokedAt),
        ),
      );

    const [inv] = await c.db
      .insert(schema.invitation)
      .values({
        email: normalized,
        roleId,
        tokenHash: sha256(token),
        expiresAt,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning({ id: schema.invitation.id });
    await recordAudit(c, {
      action: "create",
      entityType: "invitation",
      entityId: inv!.id,
      summary: `Pozvánka pro ${normalized} (role ${role.name})`,
      changes: [
        { field: "email", old: null, new: normalized },
        { field: "role", old: null, new: role.key },
      ],
    });
    return inv!;
  });

  const url = `${deps.baseURL.replace(/\/$/, "")}/pozvanka/${token}`;
  await deps.mailer.send({
    to: normalized,
    template: "invitation",
    vars: {
      url,
      expiresIn: `${INVITATION_TTL_HOURS} hodin`,
      expiresInDays: String(Math.ceil(INVITATION_TTL_HOURS / 24)),
    },
  });
  return { id: invitation.id, expiresAt };
}

export async function revokeInvitation(ctx: Ctx, id: string) {
  assertCan(ctx, "users.manage");
  await inTx(ctx, async (c) => {
    const [inv] = await c.db
      .update(schema.invitation)
      .set({ revokedAt: new Date(), updatedBy: c.actor.userId })
      .where(
        and(
          eq(schema.invitation.id, id),
          isNull(schema.invitation.acceptedAt),
          isNull(schema.invitation.revokedAt),
        ),
      )
      .returning({ id: schema.invitation.id, email: schema.invitation.email });
    if (!inv) throw new NotFoundError("Pozvánka nenalezena nebo už byla vyřízena.");
    await recordAudit(c, {
      action: "revoke",
      entityType: "invitation",
      entityId: id,
      summary: `Pozvánka pro ${inv.email} zrušena`,
    });
  });
}

export async function listInvitations(ctx: Ctx) {
  assertCan(ctx, "users.manage");
  return ctx.db
    .select({
      id: schema.invitation.id,
      email: schema.invitation.email,
      roleName: schema.role.name,
      expiresAt: schema.invitation.expiresAt,
      acceptedAt: schema.invitation.acceptedAt,
      revokedAt: schema.invitation.revokedAt,
    })
    .from(schema.invitation)
    .innerJoin(schema.role, eq(schema.invitation.roleId, schema.role.id))
    .where(isNull(schema.invitation.deletedAt))
    .orderBy(desc(schema.invitation.createdAt))
    .limit(200);
}

const INVALID = "Pozvánka je neplatná nebo vypršela. Požádejte o novou.";

/** Co ukázat na stránce pozvánky (bez přihlášení): komu je určena a do jaké role. */
export async function inspectInvitation(db: Db, token: string) {
  const [row] = await db
    .select({ email: schema.invitation.email, roleName: schema.role.name })
    .from(schema.invitation)
    .innerJoin(schema.role, eq(schema.invitation.roleId, schema.role.id))
    .where(
      and(
        eq(schema.invitation.tokenHash, sha256(token)),
        isNull(schema.invitation.acceptedAt),
        isNull(schema.invitation.revokedAt),
        sql`${schema.invitation.expiresAt} > now()`,
      ),
    );
  return row ?? null;
}

export const acceptInput = z.object({
  token: z.string().min(20),
  name: z.string().trim().min(2, "Vyplňte jméno."),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`)
    .max(MAX_PASSWORD_LENGTH),
});

/**
 * Přijetí pozvánky (bez přihlášení): vytvoří uživatele s heslem. Pozvánku nejdřív „zabere“
 * jedním UPDATE, takže ji nejde přijmout dvakrát souběžně; při selhání se vrátí.
 * Heslo musí projít pravidly (≥ 12 znaků, ne běžné ani uniklé, bez jména a e-mailu); `deps.breachCheck` jen pro testy.
 */
export async function acceptInvitation(
  deps: { auth: Auth; db: Db; breachCheck?: BreachCheck },
  input: z.input<typeof acceptInput>,
) {
  const { token, name, password } = acceptInput.parse(input);
  const { db, auth } = deps;

  const [inv] = await db
    .update(schema.invitation)
    .set({ acceptedAt: new Date() })
    .where(
      and(
        eq(schema.invitation.tokenHash, sha256(token)),
        isNull(schema.invitation.acceptedAt),
        isNull(schema.invitation.revokedAt),
        sql`${schema.invitation.expiresAt} > now()`,
      ),
    )
    .returning();
  if (!inv) throw new UserError(INVALID);

  const release = () =>
    db.update(schema.invitation).set({ acceptedAt: null }).where(eq(schema.invitation.id, inv.id));
  try {
    const [taken] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(
        and(sql`lower(${schema.user.email}) = lower(${inv.email})`, isNull(schema.user.deletedAt)),
      );
    if (taken) throw new UserError("Uživatel s tímto e-mailem už existuje.");

    await assertPasswordAcceptable(password, {
      email: inv.email,
      name,
      ...(deps.breachCheck !== undefined ? { breachCheck: deps.breachCheck } : {}),
    });

    const bac = await auth.$context;
    const user = await bac.internalAdapter.createUser(
      { email: inv.email, name, emailVerified: true, roleId: inv.roleId, active: true },
      { method: "invitation" },
    );
    await bac.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await bac.password.hash(password),
    });
    await db
      .update(schema.user)
      .set({ createdBy: inv.createdBy, updatedBy: user.id, shortName: deriveShortName(name) })
      .where(eq(schema.user.id, user.id));

    const actor = {
      kind: "user" as const,
      userId: user.id,
      roleKey: null,
      permissions: new Map(),
      unrestricted: false,
      restriction: null,
    };
    await recordAudit(createCtx(db, actor), {
      action: "create",
      entityType: "user",
      entityId: user.id,
      summary: `Uživatel ${name} přijal pozvánku`,
      changes: [
        { field: "email", old: null, new: inv.email },
        { field: "invitationId", old: null, new: inv.id },
      ],
    });
    return { userId: user.id, email: inv.email };
  } catch (err) {
    await release();
    throw err;
  }
}
