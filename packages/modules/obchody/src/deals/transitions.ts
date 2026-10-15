import { and, count, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { getLookup } from "@rebar/core/config-data";
import { emitDomain } from "@rebar/core/events";
import {
  assertEntityAccess,
  createRecord,
  deleteRecord,
  recordTitles,
  resolveEntity,
  updateRecord,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import { createJobsFromWonDeal, type JobFromDealRow } from "@rebar/zakazky/api";
import { job } from "@rebar/zakazky/schema";
import type {
  CreateDealInput,
  CreatedDeal,
  DealChangeResult,
  LoseDealInput,
  UpdateDealInput,
  WinDealInput,
  WinResult,
} from "../contract";
import { deal, dealParticipant } from "../schema";
import { DEAL_RESULT_LABELS, LOST_REASON_LOOKUP, type DealResult } from "../shared";
import { dealSnap, loadDeal, loadStage, type DealRow } from "./common";
import { leaveStage, enterStage } from "./history";
import { pragueDay, pragueNoon, storedWeightedMinor } from "./logic";

/*
  Příkazy, které mění obchod: založení, úprava, přesun mezi fázemi (přes engine entity, takže platí háčky z `hooks.ts`)
  a výsledek obchodu (výhra, prohra, znovuotevření: vlastní zápis, protože `result` je pro engine jen ke čtení).
  Všechno běží v jedné transakci s auditem a událostmi.
*/

const asResult = (r: DealRow): DealChangeResult => ({
  dealId: r.id,
  updatedAt: r.updatedAt.toISOString(),
});

function assertExpected(row: DealRow, expected: string | undefined) {
  if (expected && row.updatedAt.toISOString() !== expected)
    throw new UserError("Obchod mezitím někdo změnil. Obnovte stránku a zkuste to znovu.");
}

/** Zápis změn obchodu mimo engine (výsledek): řádek po změně; `updated_by` a `updated_at` se nastaví. */
async function writeDeal(c: Ctx, id: string, set: Partial<typeof deal.$inferInsert>) {
  const [after] = await c.db
    .update(deal)
    .set({ ...set, updatedBy: c.actor.userId, updatedAt: new Date() })
    .where(eq(deal.id, id))
    .returning();
  return after!;
}

const fmtDay = (d: Date | null) => (d ? pragueDay(d) : null);

/* ---------- založení a úprava ---------- */

/**
 * Založí obchod přes engine entity (háčky doplní fázi, vlastníka, váženou hodnotu, historii a událost `deal.created`)
 * a přidá další kontakty. Hlavní kontakt (`personId`) mezi další kontakty nepatří.
 */
export async function createDeal(
  ctx: Ctx,
  deps: ModuleDeps,
  input: CreateDealInput & { title: string },
): Promise<CreatedDeal> {
  const def = deps.registry.get("deal");
  if (!def) throw new UserError("Modul Obchody není zapnutý.");
  return inTx(ctx, async (c) => {
    const e = await resolveEntity(c.db, def);
    const values: Record<string, unknown> = {
      title: input.title,
      company: input.companyId ?? null,
      person: input.personId ?? null,
      owner: input.ownerId ?? null,
      value: input.valueMinor ?? null,
      services: input.services ?? [],
      expectedCloseDate: input.expectedCloseDate ?? null,
      source: input.source ?? "manual",
      sourceDetail: input.sourceDetail ?? null,
      tags: input.tags ?? [],
      ...(input.stageId ? { status: input.stageId } : {}),
      ...(input.isPrivate !== undefined ? { isPrivate: input.isPrivate } : {}),
    };
    const created = await createRecord(c, deps.registry, e, values);
    const dealId = created.row.id;
    const extra = [...new Set(input.participantIds ?? [])].filter((p) => p !== input.personId);
    if (extra.length) {
      const titles = await recordTitles(c, deps.registry, "person", extra);
      for (const personId of extra) {
        if (!titles[personId]) throw new UserError("Přidaný kontakt neexistuje.");
        await c.db.insert(dealParticipant).values({
          dealId,
          personId,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        });
      }
    }
    return {
      dealId,
      companyId: input.companyId ?? null,
      personId: input.personId ?? null,
      created: { company: false, person: false },
    };
  });
}

/** Úprava polí obchodu přes engine (oprávnění, rozsah „jen moje“, kolize úprav, audit). Fázi ani výsledek nemění. */
export async function updateDeal(
  ctx: Ctx,
  deps: ModuleDeps,
  input: UpdateDealInput,
): Promise<DealChangeResult> {
  const def = deps.registry.get("deal");
  if (!def) throw new UserError("Modul Obchody není zapnutý.");
  const p = input.patch;
  const patch: Record<string, unknown> = {};
  const map: [keyof typeof p, string][] = [
    ["title", "title"],
    ["companyId", "company"],
    ["personId", "person"],
    ["ownerId", "owner"],
    ["valueMinor", "value"],
    ["services", "services"],
    ["expectedCloseDate", "expectedCloseDate"],
    ["source", "source"],
    ["sourceDetail", "sourceDetail"],
    ["tags", "tags"],
  ];
  for (const [from, to] of map) if (from in p) patch[to] = p[from] ?? null;
  return inTx(ctx, async (c) => {
    const e = await resolveEntity(c.db, def);
    const r = await updateRecord(c, deps.registry, e, input.dealId, patch, {
      ...(input.expectedUpdatedAt ? { expectedUpdatedAt: input.expectedUpdatedAt } : {}),
    });
    return { dealId: input.dealId, updatedAt: String(r.row.updatedAt) };
  });
}

/**
 * Přesun do jiné fáze (tažení, pás fází, „Přesunout do fáze“): přes engine, takže platí oprávnění a rozsah a háčky
 * zapíšou historii a událost `deal.stage_changed`. Zavřený obchod se nepřesouvá.
 */
export async function moveDealStage(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { dealId: string; stageId: string; expectedUpdatedAt?: string | undefined },
): Promise<DealChangeResult> {
  const def = deps.registry.get("deal");
  if (!def) throw new UserError("Modul Obchody není zapnutý.");
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, "deal", input.dealId, "write");
    const row = await loadDeal(c.db, input.dealId);
    assertExpected(row, input.expectedUpdatedAt);
    if (row.stageId === input.stageId && row.result === "open") return asResult(row);
    if (!(await loadStage(c.db, input.stageId))) throw new UserError("Fáze neexistuje.");
    const e = await resolveEntity(c.db, def);
    const r = await updateRecord(c, deps.registry, e, input.dealId, { status: input.stageId });
    return { dealId: input.dealId, updatedAt: String(r.row.updatedAt) };
  });
}

