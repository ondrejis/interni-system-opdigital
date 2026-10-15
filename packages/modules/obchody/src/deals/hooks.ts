import { emitDomain } from "@rebar/core/events";
import { UserError } from "@rebar/core/rbac";
import type { EntityDef } from "@rebar/core/entities";
import { dealSnap, firstStage, loadStage, type DealRow } from "./common";
import { enterStage } from "./history";
import { storedWeightedMinor } from "./logic";
import { DEAL_RESULT_LABELS } from "../shared";

/*
  Háčky entity `deal` (jádro je volá při každém zápisu přes engine: ruční založení, úprava v tabulce i tažení na
  boardu). Starají se o to, co k obchodu patří vždy: výchozí fáze, čas vstupu do fáze, vážená hodnota, historie fází
  a události `deal.created` a `deal.stage_changed`. Výsledek obchodu (výhra, prohra, znovuotevření) mění příkazy
  (`transitions.ts`), tady se jen hlídá, že zavřený obchod se nepřesouvá mezi fázemi.
*/

type Hooks = Pick<EntityDef, "beforeCreate" | "afterCreate" | "beforeUpdate" | "afterUpdate">;

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

export const dealHooks: Hooks = {
  /** Doplní výchozí fázi (první ve výchozí pipeline), vlastníka a váženou hodnotu. */
  beforeCreate: async (ctx, values) => {
    const stage = values.status
      ? await loadStage(ctx.db, String(values.status))
      : await firstStage(ctx.db);
    if (!stage) throw new UserError("Pole „Fáze“: neplatný stav.");
    const out: Record<string, unknown> = { ...values, status: stage.id, result: "open" };
    if ((out.owner ?? null) === null && ctx.actor.userId) out.owner = ctx.actor.userId;
    out.weighted = storedWeightedMinor(num(out.value), "open", stage.probabilityPct);
    return out;
  },

  /** První řádek historie fází a událost `deal.created`. */
  afterCreate: async (ctx, created) => {
    const row = created as unknown as DealRow;
    await enterStage(ctx.db, {
      dealId: row.id,
      fromStageId: null,
      toStageId: row.stageId,
      at: row.stageEnteredAt,
      byUserId: ctx.actor.userId,
    });
    await emitDomain(
      ctx,
      "deal.created",
      { deal: dealSnap(row) },
      { entity: { type: "deal", id: row.id, isPrivate: row.isPrivate } },
    );
  },

  /**
   * Přesun do jiné fáze: jen otevřený obchod, čas vstupu do fáze a přepočet vážené hodnoty; změna hodnoty přepočítá
   * váženou hodnotu podle fáze a výsledku. Změny jsou klíčované sloupci tabulky.
   */
  beforeUpdate: async (ctx, before, changes) => {
    const b = before as unknown as DealRow;
    const stageId = changes.stageId as string | undefined;
    const moving = stageId !== undefined && stageId !== b.stageId;
    const valueChanged = "valueMinor" in changes;
    if (!moving && !valueChanged) return;
    if (moving && b.result !== "open")
      throw new UserError(
        `Obchod je ${DEAL_RESULT_LABELS[b.result].toLowerCase()}. Nejdřív ho znovu otevřete, potom ho jde přesunout.`,
      );
    const stage = await loadStage(ctx.db, moving ? stageId : b.stageId);
    const value = valueChanged ? num(changes.valueMinor) : b.valueMinor;
    const extra: Record<string, unknown> = {
      weightedMinor: storedWeightedMinor(value, b.result, stage?.probabilityPct ?? null),
    };
    if (moving) extra.stageEnteredAt = new Date();
    return extra;
  },

  /** Historie fází a událost `deal.stage_changed` při změně fáze. */
  afterUpdate: async (ctx, before, after) => {
    const b = before as unknown as DealRow;
    const a = after as unknown as DealRow;
    if (a.stageId === b.stageId) return;
    const seconds = await enterStage(ctx.db, {
      dealId: a.id,
      fromStageId: b.stageId,
      toStageId: a.stageId,
      at: a.stageEnteredAt,
      byUserId: ctx.actor.userId,
    });
    await emitDomain(
      ctx,
      "deal.stage_changed",
      {
        deal: dealSnap(a),
        fromStageId: b.stageId,
        toStageId: a.stageId,
        secondsInPrevious: seconds,
      },
      { entity: { type: "deal", id: a.id, isPrivate: a.isPrivate } },
    );
  },
};
