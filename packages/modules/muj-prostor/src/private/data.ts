import { formatMinor } from "@rebar/core/shared";
import {
  queryRecords,
  resolveEntity,
  type EntityDef,
  type RecordRow,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { canSeePrivate, scopeOf } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import type { PrivateGroup, PrivateOverview, PrivateRow } from "./types";

/** Nejvíc záznamů jednoho typu, které přehled ukáže (nejnověji upravené). */
export const PRIVATE_GROUP_LIMIT = 100;
/** Kolik záznamů typu se načte, než se seřadí podle poslední úpravy. */
const FETCH_LIMIT = 300;

/** Typy, které přehled ukazuje jako první (zakázky, úkoly, poznámky); ostatní podle názvu. */
export const PRIVATE_TYPE_ORDER = ["job", "task", "note"] as const;

const csDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
};

/** Stručný popis záznamu z prvních dvou vyplněných výchozích sloupců (výběr, datum, částka, text). */
export function describeRow(e: ResolvedEntity, row: RecordRow): string | null {
  const parts: string[] = [];
  for (const a of e.attributes) {
    if (parts.length >= 2) break;
    if (a.key === e.def.titleKey || !a.defaultVisible) continue;
    const v = row[a.key];
    if (v === null || v === undefined || v === "") continue;
    if (a.type === "select" || a.type === "status")
      parts.push(a.choices?.find((c) => c.value === v)?.label ?? String(v));
    else if (a.type === "date") parts.push(csDate(String(v)));
    else if (a.type === "currency") parts.push(formatMinor(Number(v)));
    else if (a.type === "text" || a.type === "number") parts.push(String(v));
  }
  return parts.length ? parts.join(" · ") : null;
}

const rank = (key: string) => {
  const i = (PRIVATE_TYPE_ORDER as readonly string[]).indexOf(key);
  return i === -1 ? PRIVATE_TYPE_ORDER.length : i;
};

async function groupOf(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry">,
  def: EntityDef,
): Promise<PrivateGroup | null> {
  if (!scopeOf(ctx, def.permissions.read)) return null;
  const entity = await resolveEntity(ctx.db, def);
  const page = await queryRecords(ctx, deps.registry, entity, {
    filters: { op: "and", conditions: [{ attr: "isPrivate", op: "is_true" }] },
    limit: FETCH_LIMIT,
  });
  if (!page.total) return null;
  const rows: PrivateRow[] = page.rows
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, PRIVATE_GROUP_LIMIT)
    .map((r) => ({
      id: r.id,
      title: String(r[def.titleKey] ?? "").trim() || def.label.one,
      href: def.url(r.id),
      detail: describeRow(entity, r),
      updatedAt: r.updatedAt,
    }));
  return {
    entityType: def.key,
    label: def.label.many,
    listPath: def.listPath,
    total: page.total,
    rows,
    truncated: page.total > rows.length,
  };
}

/**
 * Přehled všech soukromých záznamů (SOUK-01): projde entity se zámkem, které aktér smí číst, a vrátí soukromé záznamy
 * seskupené podle typu (zakázky, úkoly, poznámky první). Čte přes engine entit, takže platí rozsah i zámek. Kdo soukromé
 * záznamy nesmí vidět (bez `private.read`), dostane prázdný přehled.
 */
export async function loadPrivateOverview(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry" | "services">,
): Promise<PrivateOverview> {
  const canCreateNote = !!deps.services.optional("tasks") && !!deps.registry.get("note");
  if (!canSeePrivate(ctx)) return { groups: [], total: 0, canCreateNote: false };
  const groups: PrivateGroup[] = [];
  for (const def of deps.registry.all()) {
    if (!def.visibility) continue;
    const g = await groupOf(ctx, deps, def);
    if (g) groups.push(g);
  }
  groups.sort(
    (a, b) => rank(a.entityType) - rank(b.entityType) || a.label.localeCompare(b.label, "cs"),
  );
  return { groups, total: groups.reduce((n, g) => n + g.total, 0), canCreateNote };
}
