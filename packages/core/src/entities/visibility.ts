import { and, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { recordAudit } from "../audit/audit";
import { schema, type Executor } from "../db/client";
import { emitDomain } from "../events";
import { inTx } from "../rbac/context";
import { loadActor } from "../rbac/actor";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { canSeePrivate } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { getEntityPolicy } from "./policy";
import {
  childLinks,
  hasVisibility,
  isPrivateWithoutParent,
  parentLinks,
  type LinkRegistry,
} from "./links";
import type { EntityDef } from "./types";

export { canSeePrivate };

/** Čeho se týká „Soukromý záznam“ v popiscích odkazů, které aktér nesmí vidět. */
export const PRIVATE_LABEL = "Soukromý záznam";

/**
 * Podmínka do `WHERE` pro každý ruční dotaz nad tabulkou se zámkem (widget, metrika, vrstva, „vyžaduje pozornost“, služba):
 * vlastník (`private.read`) vidí vše (`undefined`), ostatní jen záznamy, které nejsou soukromé. Entity z registru ji
 * dostávají samy (`queryRecords`, agregace…), ručně ji potřebuje jen kód, který čte tabulky přímo.
 */
export function privateScope(ctx: Ctx, table: { isPrivate: AnyPgColumn }): SQL | undefined {
  return canSeePrivate(ctx) ? undefined : sql`not ${table.isPrivate}`;
}

/**
 * Anti-join na soukromé záznamy pro dotazy napříč entitami (komentáře, soubory, historie), které mají jen dvojici
 * `typ + id` záznamu: vlastník vidí vše (`undefined`), ostatní jen řádky, jejichž záznam není v `private_record`.
 */
export function notPrivateRecord(
  ctx: Ctx,
  entityType: AnyPgColumn | SQL,
  entityId: AnyPgColumn | SQL,
): SQL | undefined {
  if (canSeePrivate(ctx)) return undefined;
  return sql`not exists (select 1 from private_record pr where pr.entity_type = ${entityType} and pr.entity_id::text = ${entityId}::text)`;
}

/** Je záznam právě soukromý? Čte tabulku `private_record`, takže nepotřebuje znát tabulku entity. */
export async function isPrivateRecord(
  db: Executor,
  entityType: string,
  id: string,
): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(schema.privateRecord)
    .where(
      and(eq(schema.privateRecord.entityType, entityType), eq(schema.privateRecord.entityId, id)),
    );
  return !!row;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Soukromý záznam se nesmí přiřadit uživateli, který soukromé záznamy nevidí (VID-06). Kód `private_assign`. */
export class PrivateAssignmentError extends Error {
  readonly code = "private_assign";
  constructor(
    message = "Soukromý záznam nejde přiřadit uživateli, který soukromé záznamy nevidí. Nejdřív ho zveřejněte.",
  ) {
    super(message);
    this.name = "PrivateAssignmentError";
  }
}

/**
 * Ověří, že záznam jde přiřadit danému uživateli (řešitel úkolu, vlastník obchodu…): soukromý záznam smí dostat jen
 * uživatel s oprávněním `private.read`, jinak vyhodí `PrivateAssignmentError` (kód `private_assign`; UI nabídne
 * „Zveřejnit a přiřadit“). Volající, který soukromý záznam sám nevidí, dostane `NotFoundError`.
 */
export async function assertAssignable(
  ctx: Ctx,
  entityKey: string,
  id: string,
  userId: string,
): Promise<void> {
  const policy = getEntityPolicy(entityKey);
  if (!policy) throw new PermissionError("Tento typ záznamu není v systému povolen.");
  const found = await policy.owners(ctx.db, id);
  if (!found) throw new NotFoundError();
  if (found.isPrivate !== true) return;
  if (!canSeePrivate(ctx)) throw new NotFoundError();
  const actor = await loadActor(ctx.db, userId);
  if (!actor) throw new UserError("Uživatel neexistuje nebo je deaktivovaný.");
  if (actor.unrestricted || actor.systemRole || actor.permissions.has("private.read")) return;
  throw new PrivateAssignmentError();
}

type Row = Record<string, unknown>;
type Source = "own" | "inherited";

const cols = (def: EntityDef) => getTableColumns(def.table) as Record<string, AnyPgColumn>;

/**
 * Je některý z rodičů záznamu soukromý? `values` jsou hodnoty záznamu pod názvy vlastností tabulky (`jobId`…).
 * Rodiče, kteří nejsou v registru (modul není zapnutý), se přeskočí.
 */
export async function hasPrivateParent(
  db: Executor,
  registry: LinkRegistry,
  def: EntityDef,
  values: Row,
): Promise<boolean> {
  for (const p of parentLinks(registry, def)) {
    const v = values[p.fkName];
    if (typeof v !== "string") continue;
    const pc = cols(p.def);
    if (!pc.isPrivate) continue;
    const [r] = await db
      .select({ isPrivate: pc.isPrivate! })
      .from(p.def.table)
      .where(eq(pc.id!, v));
    if (r?.isPrivate) return true;
  }
  return false;
}

/** Žádný ze sloupců `parents` záznamu není vyplněn (záznam bez rodiče). */
function hasNoParent(registry: LinkRegistry, def: EntityDef, values: Row): boolean {
  const links = parentLinks(registry, def);
  return links.length > 0 && links.every((p) => typeof values[p.fkName] !== "string");
}

/**
 * Hodnoty `is_private` a `visibility_source` pro nový záznam entity: tvůrce bez `private.read` založí vždy sdílený
 * (pokus o soukromý je chyba), s `private.read` se bere `requested`, jinak `defaultPrivate`; dítě soukromého rodiče
 * (a platba bez zakázky) je soukromé (`inherited`). Pro moduly, které řádky zakládají přímo (`insert`), místo enginu.
 * `values` jsou hodnoty nového řádku pod názvy vlastností tabulky.
 */
export async function visibilityForInsert(
  ctx: Ctx,
  registry: LinkRegistry,
  entityKey: string,
  values: Row,
  requested?: boolean,
): Promise<{ isPrivate: boolean; visibilitySource: Source }> {
  const def = registry.get(entityKey);
  if (!def || !hasVisibility(def)) return { isPrivate: false, visibilitySource: "own" };
  const vis = def.visibility!;
  const mayLock = canSeePrivate(ctx);
  if (requested && !mayLock)
    throw new UserError(
      "Soukromý záznam smí vytvořit jen vlastník. Záznam vytvoříte jako sdílený.",
    );
  if (
    (await hasPrivateParent(ctx.db, registry, def, values)) ||
    (isPrivateWithoutParent(def) && hasNoParent(registry, def, values))
  )
    return { isPrivate: true, visibilitySource: "inherited" };
  const own = mayLock && vis.ownLock !== false ? (requested ?? vis.defaultPrivate ?? false) : false;
  return { isPrivate: own, visibilitySource: "own" };
}

/** Udržuje `private_record` (řádek jen u právě soukromých záznamů); volat v téže transakci jako změnu zámku. */
export async function syncPrivateRecord(
  db: Executor,
  entityType: string,
  id: string,
  isPrivate: boolean,
): Promise<void> {
  if (isPrivate)
    await db
      .insert(schema.privateRecord)
      .values({ entityType, entityId: id })
      .onConflictDoNothing();
  else
    await db
      .delete(schema.privateRecord)
      .where(
        and(eq(schema.privateRecord.entityType, entityType), eq(schema.privateRecord.entityId, id)),
      );
  await db
    .update(schema.searchDocument)
    .set({ isPrivate })
    .where(
      and(eq(schema.searchDocument.entityType, entityType), eq(schema.searchDocument.entityId, id)),
    );
}

const titleOf = (def: EntityDef, raw: Row): string => {
  const field = def.attributes.find((a) => a.key === def.titleKey)?.field;
  return field ? String(raw[field] ?? "") : "";
};

async function auditVisibility(
  c: Ctx,
  def: EntityDef,
  raw: Row,
  isPrivate: boolean,
  summary: string,
  cascadedFrom?: { entityType: string; id: string },
): Promise<void> {
  await recordAudit(c, {
    action: "visibility_changed",
    entityType: def.key,
    entityId: String(raw.id),
    summary,
    entityTitle: titleOf(def, raw),
    changes: [{ field: "Soukromé", old: !isPrivate, new: isPrivate }],
    isPrivate,
    ...(cascadedFrom ? { context: { cascadedFrom } } : {}),
  });
}

/** Změní `is_private` jednoho řádku dítěte kaskádou a vrátí, zda se hodnota změnila. */
async function cascade(
  c: Ctx,
  registry: LinkRegistry,
  parent: { def: EntityDef; id: string; isPrivate: boolean },
  depth: number,
): Promise<number> {
  if (depth > 3) return 0;
  let changed = 0;
  for (const link of childLinks(registry, parent.def.key)) {
    const cc = link.columns;
    if (!cc.isPrivate || !cc.visibilitySource) continue;
    const rows = (await c.db.select().from(link.table).where(eq(link.fk, parent.id))) as Row[];
    for (const row of rows) {
      const wasPrivate = row.isPrivate === true;
      const source = row.visibilitySource as Source;
      let next: boolean;
      if (parent.isPrivate) next = true;
      else if (wasPrivate && source === "inherited") {
        // zveřejnění rodiče: zděděné dítě se zveřejní, ledaže ho drží jiný soukromý rodič nebo je bez rodiče soukromé
        next =
          !!link.def &&
          ((await hasPrivateParent(c.db, registry, link.def, row)) ||
            (isPrivateWithoutParent(link.def) && hasNoParent(registry, link.def, row)));
      } else continue; // soukromé dítě s vlastním zámkem zůstává
      if (next === wasPrivate) continue;
      await c.db
        .update(link.table)
        .set({ isPrivate: next, visibilitySource: "inherited" } as never)
        .where(eq(cc.id!, row.id as string));
      changed++;
      if (link.def) {
        await syncPrivateRecord(c.db, link.def.key, String(row.id), next);
        await auditVisibility(
          c,
          link.def,
          row,
          next,
          next ? "Zámek zděděn od nadřazeného záznamu" : "Zveřejněno s nadřazeným záznamem",
          { entityType: parent.def.key, id: parent.id },
        );
        changed += await cascade(
          c,
          registry,
          { def: link.def, id: String(row.id), isPrivate: next },
          depth + 1,
        );
      }
    }
  }
  return changed;
}

/**
 * Přepne záznam mezi sdíleným a soukromým (zámek). Smí jen aktér s `private.read` (vlastník). Soukromý záznam zamkne
 * i děti (`children`, `visibility.parents` jiných entit): sdílené děti se stanou soukromými (`inherited`); zveřejnění
 * zveřejní jen děti se zděděným zámkem, děti s vlastním zámkem (`own`) zůstanou soukromé. Dítě soukromého rodiče ani
 * záznam bez rodiče, který musí být soukromý (platba bez zakázky), zveřejnit nejde. Vše v jedné transakci, zapíše se
 * do historie (`visibility_changed`, hodnota po změně) a vyšle událost `visibility.changed`.
 */
export async function setVisibility(
  ctx: Ctx,
  registry: LinkRegistry,
  entityKey: string,
  id: string,
  isPrivate: boolean,
): Promise<{ changed: boolean; cascaded: number }> {
  if (!canSeePrivate(ctx))
    throw new PermissionError("Viditelnost záznamu může měnit jen vlastník.");
  const def = registry.get(entityKey);
  if (!def || !hasVisibility(def)) throw new UserError("Tento typ záznamu nemá zámek.");
  if (def.visibility!.ownLock === false)
    throw new UserError(
      "Tento záznam dědí viditelnost od nadřazeného záznamu, sám ji změnit nejde.",
    );
  const c0 = cols(def);
  return inTx(ctx, async (c) => {
    const [raw] = (await c.db
      .select()
      .from(def.table)
      .where(and(eq(c0.id!, id), sql`${c0.deletedAt} is null`))
      .for("update")) as Row[];
    if (!raw) throw new NotFoundError();
    if (!isPrivate) {
      if (await hasPrivateParent(c.db, registry, def, raw))
        throw new UserError(
          "Nadřazený záznam je soukromý, a proto zůstane soukromý i tento. Nejdřív zveřejněte nadřazený záznam.",
        );
      if (isPrivateWithoutParent(def) && hasNoParent(registry, def, raw))
        throw new UserError("Záznam bez nadřazeného záznamu je vždy soukromý.");
    }
    const was = raw.isPrivate === true;
    if (was === isPrivate) {
      if (raw.visibilitySource !== "own")
        await c.db
          .update(def.table)
          .set({ visibilitySource: "own" } as never)
          .where(eq(c0.id!, id));
      return { changed: false, cascaded: 0 };
    }
    await c.db
      .update(def.table)
      .set({ isPrivate, visibilitySource: "own" } as never)
      .where(eq(c0.id!, id));
    await syncPrivateRecord(c.db, def.key, id, isPrivate);
    await auditVisibility(c, def, raw, isPrivate, isPrivate ? "Záznam zamčen" : "Záznam zveřejněn");
    const cascaded = await cascade(c, registry, { def, id, isPrivate }, 1);
    await emitDomain(
      c,
      "visibility.changed",
      { entityType: def.key, id, isPrivate, cascaded },
      { entity: { type: def.key, id, isPrivate } },
    );
    return { changed: true, cascaded };
  });
}

/**
 * Po změně rodiče (nebo odebrání posledního rodiče) přepočítá zděděný zámek řádku: dítě soukromého rodiče se zamkne,
 * dítě, které bylo soukromé jen zděděním, se zveřejní. Volá engine po `updateRecord` v téže transakci a vrací, zda se
 * `is_private` změnilo (pak se kaskádou přepočítají i děti).
 */
export async function refreshInherited(
  c: Ctx,
  registry: LinkRegistry,
  def: EntityDef,
  id: string,
): Promise<boolean> {
  const c0 = cols(def);
  if (!hasVisibility(def) || !c0.isPrivate) return false;
  const [raw] = (await c.db.select().from(def.table).where(eq(c0.id!, id))) as Row[];
  if (!raw) return false;
  const mustBePrivate =
    (await hasPrivateParent(c.db, registry, def, raw)) ||
    (isPrivateWithoutParent(def) && hasNoParent(registry, def, raw));
  const was = raw.isPrivate === true;
  const source = raw.visibilitySource as Source;
  let next: boolean;
  if (mustBePrivate) {
    if (was) return false; // už soukromé (vlastní zámek, nebo zděděný dřív)
    next = true;
  } else if (was && source === "inherited") next = false;
  else return false;
  await c.db
    .update(def.table)
    .set({ isPrivate: next, visibilitySource: "inherited" } as never)
    .where(eq(c0.id!, id));
  await syncPrivateRecord(c.db, def.key, id, next);
  await auditVisibility(
    c,
    def,
    raw,
    next,
    next ? "Zámek zděděn od nadřazeného záznamu" : "Zveřejněno s nadřazeným záznamem",
  );
  await cascade(c, registry, { def, id, isPrivate: next }, 1);
  return true;
}

/** Při startu ověří, že entity se zámkem mají sloupce `is_private` a `visibility_source` a platné vazby. */
export function validateVisibility(defs: readonly EntityDef[]): void {
  for (const d of defs) {
    if (!d.visibility) continue;
    const c0 = cols(d);
    for (const need of ["isPrivate", "visibilitySource"])
      if (!c0[need])
        throw new Error(
          `Entita „${d.key}“ má zámek (visibility), ale její tabulka nemá sloupec „${need}“ (…visibilityColumns()).`,
        );
    for (const p of d.visibility.parents ?? [])
      if (!c0[p.column])
        throw new Error(
          `Entita „${d.key}“: rodič „${p.entityType}“ odkazuje na neexistující sloupec „${p.column}“.`,
        );
    for (const l of d.children ?? []) {
      const t = l.table ?? defs.find((x) => x.key === l.entityType)?.table;
      if (t && !(getTableColumns(t) as Record<string, unknown>)[l.column])
        throw new Error(
          `Entita „${d.key}“: dítě „${l.entityType}“ odkazuje na neexistující sloupec „${l.column}“.`,
        );
    }
  }
}
