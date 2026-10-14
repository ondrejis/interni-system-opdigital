import { and, asc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { recordAudit } from "../audit/audit";
import { schema } from "../db/client";
import type { Executor } from "../db/client";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { DEFINITION_VERSION } from "./types";
import type { DashboardDefinition, DashboardKind, DashboardSummary } from "./types";
import {
  emptyDefinition,
  MAX_BOARDS_PER_USER,
  migrateDefinition,
  parseDefinition,
} from "./definition";

/** Oprávnění: skládat vlastní nástěnky / spravovat cizí, výchozí a sdílené. */
export const DASHBOARD_WRITE = "dashboards.write";
export const DASHBOARD_MANAGE = "dashboards.manage";

const me = (ctx: Ctx): string => {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
};

const trimName = (name: string): string => {
  const n = name.trim();
  if (!n) throw new UserError("Vyplňte název nástěnky.");
  if (n.length > 60) throw new UserError("Název nástěnky může mít nejvýš 60 znaků.");
  return n;
};

type Row = typeof schema.dashboard.$inferSelect;

/** Podmínka „nástěnku smí aktér vidět“: moje, sdílená s mou rolí / se mnou, nebo výchozí pro mou roli. */
function visibleWhere(ctx: Ctx): SQL {
  const user = me(ctx);
  const role = ctx.actor.roleKey ?? "";
  return or(
    eq(schema.dashboard.ownerId, user),
    eq(schema.dashboard.defaultForRole, role),
    sql`exists (select 1 from ${schema.dashboardShare} s where s.dashboard_id = ${schema.dashboard.id} and ((s.kind = 'role' and s.ref = ${role}) or (s.kind = 'user' and s.ref = ${user})))`,
  )!;
}

async function sharesOf(db: Executor, ids: readonly string[]) {
  const out = new Map<string, { roles: string[]; users: string[] }>();
  if (!ids.length) return out;
  const rows = await db
    .select()
    .from(schema.dashboardShare)
    .where(inArray(schema.dashboardShare.dashboardId, [...ids]));
  for (const r of rows) {
    const s = out.get(r.dashboardId) ?? { roles: [], users: [] };
    (r.kind === "role" ? s.roles : s.users).push(r.ref);
    out.set(r.dashboardId, s);
  }
  return out;
}

function summarize(
  ctx: Ctx,
  r: Row,
  ownerName: string | null,
  shared: { roles: string[]; users: string[] },
  position: number,
): DashboardSummary {
  const user = ctx.actor.userId;
  const mine = r.ownerId === user;
  const kind: DashboardKind = mine
    ? "personal"
    : r.defaultForRole && r.defaultForRole === ctx.actor.roleKey
      ? "role_default"
      : "shared";
  const w = (r.definition as { widgets?: unknown }).widgets;
  const widgetCount = Array.isArray(w) ? w.length : 0;
  return {
    id: r.id,
    name: r.name,
    kind,
    mine,
    canEdit: can(ctx, DASHBOARD_MANAGE) || (mine && can(ctx, DASHBOARD_WRITE)),
    ownerName,
    defaultForRole: r.defaultForRole,
    isHome: r.isHome,
    shared,
    widgetCount,
    position,
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function load(ctx: Ctx, id: string, opts: { manage?: boolean } = {}): Promise<Row> {
  const [row] = await ctx.db
    .select()
    .from(schema.dashboard)
    .where(
      and(
        eq(schema.dashboard.id, id),
        isNull(schema.dashboard.deletedAt),
        opts.manage && can(ctx, DASHBOARD_MANAGE) ? undefined : visibleWhere(ctx),
      ),
    );
  if (!row) throw new NotFoundError("Nástěnka nenalezena.");
  return row;
}

function assertEditable(ctx: Ctx, row: Row) {
  if (can(ctx, DASHBOARD_MANAGE)) return;
  if (row.ownerId === ctx.actor.userId && can(ctx, DASHBOARD_WRITE)) return;
  throw new PermissionError("Tuto nástěnku může upravit jen její autor nebo správce.");
}

/**
 * Nástěnky, které aktér vidí, v pořadí přepínače: nejdřív podle jeho vlastního řazení, pak výchozí pro roli,
 * moje a sdílené (podle názvu).
 */
export async function listBoards(ctx: Ctx): Promise<DashboardSummary[]> {
  const user = me(ctx);
  const rows = await ctx.db
    .select({
      d: schema.dashboard,
      owner: schema.user.name,
      pos: schema.dashboardPref.position,
    })
    .from(schema.dashboard)
    .leftJoin(schema.user, eq(schema.user.id, schema.dashboard.ownerId))
    .leftJoin(
      schema.dashboardPref,
      and(
        eq(schema.dashboardPref.dashboardId, schema.dashboard.id),
        eq(schema.dashboardPref.userId, user),
      ),
    )
    .where(and(isNull(schema.dashboard.deletedAt), visibleWhere(ctx)))
    .orderBy(asc(schema.dashboard.createdAt));
  const shares = await sharesOf(
    ctx.db,
    rows.map((r) => r.d.id),
  );
  const out = rows.map((r) =>
    summarize(ctx, r.d, r.owner, shares.get(r.d.id) ?? { roles: [], users: [] }, r.pos ?? 10_000),
  );
  const rank = (s: DashboardSummary) =>
    s.isHome && s.kind === "role_default"
      ? 0
      : s.kind === "role_default"
        ? 1
        : s.kind === "personal"
          ? 2
          : 3;
  return out.sort(
    (a, b) => a.position - b.position || rank(a) - rank(b) || a.name.localeCompare(b.name, "cs"),
  );
}

/** Správce: všechny nástěnky v systému (Nastavení → Nástěnky). */
export async function listAllBoards(ctx: Ctx): Promise<DashboardSummary[]> {
  if (!can(ctx, DASHBOARD_MANAGE)) throw new PermissionError();
  const rows = await ctx.db
    .select({ d: schema.dashboard, owner: schema.user.name })
    .from(schema.dashboard)
    .leftJoin(schema.user, eq(schema.user.id, schema.dashboard.ownerId))
    .where(isNull(schema.dashboard.deletedAt))
    .orderBy(asc(schema.dashboard.createdAt));
  const shares = await sharesOf(
    ctx.db,
    rows.map((r) => r.d.id),
  );
  return rows.map((r) =>
    summarize(ctx, r.d, r.owner, shares.get(r.d.id) ?? { roles: [], users: [] }, 0),
  );
}

export type BoardDetail = { summary: DashboardSummary; definition: DashboardDefinition };

/** Otevření nástěnky; správce nástěnek smí otevřít i cizí (kontrola ze Nastavení, jak vypadá výchozí sada role). */
export async function getBoard(ctx: Ctx, id: string): Promise<BoardDetail> {
  const row = await load(ctx, id, { manage: true });
  const [owner] = row.ownerId
    ? await ctx.db
        .select({ name: schema.user.name })
        .from(schema.user)
        .where(eq(schema.user.id, row.ownerId))
    : [];
  const shares = await sharesOf(ctx.db, [row.id]);
  return {
    summary: summarize(
      ctx,
      row,
      owner?.name ?? null,
      shares.get(row.id) ?? { roles: [], users: [] },
      0,
    ),
    definition: migrateDefinition(row.definition),
  };
}

/** Nástěnka, která se má otevřít na úvodní stránce místo klasického Přehledu (výchozí pro roli s příznakem „domů“). */
export async function homeBoardId(ctx: Ctx): Promise<string | null> {
  const role = ctx.actor.roleKey;
  if (!role || !ctx.actor.userId) return null;
  const [r] = await ctx.db
    .select({ id: schema.dashboard.id })
    .from(schema.dashboard)
    .where(
      and(
        eq(schema.dashboard.defaultForRole, role),
        eq(schema.dashboard.isHome, true),
        isNull(schema.dashboard.deletedAt),
      ),
    );
  return r?.id ?? null;
}

export async function createBoard(
  ctx: Ctx,
  input: { name: string; definition?: unknown },
): Promise<{ id: string }> {
  if (!can(ctx, DASHBOARD_WRITE)) throw new PermissionError();
  const user = me(ctx);
  const name = trimName(input.name);
  const definition = input.definition ? parseDefinition(input.definition) : emptyDefinition();
  return inTx(ctx, async (c) => {
    const [count] = await c.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.dashboard)
      .where(and(eq(schema.dashboard.ownerId, user), isNull(schema.dashboard.deletedAt)));
    if ((count?.n ?? 0) >= MAX_BOARDS_PER_USER)
      throw new UserError(
        `Máte už ${MAX_BOARDS_PER_USER} nástěnek, další nejde založit. Smažte nepoužívané.`,
      );
    const [row] = await c.db
      .insert(schema.dashboard)
      .values({
        name,
        ownerId: user,
        definition,
        schemaVersion: DEFINITION_VERSION,
        createdBy: user,
        updatedBy: user,
      })
      .returning({ id: schema.dashboard.id });
    await recordAudit(c, {
      action: "create",
      entityType: "dashboard",
      entityId: row!.id,
      summary: `Nástěnka „${name}“`,
    });
    return { id: row!.id };
  });
}

export async function updateBoard(
  ctx: Ctx,
  id: string,
  patch: { name?: string; definition?: unknown; expectedUpdatedAt?: string },
): Promise<{ updatedAt: string }> {
  const name = patch.name !== undefined ? trimName(patch.name) : undefined;
  const definition = patch.definition !== undefined ? parseDefinition(patch.definition) : undefined;
  return inTx(ctx, async (c) => {
    const row = await load(c, id, { manage: true });
    assertEditable(c, row);
    if (patch.expectedUpdatedAt && row.updatedAt.toISOString() !== patch.expectedUpdatedAt)
      throw new UserError(
        "Nástěnku mezitím někdo změnil. Načtěte ji znovu, ať o změny nepřijdete.",
      );
    const [upd] = await c.db
      .update(schema.dashboard)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(definition ? { definition, schemaVersion: DEFINITION_VERSION } : {}),
        updatedBy: c.actor.userId,
      })
      .where(eq(schema.dashboard.id, id))
      .returning({ updatedAt: schema.dashboard.updatedAt });
    await recordAudit(c, {
      action: "update",
      entityType: "dashboard",
      entityId: id,
      summary: `Nástěnka „${name ?? row.name}“${definition ? `: ${definition.widgets.length} widgetů` : ""}`,
    });
    return { updatedAt: upd!.updatedAt.toISOString() };
  });
}

