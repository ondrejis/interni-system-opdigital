import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "@rebar/core/db";
import {
  indexRecord,
  resolveEntity,
  updateRecord,
  type EntityRegistry,
} from "@rebar/core/entities";
import { inTx, NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { buildAresDiff, createDbAresCache, lookupAres, type AresField } from "./ares";
import type { AresTarget } from "./ares";
import type { AresCommandResult } from "./contract";
import { checkCompanyDuplicates } from "./duplicates";
import { companyEntity } from "./entities";
import { companyIndex } from "./indexing";
import { company } from "./schema";

/*
  Doplnění organizace z ARES (ORG-03, ORG-04): náhled změn a zápis vybraných polí. ARES se volá jen tady a jen na
  výslovnou žádost; ukládání organizace (formulář, API, import) ARES nepotřebuje, takže funguje i při jeho výpadku.
*/

/** Údaje organizace, které se porovnávají s ARES. */
const targetOf = (row: typeof company.$inferSelect): AresTarget => ({
  name: row.name,
  officialName: row.officialName,
  ico: row.ico,
  dic: row.dic,
  legalForm: row.legalForm,
  street: row.street,
  city: row.city,
  zip: row.zip,
});

async function loadCompany(db: Executor, id: string) {
  const [row] = await db
    .select()
    .from(company)
    .where(and(eq(company.id, id), isNull(company.deletedAt)));
  if (!row) throw new NotFoundError();
  return row;
}

/**
 * Náhled změn z ARES pro organizaci (`companyId`, s jejím IČO nebo zadaným), nebo pro novou organizaci (jen `ico`).
 * Vrací i organizaci, která už má toto IČO (ORG-05), aby UI odkázalo místo zakládání. Nikdy nevyhodí výjimku kvůli
 * síti: `ok: false` nese větu pro uživatele. `fresh` obejde 24hodinovou cache („Aktualizovat z ARES“).
 */
export async function previewAres(
  ctx: Ctx,
  input: { ico?: string | undefined; companyId?: string | undefined; fresh?: boolean },
): Promise<AresCommandResult> {
  const existing = input.companyId ? await loadCompany(ctx.db, input.companyId) : null;
  const ico = input.ico?.trim() ? input.ico : (existing?.ico ?? "");
  if (!ico.trim())
    return { ok: false, reason: "invalid", message: "Organizace nemá vyplněné IČO." };
  const res = await lookupAres(ico, {
    cache: createDbAresCache(ctx.db),
    ...(input.fresh ? { fresh: true } : {}),
  });
  if (!res.ok) return res;
  const dup = (
    await checkCompanyDuplicates(ctx, { ico: res.company.ico, excludeId: existing?.id ?? null })
  ).icoMatch;
  return {
    ok: true,
    company: res.company,
    cached: res.cached,
    stale: res.stale,
    fetchedAt: res.fetchedAt,
    changes: buildAresDiff(existing ? targetOf(existing) : null, res.company),
    duplicate: dup ? { id: dup.id, name: dup.name, visible: dup.visible } : null,
  };
}

/**
 * Zapíše do organizace vybraná pole z ARES a čas synchronizace. Hodnoty se nikdy nebere z klienta: znovu se načtou
 * z ARES (z cache, pokud je čerstvá) a vybere se jen z toho, co náhled nabízel. Pole zapisuje engine entity
 * (oprávnění, historie, kontrola IČO, hledání); bez výběru (`fields` chybí) se zapíšou předvybraná pole náhledu.
 * Při výpadku ARES se nic nezapíše a vrátí se věta (organizace zůstane, jak byla).
 */
export async function applyAres(
  ctx: Ctx,
  registry: EntityRegistry,
  input: { companyId: string; ico?: string | undefined; fields?: readonly AresField[] | undefined },
): Promise<AresCommandResult> {
  const preview = await previewAres(ctx, { ico: input.ico, companyId: input.companyId });
  if (!preview.ok) return preview;
  if (preview.duplicate)
    throw new UserError(
      `Organizace s IČO ${preview.company.ico} už existuje${preview.duplicate.visible ? `: „${preview.duplicate.name}“` : ""}. Údaje z ARES nejdou uložit; organizace by se zdvojily.`,
    );
  const wanted = input.fields ? new Set<AresField>(input.fields) : null;
  const chosen = preview.changes.filter((c) => (wanted ? wanted.has(c.field) : c.selected));
  const patch: Record<string, unknown> = {};
  for (const c of chosen) patch[c.field] = c.incoming;
  const def = registry.get("company") ?? companyEntity;
  const syncedAt = new Date();
  await inTx(ctx, async (c) => {
    if (Object.keys(patch).length)
      await updateRecord(c, registry, await resolveEntity(c.db, def), input.companyId, patch);
    const [row] = await c.db
      .update(company)
      .set({ aresSyncedAt: syncedAt, updatedBy: c.actor.userId })
      .where(eq(company.id, input.companyId))
      .returning();
    if (row) await indexRecord(c.db, companyIndex, row as unknown as Record<string, unknown>);
  });
  return {
    ...preview,
    changes: preview.changes.filter((c) => !chosen.includes(c)),
    applied: chosen.map((c) => c.field),
    syncedAt: syncedAt.toISOString(),
  };
}
