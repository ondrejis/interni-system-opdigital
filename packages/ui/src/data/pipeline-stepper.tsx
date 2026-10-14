"use client";

import { Lock } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { Tooltip } from "../components/overlay";
import { cn } from "../lib/cn";
import {
  segmentPlace,
  segmentWeight,
  shortDays,
  stepFocusTarget,
  stepLabel,
  stepStates,
  stepTitle,
  type PipelineStage,
  type SegmentPlace,
  type StepState,
} from "./pipeline-stepper-logic";

export type { PipelineStage, StepState };

/** Vlastnosti `PipelineStepper`. */
export type PipelineStepperProps = {
  stages: readonly PipelineStage[];
  /** Aktuální fáze; `null` = záznam ještě nemá fázi (všechny jsou budoucí). */
  currentId: string | null;
  /** Klik na jinou fázi než aktuální. Bez něj je pás jen k prohlížení. */
  onSelect?: ((stageId: string) => void) | undefined;
  /** Důvod, proč přechod do fáze nejde (zamčený přechod, zobrazí se v tooltipu); `null`/`undefined` = jde. */
  disabledReason?: ((stageId: string) => string | null | undefined) | undefined;
  /**
   * `md` = 40 px (detail; název a pod ním dny ve fázi), `compact` = 24 px (seznamy, jedna řádka),
   * `mini` = 20 px bez textu a bez minimální šířky segmentu (pruh pozice na úzké kartě; název je v popisku a tooltipu).
   */
  size?: "md" | "compact" | "mini";
  /** Celý pás vypnutý (např. chybí oprávnění zápisu); bez tooltipu. */
  disabled?: boolean | undefined;
  /** Popisek pro čtečky obrazovky. */
  label?: string;
  className?: string | undefined;
};

/**
 * Geometrie podle velikosti (px): `n` hloubka šipky, `g` mezera mezi segmenty, `r` zaoblení vnějších rohů.
 * Všechny segmenty mají stejnou výšku, stejné šikmé hrany a stejnou mezeru, takže pás je od okraje k okraji jeden celek.
 */
const GEOMETRY = {
  md: { n: 8, g: 3, r: 6 },
  compact: { n: 6, g: 2, r: 4 },
  mini: { n: 5, g: 2, r: 3 },
} as const;

/** Focus kopíruje tvar segmentu (outline by ořízl clip-path). */
const FOCUS =
  "focus-visible:outline-none focus-visible:[filter:drop-shadow(0_0_1px_var(--accent))_drop-shadow(0_0_1.5px_var(--accent))]";

/**
 * Tvar segmentu: vnitřní jsou chevrony (výřez vlevo, špička vpravo), první má rovný zaoblený začátek, poslední rovný
 * zaoblený konec (žádná prázdná špička navíc, pás končí přesně na okraji obsahu).
 */
const SHAPE: Record<SegmentPlace, { clip: string | undefined; round: string }> = {
  single: { clip: undefined, round: "rounded-[var(--r)]" },
  first: {
    clip: "polygon(0 0, calc(100% - var(--n)) 0, 100% 50%, calc(100% - var(--n)) 100%, 0 100%)",
    round: "rounded-l-[var(--r)]",
  },
  middle: {
    clip: "polygon(0 0, calc(100% - var(--n)) 0, 100% 50%, calc(100% - var(--n)) 100%, 0 100%, var(--n) 50%)",
    round: "",
  },
  last: {
    clip: "polygon(0 0, 100% 0, 100% 100%, 0 100%, var(--n) 50%)",
    round: "rounded-r-[var(--r)]",
  },
};

/**
 * Pás fází jako šipky (chevrony) přes celou dostupnou šířku: šířka se dělí úměrně délce názvu (v mini pásu stejně), hotové fáze jsou zeleně,
 * aktuální v barvě akcentu, budoucí šedě. V detailu (`md`) je v segmentu název a pod ním dny ve fázi; dlouhý název se
 * zkrátí a celý je v tooltipu. Klik přesune záznam do fáze, zamčený přechod ukáže důvod v tooltipu. Na úzkém displeji
 * se pás posouvá do stran uvnitř sebe (stránka se nerozšíří) a aktuální fáze se sama vystředí.
 */
