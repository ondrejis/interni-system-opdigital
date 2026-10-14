import type { Ctx } from "../rbac/types";

/**
 * Hook přechodu fáze záznamu (zakázka: poptávka → nabídka → … → uzavřeno). Moduly je dodávají přes `phaseHooks`
 * v serverové části; entita (`beforeUpdate`/`afterUpdate`) je pouští při změně fáze. Hook patří modulu, který
 * zná důsledek přechodu (rozpočet zamkne nabídku, realizace otevře deník…), entita o nich nic neví.
 */
export type PhaseTransition = { from: string; to: string };

/** Změna stavu (pipeline) záznamu; platí i pro přesun uvnitř jedné fáze. `fromStageId` je `null` při založení. */
export type StageChange = {
  fromStageId: string | null;
  toStageId: string;
  fromPhase: string | null;
  toPhase: string | null;
};

export type PhaseTransitionHook = {
  /** Stabilní jméno pro logy a testy (`budget.lock-offer`). */
  id: string;
  /** Typ záznamu (`job`). */
  entity: string;
  /** Cílové fáze, pro které hook platí; `"*"` = všechny. */
  to: readonly string[];
  /** Výchozí fáze, pro které hook platí; bez ní platí pro všechny. */
  from?: readonly string[];
  /** Kontrola před přechodem; vrátí českou větu, proč přechod nejde (prázdné = v pořádku). Běží v transakci. */
  check?: (
    ctx: Ctx,
    row: Record<string, unknown>,
    transition: PhaseTransition,
  ) => Promise<string | null>;
  /** Automatická akce těsně před zápisem nové fáze (v téže transakci). */
  run?: (ctx: Ctx, row: Record<string, unknown>, transition: PhaseTransition) => Promise<void>;
  /** Automatická akce po zápisu nové fáze (v téže transakci), kdy už řádek nese novou fázi. */
  after?: (ctx: Ctx, row: Record<string, unknown>, transition: PhaseTransition) => Promise<void>;
  /**
   * Kontrola při každé změně stavu, i uvnitř jedné fáze (u `check` jde jen o změnu fáze). `row` je řádek sloučený
   * s probíhající změnou. Česká věta = změna nejde. Hook s touto kontrolou uvede `to: ["*"]`.
   */
  checkStage?: (
    ctx: Ctx,
    row: Record<string, unknown>,
    change: StageChange,
  ) => Promise<string | null>;
  /** Po zápisu změny stavu (v téže transakci); při založení záznamu s `fromStageId: null`. */
  afterStage?: (ctx: Ctx, row: Record<string, unknown>, change: StageChange) => Promise<void>;
  /**
   * Po každé změně záznamu, která mění údaje sloužící obchodu (stav, cena, pravděpodobnost, archiv), a po přepočtu
   * souhrnu zakázky. Dostane řádek před a po změně; slouží k přepočtu odvozených údajů (CRM).
   */
  afterChange?: (
    ctx: Ctx,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => Promise<void>;
};

const g = globalThis as { __phaseHooks?: PhaseTransitionHook[] }; // globálně: Next bundluje route handlery zvlášť

/** Nahradí zaregistrované hooky (volá se při sestavení zapnutých modulů, tedy i v testech a ve workeru). */
export function setPhaseHooks(hooks: readonly PhaseTransitionHook[]) {
  g.__phaseHooks = [...hooks];
}

export function phaseHooksFor(entity: string, t: PhaseTransition): PhaseTransitionHook[] {
  return (g.__phaseHooks ?? []).filter(
    (h) =>
      h.entity === entity &&
      (h.to.includes("*") || h.to.includes(t.to)) &&
      (!h.from || h.from.includes(t.from)),
  );
}

/** Hooky záznamu, které reagují na změnu stavu nebo na změnu údajů (ne jen na přechod fáze). */
export function stageHooksFor(entity: string): PhaseTransitionHook[] {
  return (g.__phaseHooks ?? []).filter(
    (h) => h.entity === entity && (h.checkStage || h.afterStage || h.afterChange),
  );
}