/** Archivace = přesun do Koše (soft delete přes jádro; obnovit jde v Koši 30 dní). Vyžaduje `obchody.delete`. */
export async function archiveDeal(
  ctx: Ctx,
  deps: ModuleDeps,
  dealId: string,
): Promise<DealChangeResult> {
  const def = deps.registry.get("deal");
  if (!def) throw new UserError("Modul Obchody není zapnutý.");
  return inTx(ctx, async (c) => {
    const row = await loadDeal(c.db, dealId);
    await deleteRecord(c, await resolveEntity(c.db, def), dealId);
    return asResult(row);
  });
}

/* ---------- výsledek obchodu ---------- */

/**
 * Výhra (OBCH-13): obchod je vyhraný k datu `wonOn` (výchozí dnes, nejpozději dnes). Firma se přes službu `clients`
 * stane aktivním klientem (první přechod nastaví „klient od“, bývalý klient se vrací) a dostane služby z obchodu;
 * z řádků `jobs` vzniknou zakázky (`createJobsFromWonDeal`: fáze ze šablon, úkoly, platby, složky na Disku). Vyšle
 * `deal.won` s id založených zakázek. Vše v jedné transakci: selže-li cokoli, obchod zůstane otevřený.
 */
export async function winDeal(
  ctx: Ctx,
  deps: ModuleDeps,
  input: WinDealInput,
  now: Date = new Date(),
): Promise<WinResult> {
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, "deal", input.dealId, "write");
    const row = await loadDeal(c.db, input.dealId);
    assertExpected(row, input.expectedUpdatedAt);
    if (row.result !== "open")
      throw new UserError(
        row.result === "won"
          ? "Obchod už je vyhraný."
          : "Prohraný obchod nejdřív znovu otevřete, potom ho jde vyhrát.",
      );
    const rows = (input.jobs ?? []) as unknown as JobFromDealRow[];
    if (rows.length && !row.companyId)
      throw new UserError("Obchod nemá organizaci, zakázky se nedají založit. Nejdřív ji doplňte.");

    const today = pragueDay(now);
    const wonOn = input.wonOn ?? today;
    if (wonOn > today) throw new UserError("Datum výhry nesmí být v budoucnu.");
    const wonAt = wonOn === today ? now : pragueNoon(wonOn);

    await leaveStage(c.db, row.id, now);
    const after = await writeDeal(c, row.id, {
      result: "won",
      wonAt,
      lostAt: null,
      lostReason: null,
      lostNote: null,
      weightedMinor: storedWeightedMinor(row.valueMinor, "won", null),
    });
    await recordAudit(c, {
      action: "update",
      entityType: "deal",
      entityId: row.id,
      summary: `Obchod vyhrán: ${row.title}`,
      entityTitle: row.title,
      changes: [
        { field: "Výsledek", old: DEAL_RESULT_LABELS[row.result], new: DEAL_RESULT_LABELS.won },
        { field: "Vyhráno", old: fmtDay(row.wonAt), new: wonOn },
      ],
    });

    // firma se stane aktivním klientem se službami z obchodu (volitelně: bez modulu Klienti se jen přeskočí)
    let clientUpdated = false;
    const clients = deps.services.optional("clients");
    if (clients && row.companyId) {
      await clients.setStatus(c, {
        companyId: row.companyId,
        status: "active",
        source: "deal_won",
      });
      if (row.services.length)
        await clients.addServices(
          c,
          row.companyId,
          row.services as ("web" | "marketing" | "systemy")[],
        );
      clientUpdated = true;
    }

    let jobs: WinResult["jobs"] = [];
    if (rows.length && row.companyId) {
      const created = await createJobsFromWonDeal(c, deps, {
        dealId: row.id,
        companyId: row.companyId,
        rows,
        dealValueMinor: row.valueMinor,
      });
      jobs = created.jobs;
    }

    await emitDomain(
      c,
      "deal.won",
      { deal: dealSnap(after), jobIds: jobs.map((j) => j.id) },
      { entity: { type: "deal", id: row.id, isPrivate: row.isPrivate } },
    );
    return { dealId: row.id, wonAt: wonAt.toISOString(), jobs, clientUpdated };
  });
}

