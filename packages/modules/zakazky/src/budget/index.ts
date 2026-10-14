import type { PhaseTransitionHook } from "@rebar/core/entities";
import type { ModuleServer } from "@rebar/core/module-server";
import { applyTemplateTx } from "../templates/service";
import { commands } from "./commands";
import { ensureOffer, ensureRealization, recomputeSummary } from "./service";
import { offerSentProblem, setWon, winOfferTx } from "./transitions";

/** Fáze po výhře nabídky (příprava a dál); sem se z nabídky dostane vyhraná zakázka. */
const WON_TO = ["preparation", "execution", "handover", "warranty", "closed"] as const;
const rowId = (row: Record<string, unknown>) => String(row.id);

/**
 * Hooky přechodů fáze (ADR 015). Řádek `row` je surový řádek tabulky `job`.
 * - vstup do nabídky (i při založení v této fázi): založí nabídkovou verzi s výchozím objektem „Celá zakázka“
 *   (a naplní ji šablonou, má-li zakázka `templateId`)
 * - nabídka → příprava (vyhráno): kontrola odeslané nabídky; zamkne nabídku, zkopíruje ji do realizace,
 *   nastaví původní smluvní cenu zakázky (prodej nabídky bez DPH) a datum výhry
 * - vstup do přípravy a dál mimo nabídku (zakázka založená přímo, obnovení): zajistí realizační verzi
 */
export const phaseHooks: PhaseTransitionHook[] = [
  {
    id: "budget.offer-entry",
    entity: "job",
    to: ["offer"],
    after: async (ctx, row) => {
      const { created } = await ensureOffer(ctx, rowId(row));
      // zakázka založená ze šablony (`templateId`) dostane její kostru hned do nové nabídky
      if (created && typeof row.templateId === "string")
        await applyTemplateTx(ctx, rowId(row), row.templateId, { initial: true });
    },
  },
  {
    id: "budget.won",
    entity: "job",
    from: ["offer"],
    to: WON_TO,
    check: async (ctx, row) => offerSentProblem(ctx, rowId(row)),
    after: async (ctx, row) => {
      const won = await winOfferTx(ctx, rowId(row));
      await setWon(ctx, rowId(row), won.valueMinor);
      await recomputeSummary(ctx, rowId(row));
    },
  },
  {
    id: "budget.realization-entry",
    entity: "job",
    from: ["", "inquiry", "paused", "lost", ...WON_TO],
    to: WON_TO,
    after: async (ctx, row) => {
      await ensureRealization(ctx, rowId(row));
    },
  },
];

/** Oblast „budget“ modulu Zakázky (ADR 015): verze, objekty, oddíly, položky, marže, původní a aktuální cena, zamčení. */
export const area: ModuleServer = { commands, phaseHooks };
