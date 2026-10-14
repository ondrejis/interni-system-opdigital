import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { job, jobChange, jobChangeLine, budgetItem, budgetSection, budgetVersion } from "../schema";
import { MAX_AMOUNT_MINOR, lineAmount } from "./math";
import {
  auditJob,
  copyVersionContent,
  createVersion,
  ensureDefaultObject,
  ensureRealization,
  isEmptyVersion,
  latestOffer,
  lockJobRow,
  lockVersionRow,
  lockVersionTx,
  nextItemPosition,
  nextSectionPosition,
  realizationOf,
  recomputeSummary,
  totalsOf,
  type VersionRow,
} from "./service";

/** Počet položek verze (nesmazaných). */
export async function itemCount(c: Ctx, versionId: string): Promise<number> {
  const [r] = await c.db
    .select({ n: sql<number>`count(*)::int` })
    .from(budgetItem)
    .where(and(eq(budgetItem.versionId, versionId), isNull(budgetItem.deletedAt)));
  return r?.n ?? 0;
}

/**
 * Zkopíruje poslední nabídku do realizační verze (původní hodnoty položek se uloží). Bez nabídky založí prázdnou
 * realizaci. Existuje-li už realizace s obsahem, selže; prázdnou realizaci naplní.
 */
export async function copyOfferToRealizationTx(c: Ctx, jobId: string) {
  await lockJobRow(c, jobId);
  const offer = await latestOffer(c, jobId);
  if (!offer) {
    const r = await ensureRealization(c, jobId);
    return { versionId: r.version.id, created: r.created, copied: 0 };
  }
  let target = await realizationOf(c, jobId);
  if (target && !(await isEmptyVersion(c, target.id)))
    throw new UserError("Zakázka už má rozpočet realizace, nabídku do něj nejde znovu zkopírovat.");
  target ??= await createVersion(c, { jobId, kind: "realization" });
  const n = await copyVersionContent(c, offer.id, target.id, { markOriginal: true });
  await c.db
    .update(budgetVersion)
    .set({ sourceVersionId: offer.id, status: "draft", updatedBy: c.actor.userId })
    .where(eq(budgetVersion.id, target.id));
  await auditJob(
    c,
    jobId,
    `Nabídka ${offer.number} zkopírována do rozpočtu realizace (${n.items} položek)`,
  );
  await recomputeSummary(c, jobId);
  return { versionId: target.id, created: true, copied: n.items };
}

/**
 * Vyhraná nabídka: zamkne ji, zkopíruje do realizace a vrátí prodej nabídky bez DPH (původní smluvní cena).
 * Nabídka bez položek se nezamyká a nic nekopíruje; jen se založí prázdná realizace.
 */
export async function winOfferTx(c: Ctx, jobId: string) {
  await lockJobRow(c, jobId);
  const offer = await latestOffer(c, jobId);
  if (!offer || (await itemCount(c, offer.id)) === 0) {
    await ensureRealization(c, jobId);
    return { offerId: offer?.id ?? null, valueMinor: null as number | null };
  }
  const locked = await lockVersionTx(c, await lockVersionRow(c, offer.id));
  const copy = await copyOfferToRealizationTx(c, jobId);
  const totals = await totalsOf(c, locked.id);
  return { offerId: locked.id, realizationId: copy.versionId, valueMinor: totals.sellMinor };
}

/** Kontrola před přechodem nabídka → příprava: neprázdná nabídka musí být odeslaná zákazníkovi. */
export async function offerSentProblem(c: Ctx, jobId: string): Promise<string | null> {
  const offer = await latestOffer(c, jobId);
  if (!offer || offer.status !== "draft") return null;
  if ((await itemCount(c, offer.id)) === 0) return null;
  return "Nabídka ještě nebyla odeslána zákazníkovi. V záložce Rozpočet ji označte jako odeslanou (Odeslat nabídku).";
}