/**
 * Prohra (OBCH-12): důvod musí být aktivní položka číselníku `deal.lost_reason`, poznámka je volitelná. Obchod zůstane
 * ve fázi, ve které byl (po znovuotevření se tam vrátí). Vyšle `deal.lost` (`reason` je klíč důvodu).
 */
export async function loseDeal(
  ctx: Ctx,
  deps: ModuleDeps,
  input: LoseDealInput,
  now: Date = new Date(),
): Promise<DealChangeResult> {
  void deps;
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, "deal", input.dealId, "write");
    const row = await loadDeal(c.db, input.dealId);
    assertExpected(row, input.expectedUpdatedAt);
    if (row.result !== "open")
      throw new UserError(
        row.result === "lost" ? "Obchod už je prohraný." : "Vyhraný obchod nejde prohrát.",
      );
    const reasons = await getLookup(c.db, LOST_REASON_LOOKUP);
    const reason = reasons.find((r) => r.value === input.reason);
    if (!reason) throw new UserError("Vyberte důvod prohry ze seznamu.");
    const note = input.note?.trim() ? input.note.trim() : null;

    await leaveStage(c.db, row.id, now);
    const after = await writeDeal(c, row.id, {
      result: "lost",
      lostAt: now,
      lostReason: reason.value,
      lostNote: note,
      wonAt: null,
      weightedMinor: storedWeightedMinor(row.valueMinor, "lost", null),
    });
    await recordAudit(c, {
      action: "update",
      entityType: "deal",
      entityId: row.id,
      summary: `Obchod prohrán: ${row.title} (${reason.label})`,
      entityTitle: row.title,
      changes: [
        { field: "Výsledek", old: DEAL_RESULT_LABELS[row.result], new: DEAL_RESULT_LABELS.lost },
        { field: "Důvod prohry", old: null, new: reason.label },
        ...(note ? [{ field: "Poznámka k prohře", old: null, new: note }] : []),
      ],
    });
    await emitDomain(
      c,
      "deal.lost",
      { deal: dealSnap(after), reason: reason.value, note },
      { entity: { type: "deal", id: row.id, isPrivate: row.isPrivate } },
    );
    return asResult(after);
  });
}

/**
 * Znovuotevření: prohraný obchod, nebo vyhraný, ke kterému ještě nevznikla žádná zakázka, se vrátí do fáze, ve které
 * byl (nový pobyt ve fázi, odpočet hnití začíná znovu). Datum a důvod prohry, popřípadě datum výhry se vymažou; stav
 * klienta se nevrací.
 */
