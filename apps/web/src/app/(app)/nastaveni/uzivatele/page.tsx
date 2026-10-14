import { listUsers, lookupRoles } from "@rebar/core/admin";
import { listInvitations } from "@rebar/core/auth";
import { requireCan } from "@/server/request";
import { UsersAdmin } from "./users-admin";

export const metadata = { title: "Uživatelé" };

export default async function UsersPage() {
  const ctx = await requireCan("users.manage");
  const [users, invitations, roles] = await Promise.all([
    listUsers(ctx),
    listInvitations(ctx),
    lookupRoles(ctx),
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