export async function deleteBoard(ctx: Ctx, id: string): Promise<void> {
  await inTx(ctx, async (c) => {
    const row = await load(c, id, { manage: true });
    assertEditable(c, row);
    await c.db
      .update(schema.dashboard)
      .set({ deletedAt: new Date(), isHome: false, updatedBy: c.actor.userId })
      .where(eq(schema.dashboard.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "dashboard",
      entityId: id,
      summary: `Nástěnka „${row.name}“`,
    });
  });
}

/** Kopie nástěnky (i cizí sdílené) jako moje osobní. */
export async function cloneBoard(ctx: Ctx, id: string, name?: string): Promise<{ id: string }> {
  if (!can(ctx, DASHBOARD_WRITE)) throw new PermissionError();
  const src = await load(ctx, id, { manage: true });
  return createBoard(ctx, {
    name: trimName(name ?? `${src.name} (kopie)`.slice(0, 60)),
    definition: migrateDefinition(src.definition),
  });
}

/** Sdílení s rolemi a uživateli (autor nebo správce). Nahradí dosavadní sdílení. */
export async function shareBoard(
  ctx: Ctx,
  id: string,
  to: { roles: readonly string[]; users: readonly string[] },
): Promise<void> {
  await inTx(ctx, async (c) => {
    const row = await load(c, id, { manage: true });
    assertEditable(c, row);
    const roles = [...new Set(to.roles)];
    const users = [...new Set(to.users)];
    if (roles.length + users.length > 100) throw new UserError("Nástěnku jde sdílet nejvýš 100×.");
    if (roles.length) {
      const known = await c.db
        .select({ key: schema.role.key })
        .from(schema.role)
        .where(and(inArray(schema.role.key, roles), isNull(schema.role.deletedAt)));
      if (known.length !== roles.length)
        throw new UserError("Některá z vybraných rolí neexistuje.");
    }
    if (users.length) {
      const known = await c.db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(
          and(
            inArray(schema.user.id, users),
            eq(schema.user.active, true),
            isNull(schema.user.deletedAt),
          ),
        );
      if (known.length !== users.length)
        throw new UserError("Některý z vybraných uživatelů neexistuje nebo je deaktivovaný.");
    }
    await c.db.delete(schema.dashboardShare).where(eq(schema.dashboardShare.dashboardId, id));
    const values = [
      ...roles.map((ref) => ({ dashboardId: id, kind: "role" as const, ref })),
      ...users.map((ref) => ({ dashboardId: id, kind: "user" as const, ref })),
    ];
    if (values.length) await c.db.insert(schema.dashboardShare).values(values);
    await recordAudit(c, {
      action: "share",
      entityType: "dashboard",
      entityId: id,
      summary: `Nástěnka „${row.name}“ sdílena: ${roles.length} rolí, ${users.length} uživatelů`,
    });
  });
}

