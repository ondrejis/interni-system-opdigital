import { collectPermissions } from "@rebar/core";
import { listRoles } from "@rebar/core/admin";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";
import { RolesAdmin } from "./roles-admin";

export const metadata = { title: "Role a oprávnění" };

export default async function RolesPage() {
  const ctx = await requireCan("roles.manage");
  const { runtime } = getServices();
  const roles = await listRoles(ctx);
  const moduleOf = (key: string) => runtime.modules.find((m) => key.startsWith(`${m.id}.`));
  const catalog = collectPermissions(runtime.modules).map((p) => ({
    key: p.key,
    label: p.label,
    description: p.description ?? null,
    group: moduleOf(p.key)?.name ?? "Platforma",
    // Rozsah „jen moje“ dává smysl u oprávnění modulů (záznamy s vlastníkem) a u úkolů.
    scoped: !!moduleOf(p.key) || p.key === "tasks.read",
  }));
  return (
    <RolesAdmin
      catalog={catalog}
      roles={roles.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        require2fa: r.require2fa,
        userCount: r.userCount,
        permissions: r.permissions,
      }))}
    />
  );
}