/** Nastaví hodnotu zakázky (původní smluvní cena) a datum výhry. Přímý zápis, protože entita hodnotu od realizace zamyká. */
export async function setWon(c: Ctx, jobId: string, valueMinor: number | null) {
  // pražské datum, ne UTC: výhra ve 0:30 místního času patří do dnešního dne
  const today = todayIso();
  await c.db
    .update(job)
    .set({
      ...(valueMinor !== null ? { valueMinor } : {}),
      wonAt: sql`coalesce(${job.wonAt}, ${today}::date)`,
      updatedBy: c.actor.userId,
    })
    .where(eq(job.id, jobId));
}

/* ---------- propsání schválené změny (ZBV) ---------- */

export type ApplyResult = {
  versionId: string;
  applied: boolean;
  created: number;
  changed: number;
  removed: number;
};

/**
 * Propíše řádky schválené změny do položek realizační verze: `add` vytvoří položku (`changeId`, původní množství 0),
 * `qty` nastaví množství na `quantityAfter` (řádky jsou přebázované na aktuální rozpočet), `remove` množství vynuluje. Původní hodnoty
 * zůstanou (chybějící se doplní předchozím stavem). Zamčená verze se mění také, ale jen touto cestou. Opakované
 * volání nic neudělá (`job_change.applied_at`).
 */
export async function applyChangeLinesTx(c: Ctx, changeId: string): Promise<ApplyResult> {
  const [change] = await c.db
    .select()
    .from(jobChange)
    .where(and(eq(jobChange.id, changeId), isNull(jobChange.deletedAt)));
  if (!change) throw new NotFoundError("Změna nenalezena.");
  await lockJobRow(c, change.jobId);
  let version = await realizationOf(c, change.jobId);
  if (!version) version = (await ensureRealization(c, change.jobId)).version;
  version = await lockVersionRow(c, version.id);
  if (change.appliedAt)
    return { versionId: version.id, applied: false, created: 0, changed: 0, removed: 0 };

  const lines = await c.db
    .select()
    .from(jobChangeLine)
    .where(eq(jobChangeLine.changeId, changeId))
    .orderBy(asc(jobChangeLine.position));
  const sections = await c.db
    .select()
    .from(budgetSection)
    .where(and(eq(budgetSection.versionId, version.id), isNull(budgetSection.deletedAt)))
    .orderBy(asc(budgetSection.position));
  const defaultObject = await ensureDefaultObject(c, version.id);

  const out: ApplyResult = {
    versionId: version.id,
    applied: true,
    created: 0,
    changed: 0,
    removed: 0,
  };
  for (const l of lines) {
    if (l.kind === "add") {
      let sectionId = sections.find((s) => s.id === l.sectionId)?.id;
      if (!sectionId) {
        // oddíl neznámý nebo z jiné verze: změny a vícepráce se řadí do oddílu „Změny“
        let s = sections.find((x) => x.title === "Změny" && !x.parentId);
        if (!s) {
          const [created] = await c.db
            .insert(budgetSection)
            .values({
              versionId: version.id,
              objectId: defaultObject.id,
              title: "Změny",
              position: await nextSectionPosition(c, defaultObject.id, null),
              createdBy: c.actor.userId,
              updatedBy: c.actor.userId,
            })
            .returning();
          s = created!;
          sections.push(s);
        }
        sectionId = s.id;
      }
      await c.db.insert(budgetItem).values({
        versionId: version.id,
        sectionId,
        position: await nextItemPosition(c, sectionId),
        title: l.title,
        kind: l.itemKind,
        unit: l.unit,
        quantity: l.quantityAfter,
        unitCostMinor: l.unitCostMinor,
        unitPriceMinor: l.unitPriceMinor,
        vatRateBp: l.vatRateBp,
        originalQuantity: "0.000",
        originalUnitCostMinor: l.unitCostMinor,
        originalUnitPriceMinor: l.unitPriceMinor,
        changeId,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      });
      out.created++;
      continue;
    }
    if (!l.itemId) throw new UserError(`Řádek změny „${l.title}“ nemá vybranou položku rozpočtu.`);
    const [item] = await c.db
      .select()
      .from(budgetItem)
      .where(
        and(
          eq(budgetItem.id, l.itemId),
          eq(budgetItem.versionId, version.id),
          isNull(budgetItem.deletedAt),
        ),
      );
    if (!item) throw new UserError(`Položka „${l.title}“ už v rozpočtu realizace není.`);
    // řádky jsou přebázované na aktuální rozpočet (quantityAfter je nové absolutní množství)
    const next = l.kind === "remove" ? "0.000" : l.quantityAfter;
    if (lineAmount(next, Math.max(item.unitPriceMinor, item.unitCostMinor)) > MAX_AMOUNT_MINOR)
      throw new UserError(`Změna položky „${l.title}“ by překročila nejvyšší povolenou částku.`);
    await c.db
      .update(budgetItem)
      .set({
        originalQuantity: sql`coalesce(${budgetItem.originalQuantity}, ${budgetItem.quantity})`,
        originalUnitCostMinor: sql`coalesce(${budgetItem.originalUnitCostMinor}, ${budgetItem.unitCostMinor})`,
        originalUnitPriceMinor: sql`coalesce(${budgetItem.originalUnitPriceMinor}, ${budgetItem.unitPriceMinor})`,
        quantity: next,
        updatedBy: c.actor.userId,
      })
      .where(eq(budgetItem.id, item.id));
    if (l.kind === "remove") out.removed++;
    else out.changed++;
  }
  await c.db
    .update(jobChange)
    .set({ appliedAt: new Date(), updatedBy: c.actor.userId })
    .where(eq(jobChange.id, changeId));
  await auditJob(
    c,
    change.jobId,
    `Změna ${change.number} propsána do rozpočtu realizace (nových ${out.created}, upravených ${out.changed}, odebraných ${out.removed})`,
  );
  await recomputeSummary(c, change.jobId);
  return out;
}

