import type { DashboardSummary } from "@rebar/core/dashboards-shared";

/** Čisté pomocné funkce Nastavení → Nástěnky (bez Reactu, aby šly testovat samostatně). */

export type BoardKind = "default" | "shared" | "personal";

export const BOARD_KIND: Record<BoardKind, { label: string; color: string }> = {
  default: { label: "Výchozí pro roli", color: "blue" },
  shared: { label: "Sdílená", color: "green" },
  personal: { label: "Osobní", color: "gray" },
};

/**
 * Druh nástěnky z pohledu správce. `kind` ze serveru je vztažený k přihlášenému, proto se druh odvozuje z dat:
 * výchozí pro roli má přednost, pak sdílená (s rolí nebo uživatelem), jinak osobní.
 */
export function boardKind(b: Pick<DashboardSummary, "defaultForRole" | "shared">): BoardKind {
  if (b.defaultForRole) return "default";
  if (b.shared.roles.length > 0 || b.shared.users.length > 0) return "shared";
  return "personal";
}

/** Autor, nebo „Sada klienta“ u nástěnek založených při instalaci (nemají autora). */
export const authorText = (b: Pick<DashboardSummary, "ownerName">) => b.ownerName ?? "Sada klienta";

/** Počet widgetů s českým tvarem: „1 widget“, „3 widgety“, „5 widgetů“. */
export function widgetCountText(n: number): string {
  if (n === 1) return "1 widget";
  return n >= 2 && n <= 4 ? `${n} widgety` : `${n} widgetů`;
}

/** Komu je nástěnka sdílená: názvy rolí a jména uživatelů; neznámá role se ukáže klíčem. */
export function sharedWith(
  b: Pick<DashboardSummary, "shared">,
  roleNames: ReadonlyMap<string, string>,
  userNames: ReadonlyMap<string, string>,
): string[] {
  return [
    ...b.shared.roles.map((k) => roleNames.get(k) ?? k),
    ...b.shared.users.map((id) => userNames.get(id) ?? "Neznámý uživatel"),
  ];
}

/** Zkrácený výpis: „Majitel, Kancelář a 2 další“. */
export function sharedSummary(names: readonly string[], max = 2): string {
  if (names.length === 0) return "—";
  if (names.length <= max) return names.join(", ");
  const rest = names.length - max;
  return `${names.slice(0, max).join(", ")} a ${rest} ${rest < 5 ? "další" : "dalších"}`;
}

export type RoleDefault = {
  roleKey: string;
  roleName: string;
  boards: { id: string; name: string; isHome: boolean }[];
};

/** Souhrn „Výchozí nástěnky podle rolí“: pro každou roli nástěnky, které jsou pro ni výchozí. */
export function roleDefaults(
  boards: readonly Pick<DashboardSummary, "id" | "name" | "defaultForRole" | "isHome">[],
  roles: readonly { key: string; name: string }[],
): RoleDefault[] {
  return roles.map((r) => ({
    roleKey: r.key,
    roleName: r.name,
    boards: boards
      .filter((b) => b.defaultForRole === r.key)
      .map((b) => ({ id: b.id, name: b.name, isHome: b.isHome })),
  }));
}

/** Řazení: výchozí pro roli, pak sdílené, pak osobní; uvnitř skupiny podle názvu (česky). */
export function sortBoards<T extends Pick<DashboardSummary, "name" | "defaultForRole" | "shared">>(
  boards: readonly T[],
): T[] {
  const rank: Record<BoardKind, number> = { default: 0, shared: 1, personal: 2 };
  return [...boards].sort(
    (a, b) => rank[boardKind(a)] - rank[boardKind(b)] || a.name.localeCompare(b.name, "cs"),
  );
}
