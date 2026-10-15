import { schema } from "@rebar/core/db";
import { isNull } from "drizzle-orm";
import { listInvitations, listManagedUsers } from "@rebar/core/auth";
import { requireCan } from "@/server/request";
import { UsersAdmin } from "./users-admin";

export const metadata = { title: "Uživatelé" };

export default async function UsersPage() {
  const ctx = await requireCan("users.manage");
  const [users, invitations, roles] = await Promise.all([
    listManagedUsers(ctx),
    listInvitations(ctx),
    ctx.db
      .select({
        id: schema.role.id,
        name: schema.role.name,
        key: schema.role.key,
        isSystem: schema.role.isSystem,
      })
      .from(schema.role)
      .where(isNull(schema.role.deletedAt))
      .orderBy(schema.role.name),
  ]);
  const now = Date.now();
  return (
    <UsersAdmin
      me={ctx.actor.userId ?? ""}
      users={users.map((u) => ({
        ...u,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      }))}
      roles={roles}
      invitations={invitations
        .filter((i) => !i.acceptedAt && !i.revokedAt && i.expiresAt.getTime() > now)
        .map((i) => ({
          id: i.id,
          email: i.email,
          roleName: i.roleName,
          expiresAt: i.expiresAt.toISOString(),
        }))}
    />
  );
}