export async function reopenDeal(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { dealId: string },
  now: Date = new Date(),
): Promise<DealChangeResult> {
  void deps;
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, "deal", input.dealId, "write");
    const row = await loadDeal(c.db, input.dealId);
    if (row.result === "open") throw new UserError("Obchod je otevřený, není co znovu otevírat.");
    if (row.result === "won") {
      const [n] = await c.db
        .select({ n: count() })
        .from(job)
        .where(and(eq(job.dealId, row.id), isNull(job.deletedAt)));
      if ((n?.n ?? 0) > 0)
        throw new UserError(
          "K vyhranému obchodu už vznikly zakázky, proto ho znovu otevřít nejde. Zakázky upravte nebo zrušte.",
        );
    }
    const stage = await loadStage(c.db, row.stageId);
    await enterStage(c.db, {
      dealId: row.id,
      fromStageId: row.stageId,
      toStageId: row.stageId,
      at: now,
      byUserId: c.actor.userId,
    });
    const after = await writeDeal(c, row.id, {
      result: "open",
      wonAt: null,
      lostAt: null,
      lostReason: null,
      lostNote: null,
      stageEnteredAt: now,
      weightedMinor: storedWeightedMinor(row.valueMinor, "open", stage?.probabilityPct ?? null),
    });
    await recordAudit(c, {
      action: "update",
      entityType: "deal",
      entityId: row.id,
      summary: `Obchod znovu otevřen: ${row.title}`,
      entityTitle: row.title,
      changes: [
        {
          field: "Výsledek",
          old: DEAL_RESULT_LABELS[row.result as DealResult],
          new: DEAL_RESULT_LABELS.open,
        },
      ],
    });
    return asResult(after);
  });
}

/**
 * Označí obchod jako otevřený (R-42): nový Meta lead přestane být na boardu zvýrazněný. Idempotentní, nemění čas
 * poslední úpravy ani nezapisuje do historie (jde o zobrazení, ne o změnu obchodu).
 */
export async function markDealOpened(ctx: Ctx, dealId: string): Promise<DealChangeResult> {
  await assertEntityAccess(ctx, "deal", dealId, "read");
  const now = new Date();
  await ctx.db
    .update(deal)
    .set({ firstOpenedAt: now, openedBy: ctx.actor.userId, updatedAt: sql`${deal.updatedAt}` })
    .where(and(eq(deal.id, dealId), isNull(deal.firstOpenedAt), isNull(deal.deletedAt)));
  return asResult(await loadDeal(ctx.db, dealId));
}

/* ---------- další kontakty ---------- */

/** Přidá další kontakt k obchodu (hlavní kontakt je `personId` obchodu; ten sem nepatří). Idempotentní. */
export async function addParticipant(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { dealId: string; personId: string },
): Promise<{ added: boolean }> {
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, "deal", input.dealId, "write");
    const row = await loadDeal(c.db, input.dealId);
    if (row.personId === input.personId)
      throw new UserError("Tento kontakt je u obchodu hlavní, další kontakt být nemusí.");
    const titles = await recordTitles(c, deps.registry, "person", [input.personId]);
    const name = titles[input.personId];
    if (!name) throw new NotFoundError("Kontakt nenalezen.");
    const [exists] = await c.db
      .select({ id: dealParticipant.id })
      .from(dealParticipant)
      .where(
        and(
          eq(dealParticipant.dealId, input.dealId),
          eq(dealParticipant.personId, input.personId),
          isNull(dealParticipant.deletedAt),
        ),
      );
    if (exists) return { added: false };
    await c.db.insert(dealParticipant).values({
      dealId: input.dealId,
      personId: input.personId,
      createdBy: c.actor.userId,
      updatedBy: c.actor.userId,
    });
    await recordAudit(c, {
      action: "update",
      entityType: "deal",
      entityId: row.id,
      summary: `Další kontakt přidán: ${name}`,
      entityTitle: row.title,
    });
    return { added: true };
  });
}

/** Odebere další kontakt z obchodu (měkce). Idempotentní. */
export async function removeParticipant(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { dealId: string; personId: string },
): Promise<{ removed: boolean }> {
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, "deal", input.dealId, "write");
    const row = await loadDeal(c.db, input.dealId);
    const gone = await c.db
      .update(dealParticipant)
      .set({ deletedAt: new Date(), deletedBy: c.actor.userId })
      .where(
        and(
          eq(dealParticipant.dealId, input.dealId),
          eq(dealParticipant.personId, input.personId),
          isNull(dealParticipant.deletedAt),
        ),
      )
      .returning({ id: dealParticipant.id });
    if (!gone.length) return { removed: false };
    const titles = await recordTitles(c, deps.registry, "person", [input.personId]);
    await recordAudit(c, {
      action: "update",
      entityType: "deal",
      entityId: row.id,
      summary: `Další kontakt odebrán: ${titles[input.personId] ?? ""}`.trim(),
      entityTitle: row.title,
    });
    return { removed: true };
  });
}