/**
 * Vrácení propsané změny (reopen schválené ZBV): položky vzniklé změnou se smažou, u `qty`/`remove` se vrátí
 * `quantityBefore`. Původní hodnoty se nemění. Změna znovu čeká na propsání (`applied_at` se vynuluje).
 */
export async function revertChangeLinesTx(
  c: Ctx,
  changeId: string,
): Promise<{ removed: number; restored: number }> {
  const [change] = await c.db
    .select()
    .from(jobChange)
    .where(and(eq(jobChange.id, changeId), isNull(jobChange.deletedAt)));
  if (!change) throw new NotFoundError("Změna nenalezena.");
  await lockJobRow(c, change.jobId);
  const version = await realizationOf(c, change.jobId);
  if (!version) return { removed: 0, restored: 0 };
  await lockVersionRow(c, version.id);
  const created = await c.db
    .update(budgetItem)
    .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
    .where(and(eq(budgetItem.changeId, changeId), isNull(budgetItem.deletedAt)))
    .returning({ id: budgetItem.id });
  const lines = await c.db.select().from(jobChangeLine).where(eq(jobChangeLine.changeId, changeId));
  let restored = 0;
  for (const l of lines) {
    if (l.kind === "add" || !l.itemId) continue;
    await c.db
      .update(budgetItem)
      .set({ quantity: l.quantityBefore, updatedBy: c.actor.userId })
      .where(and(eq(budgetItem.id, l.itemId), eq(budgetItem.versionId, version.id)));
    restored++;
  }
  await c.db
    .update(jobChange)
    .set({ appliedAt: null, updatedBy: c.actor.userId })
    .where(eq(jobChange.id, changeId));
  await auditJob(c, change.jobId, `Změna ${change.number} vrácena z rozpočtu realizace`);
  await recomputeSummary(c, change.jobId);
  return { removed: created.length, restored };
}

export type { VersionRow };