/**
 * Výchozí nástěnka pro roli (správce): vidí ji všichni z této role. S příznakem `home` se otevírá na úvodní stránce
 * místo klasického Přehledu (za roli nejvýš jedna). `roleKey = null` výchozí nastavení zruší.
 */
export async function setRoleDefault(
  ctx: Ctx,
  id: string,
  to: { roleKey: string | null; home?: boolean },
): Promise<void> {
  if (!can(ctx, DASHBOARD_MANAGE)) throw new PermissionError();
  await inTx(ctx, async (c) => {
    const row = await load(c, id, { manage: true });
    if (to.roleKey) {
      const [role] = await c.db
        .select({ key: schema.role.key })
        .from(schema.role)
        .where(and(eq(schema.role.key, to.roleKey), isNull(schema.role.deletedAt)));
      if (!role) throw new UserError("Vybraná role neexistuje.");
    }
    const home = !!to.roleKey && !!to.home;
    if (home)
      await c.db
        .update(schema.dashboard)
        .set({ isHome: false })
        .where(
          and(
            eq(schema.dashboard.defaultForRole, to.roleKey!),
            eq(schema.dashboard.isHome, true),
            ne(schema.dashboard.id, id),
          ),
        );
    await c.db
      .update(schema.dashboard)
      .set({ defaultForRole: to.roleKey, isHome: home, updatedBy: c.actor.userId })
      .where(eq(schema.dashboard.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "dashboard",
      entityId: id,
      summary: to.roleKey
        ? `Nástěnka „${row.name}“ je výchozí pro roli ${to.roleKey}${home ? " (otevírá se na úvodní stránce)" : ""}`
        : `Nástěnka „${row.name}“ už není výchozí pro roli`,
    });
  });
}

