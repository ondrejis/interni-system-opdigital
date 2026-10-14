/** Čistá logika klávesnice nad nástěnkou (bez Reactu): pohyb mezi kartami a rozpoznání zkratek. */

export type CardPos = { col: number; idx: number };
/** Klávesy, kterými se pohybuje fokus mezi kartami. */
export type NavKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

export const NAV_KEYS: readonly string[] = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
];

/** Výchozí zkratky nad kartou: A = aktivita, W = vyhráno (won), L = prohráno (lost). */
export const DEFAULT_SHORTCUT_KEYS: readonly string[] = ["a", "w", "l"];

/** Je klávesa navigační (šipky, Home, End)? */
export const isNavKey = (k: string): k is NavKey => NAV_KEYS.includes(k);

/** Kde karta leží: sloupec a pořadí v něm (`null`, když tam není). */
export function locateCard(ids: readonly (readonly string[])[], id: string): CardPos | null {
  for (let col = 0; col < ids.length; col++) {
    const idx = ids[col]!.indexOf(id);
    if (idx >= 0) return { col, idx };
  }
  return null;
}

/**
 * Kam se přesune fokus: ↑↓ po kartách sloupce, ←→ do nejbližšího neprázdného sloupce v tom směru (na stejné pořadí,
 * nejvýš na poslední kartu), Home/End na první/poslední kartu sloupce. U kraje zůstane na místě.
 * `sizes` jsou počty karet ve sloupcích.
 */
export function moveCardFocus(sizes: readonly number[], from: CardPos, key: NavKey): CardPos {
  const size = sizes[from.col] ?? 0;
  switch (key) {
    case "ArrowUp":
      return { col: from.col, idx: Math.max(0, from.idx - 1) };
    case "ArrowDown":
      return { col: from.col, idx: Math.min(Math.max(0, size - 1), from.idx + 1) };
    case "Home":
      return { col: from.col, idx: 0 };
    case "End":
      return { col: from.col, idx: Math.max(0, size - 1) };
    case "ArrowLeft":
    case "ArrowRight": {
      const dir = key === "ArrowLeft" ? -1 : 1;
      for (let c = from.col + dir; c >= 0 && c < sizes.length; c += dir) {
        const n = sizes[c] ?? 0;
        if (n > 0) return { col: c, idx: Math.min(from.idx, n - 1) };
      }
      return from;
    }
  }
}

/** Klávesa → zkratka (malé písmeno), když je mezi povolenými a nejsou stisknuté Ctrl/⌘/Alt. */
export function shortcutFor(
  e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  keys: readonly string[],
): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : "";
  return k && keys.includes(k) ? k : null;
}
