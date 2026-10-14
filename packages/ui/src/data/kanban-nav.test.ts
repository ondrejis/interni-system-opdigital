import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUT_KEYS,
  isNavKey,
  locateCard,
  moveCardFocus,
  shortcutFor,
} from "./kanban-nav";

describe("moveCardFocus", () => {
  const sizes = [3, 0, 2, 1];

  it("↑↓ se pohybují po kartách sloupce a u kraje se zastaví", () => {
    expect(moveCardFocus(sizes, { col: 0, idx: 1 }, "ArrowDown")).toEqual({ col: 0, idx: 2 });
    expect(moveCardFocus(sizes, { col: 0, idx: 2 }, "ArrowDown")).toEqual({ col: 0, idx: 2 });
    expect(moveCardFocus(sizes, { col: 0, idx: 0 }, "ArrowUp")).toEqual({ col: 0, idx: 0 });
    expect(moveCardFocus(sizes, { col: 0, idx: 2 }, "ArrowUp")).toEqual({ col: 0, idx: 1 });
  });

  it("←→ přeskočí prázdné sloupce a drží pořadí, nejvýš na poslední kartu", () => {
    expect(moveCardFocus(sizes, { col: 0, idx: 1 }, "ArrowRight")).toEqual({ col: 2, idx: 1 });
    expect(moveCardFocus(sizes, { col: 0, idx: 2 }, "ArrowRight")).toEqual({ col: 2, idx: 1 });
    expect(moveCardFocus(sizes, { col: 2, idx: 1 }, "ArrowRight")).toEqual({ col: 3, idx: 0 });
    expect(moveCardFocus(sizes, { col: 2, idx: 0 }, "ArrowLeft")).toEqual({ col: 0, idx: 0 });
  });

  it("v krajním sloupci se ←→ nepohnou", () => {
    expect(moveCardFocus(sizes, { col: 3, idx: 0 }, "ArrowRight")).toEqual({ col: 3, idx: 0 });
    expect(moveCardFocus(sizes, { col: 0, idx: 1 }, "ArrowLeft")).toEqual({ col: 0, idx: 1 });
    // za sloupcem 0 jsou jen prázdné sloupce
    expect(moveCardFocus([2, 0, 0], { col: 0, idx: 0 }, "ArrowRight")).toEqual({ col: 0, idx: 0 });
  });

  it("Home a End skočí na první a poslední kartu sloupce", () => {
    expect(moveCardFocus(sizes, { col: 0, idx: 1 }, "Home")).toEqual({ col: 0, idx: 0 });
    expect(moveCardFocus(sizes, { col: 0, idx: 0 }, "End")).toEqual({ col: 0, idx: 2 });
  });
});

describe("locateCard", () => {
  it("najde sloupec a pořadí", () => {
    const ids = [["a", "b"], [], ["c"]];
    expect(locateCard(ids, "b")).toEqual({ col: 0, idx: 1 });
    expect(locateCard(ids, "c")).toEqual({ col: 2, idx: 0 });
    expect(locateCard(ids, "x")).toBeNull();
  });
});

describe("zkratky", () => {
  it("rozpozná A, W, L (i velkými písmeny) a ignoruje modifikátory", () => {
    expect(shortcutFor({ key: "a" }, DEFAULT_SHORTCUT_KEYS)).toBe("a");
    expect(shortcutFor({ key: "W" }, DEFAULT_SHORTCUT_KEYS)).toBe("w");
    expect(shortcutFor({ key: "l" }, DEFAULT_SHORTCUT_KEYS)).toBe("l");
    expect(shortcutFor({ key: "x" }, DEFAULT_SHORTCUT_KEYS)).toBeNull();
    expect(shortcutFor({ key: "a", metaKey: true }, DEFAULT_SHORTCUT_KEYS)).toBeNull();
    expect(shortcutFor({ key: "a", ctrlKey: true }, DEFAULT_SHORTCUT_KEYS)).toBeNull();
    expect(shortcutFor({ key: "Enter" }, DEFAULT_SHORTCUT_KEYS)).toBeNull();
  });

  it("šipky jsou navigační klávesy", () => {
    expect(isNavKey("ArrowLeft")).toBe(true);
    expect(isNavKey("Home")).toBe(true);
    expect(isNavKey("a")).toBe(false);
  });
});