/** Moje pořadí nástěnek v přepínači (ostatní se řadí za ně). */
export async function reorderBoards(ctx: Ctx, ids: readonly string[]): Promise<void> {
  const user = me(ctx);
  if (ids.length > 200) throw new UserError("Příliš mnoho nástěnek.");
  const visible = new Set(
    (
      await ctx.db
        .select({ id: schema.dashboard.id })
        .from(schema.dashboard)
        .where(and(isNull(schema.dashboard.deletedAt), visibleWhere(ctx)))
    ).map((r) => r.id),
  );
  const list = ids.filter((id) => visible.has(id));
  await inTx(ctx, async (c) => {
    await c.db.delete(schema.dashboardPref).where(eq(schema.dashboardPref.userId, user));
    if (list.length)
      await c.db
        .insert(schema.dashboardPref)
        .values(list.map((dashboardId, position) => ({ userId: user, dashboardId, position })));
  });
}

/* ---------- výchozí sady klienta ---------- */

export type SeedDashboard = {
  /** Stálý klíč sady; podle něj se nástěnka zakládá jen jednou (správce ji pak může upravit nebo smazat). */
  key: string;
  name: string;
  /** Klíč role, pro kterou je nástěnka výchozí. */
  role: string;
  /** Otevírá se na úvodní stránce místo klasického Přehledu (výchozí ne, ať vzhled zůstane stejný). */
  home?: boolean;
  definition: unknown;
};

/**
 * Založí chybějící výchozí nástěnky z konfigurace klienta. Idempotentní: nástěnka, kterou správce upravil nebo smazal,
 * se znovu nevytváří ani nepřepisuje (klíč zůstává u smazaného řádku). Role, která v systému není, se přeskočí.
 */
export async function ensureSeedDashboards(
  db: Executor,
  seeds: readonly SeedDashboard[],
): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];
  for (const s of seeds) {
    const definition = parseDefinition(s.definition);
    const [existing] = await db
      .select({ id: schema.dashboard.id })
      .from(schema.dashboard)
      .where(eq(schema.dashboard.seedKey, s.key));
    if (existing) {
      skipped.push(s.key);
      continue;
    }
    const [role] = await db
      .select({ key: schema.role.key })
      .from(schema.role)
      .where(and(eq(schema.role.key, s.role), isNull(schema.role.deletedAt)));
    if (!role) {
      skipped.push(s.key);
      continue;
    }
    const [homeTaken] = s.home
      ? await db
          .select({ id: schema.dashboard.id })
          .from(schema.dashboard)
          .where(
            and(
              eq(schema.dashboard.defaultForRole, s.role),
              eq(schema.dashboard.isHome, true),
              isNull(schema.dashboard.deletedAt),
            ),
          )
      : [];
    await db.insert(schema.dashboard).values({
      name: trimName(s.name),
      ownerId: null,
      definition,
      schemaVersion: DEFINITION_VERSION,
      seedKey: s.key,
      defaultForRole: s.role,
      isHome: !!s.home && !homeTaken,
    });
    created.push(s.key);
  }
  return { created, skipped };
}