export function PipelineStepper({
  stages,
  currentId,
  onSelect,
  disabledReason,
  size = "md",
  disabled,
  label = "Fáze",
  className,
}: PipelineStepperProps) {
  const states = stepStates(stages, currentId);
  const listRef = useRef<HTMLOListElement>(null);
  const { n, g, r } = GEOMETRY[size];

  // Aktuální fáze se vycentruje v pásu (jen když se pás vůbec posouvá); stránka se neposouvá.
  useEffect(() => {
    const list = listRef.current;
    const cur = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !cur || list.scrollWidth <= list.clientWidth) return;
    const li = cur.closest("li") ?? cur;
    list.scrollLeft = li.offsetLeft - (list.clientWidth - li.offsetWidth) / 2;
  }, [currentId, stages.length]);

  function onKeyDown(e: KeyboardEvent<HTMLOListElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const at = buttons.findIndex((b) => b === document.activeElement);
    if (at < 0) return;
    const to = stepFocusTarget(buttons.length, at, e.key === "ArrowLeft" ? -1 : 1);
    e.preventDefault();
    buttons[to]?.focus();
  }

  return (
    <ol
      ref={listRef}
      aria-label={label}
      data-testid="pipeline-stepper"
      data-size={size}
      onKeyDown={onKeyDown}
      style={{ "--n": `${n}px`, "--g": `${g}px`, "--r": `${r}px` } as CSSProperties}
      className={cn(
        "scrollbar-none relative flex w-full min-w-0 max-w-full items-stretch overflow-x-auto overscroll-x-contain",
        size === "md" ? "min-h-10" : size === "mini" ? "min-h-5" : "min-h-6",
        className,
      )}
    >
      {stages.map((stage, i) => {
        const state = states[i]!;
        const place = segmentPlace(i, stages.length);
        const first = place === "first" || place === "single";
        const last = place === "last" || place === "single";
        const locked = state !== "current" ? (disabledReason?.(stage.id) ?? null) : null;
        const interactive = !!onSelect && state !== "current" && !disabled;
        const days = state === "future" ? null : shortDays(stage.daysInStage);
        const text = stepLabel(stage, state, locked);
        const tooltip = stepTitle(stage, state);
        const stacked = size === "md" && !!days;
        const shape = (
          <span
            style={{ clipPath: SHAPE[place].clip }}
            className={cn(
              "flex size-full min-w-0 items-center justify-center whitespace-nowrap font-medium transition-colors",
              size === "md" ? "text-sm" : "text-xs",
              SHAPE[place].round,
              // text leží mezi výřezem a špičkou, ne přes ně
              first ? "pl-3" : "pl-[calc(var(--n)+6px)]",
              last ? "pr-3" : "pr-[calc(var(--n)+2px)]",
              size === "mini" && "px-0",
              shapeTone(state, stage.kind),
              interactive && !locked && state === "future" && "group-hover:text-fg",
              interactive && !locked && "group-hover:brightness-95",
              (locked || (disabled && state !== "current")) && "opacity-60",
            )}
          >
            {size !== "mini" && (
              <span className={cn("flex min-w-0 items-center", stacked ? "flex-col" : "gap-1.5")}>
                <span className="flex min-w-0 max-w-full items-center gap-1.5">
                  {locked && <Lock className="size-3 shrink-0" aria-hidden />}
                  <span className="truncate">{stage.name}</span>
                </span>
                {days && (
                  <span
                    className={cn(
                      "tabular shrink-0 font-normal opacity-90",
                      stacked && "-mt-0.5 text-xs leading-tight",
                    )}
                  >
                    {days}
                  </span>
                )}
              </span>
            )}
          </span>
        );
        const cls = cn(
          "group block h-full w-full rounded-none p-0 text-left",
          size === "md" ? "min-h-10" : size === "mini" ? "min-h-5" : "min-h-6",
        );
        return (
          <li
            key={stage.id}
            data-stage={stage.id}
            data-state={state}
            data-color={stage.color}
            style={{ flexGrow: size === "mini" ? 1 : segmentWeight(stage.name) }}
            className={cn(
              "flex min-w-[7.5rem] max-sm:min-w-[9rem] shrink basis-0",
              size === "compact" && "min-w-[5.5rem] max-sm:min-w-[7rem]",
              // mini: segmenty se vejdou do karty (název stavu je mimo pás)
              size === "mini" && "min-w-0 max-sm:min-w-0",
              i > 0 && "ml-[calc(var(--g)-var(--n))]",
            )}
          >
            {interactive ? (
              locked ? (
                <Tooltip label={locked} side="bottom">
                  <button
                    type="button"
                    aria-label={text}
                    aria-disabled
                    data-locked=""
                    className={cn(cls, FOCUS, "cursor-not-allowed")}
                  >
                    {shape}
                  </button>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  aria-label={text}
                  title={tooltip}
                  className={cn(cls, FOCUS)}
                  onClick={() => onSelect(stage.id)}
                >
                  {shape}
                </button>
              )
            ) : (
              <div
                className={cls}
                aria-label={text}
                aria-current={state === "current" ? "step" : undefined}
                role="img"
                title={tooltip}
              >
                {shape}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function shapeTone(state: StepState, kind: PipelineStage["kind"]): string {
  if (state === "current") {
    if (kind === "lost") return "bg-danger text-bg";
    if (kind === "won") return "bg-success text-bg";
    return "bg-accent text-accent-fg";
  }
  if (state === "done") return "bg-success-soft text-success";
  return "bg-active text-muted";
}
