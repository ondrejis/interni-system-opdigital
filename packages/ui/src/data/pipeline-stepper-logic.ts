/** Čistá logika pásu fází (bez Reactu), aby šla testovat samostatně. */

export type PipelineStage = {
  id: string;
  name: string;
  /** Barva štítku fáze (`LABEL_COLORS`); pás ji nese jako `data-color`, vzhled určuje stav (hotovo / aktuální / budoucí). */
  color?: string | undefined;
  kind?: "open" | "won" | "lost" | "done" | undefined;
  /** Počet dní, které záznam ve fázi strávil (nebo tráví); u fází, kterými neprošel, chybí. */
  daysInStage?: number | null | undefined;
};

/** Stav jedné fáze v pásu vůči aktuální: hotová, aktuální, budoucí. */
export type StepState = "done" | "current" | "future";

/**
 * Stav každé fáze podle pořadí: před aktuální = hotovo, aktuální, za ní = budoucí.
 * Neznámé nebo prázdné `currentId` (záznam bez fáze) = všechny budoucí.
 */
export function stepStates(
  stages: readonly { id: string }[],
  currentId: string | null,
): StepState[] {
  const at = currentId === null ? -1 : stages.findIndex((s) => s.id === currentId);
  return stages.map((_, i) =>
    at < 0 ? "future" : i < at ? "done" : i === at ? "current" : "future",
  );
}

/** „5 d“ pro popisek v pásu; záporné a nečíselné hodnoty se zahodí. */
export function shortDays(days: number | null | undefined): string | null {
  if (days === null || days === undefined || !Number.isFinite(days) || days < 0) return null;
  return `${Math.floor(days)} d`;
}

/** Česky: 0 dní, 1 den, 2–4 dny, 5+ dní (pro čtečky a tooltip). */
export function longDays(days: number): string {
  const n = Math.floor(days);
  if (n === 1) return "1 den";
  if (n >= 2 && n <= 4) return `${n} dny`;
  return `${n} dní`;
}

/** Zpřístupněný popis jedné fáze: „Nabídka odeslána, aktuální fáze, ve fázi 5 dní“. */
export function stepLabel(
  stage: PipelineStage,
  state: StepState,
  lockedReason?: string | null,
): string {
  const parts = [stage.name];
  if (state === "current") parts.push("aktuální fáze");
  else if (state === "done") parts.push("hotovo");
  if (shortDays(stage.daysInStage) !== null && state !== "future")
    parts.push(`ve fázi ${longDays(stage.daysInStage as number)}`);
  if (lockedReason) parts.push(`zamčeno: ${lockedReason}`);
  return parts.join(", ");
}

/** Index segmentu, na který skočí šipka (vlevo = -1, vpravo = +1); u kraje zůstane. */
export function stepFocusTarget(count: number, from: number, dir: -1 | 1): number {
  if (count <= 0) return -1;
  return Math.min(count - 1, Math.max(0, from + dir));
}

/** Poloha segmentu v pásu: určuje tvar (první a poslední mají zaoblený vnější okraj, vnitřní jsou chevrony). */
export type SegmentPlace = "single" | "first" | "middle" | "last";

/** Poloha segmentu `index` z `count` (první, vnitřní, poslední, nebo jediný). */
export function segmentPlace(index: number, count: number): SegmentPlace {
  if (count <= 1) return "single";
  if (index <= 0) return "first";
  return index >= count - 1 ? "last" : "middle";
}

/** Tooltip segmentu: celý název a (u hotové a aktuální fáze) dny ve fázi, např. „Nabídka v přípravě · 5 dní“. */
export function stepTitle(stage: PipelineStage, state: StepState): string {
  return shortDays(stage.daysInStage) !== null && state !== "future"
    ? `${stage.name} · ${longDays(stage.daysInStage as number)}`
    : stage.name;
}

/**
 * Váha segmentu při dělení šířky pásu: úměrná délce názvu (s rezervou na dny a šipku), aby se dlouhé názvy vešly
 * a krátké nezabíraly zbytečně. Omezeno na 12–28, takže rozdíl mezi nejužším a nejširším segmentem zůstane malý.
 */
export function segmentWeight(name: string): number {
  return Math.min(28, Math.max(12, name.trim().length + 6));
}
