import { describe, expect, it } from "vitest";
import {
  authorText,
  boardKind,
  roleDefaults,
  sharedSummary,
  sharedWith,
  sortBoards,
  widgetCountText,
} from "./board-helpers";

const board = (over: Partial<Parameters<typeof boardKind>[0]> = {}) => ({
  defaultForRole: null,
  shared: { roles: [], users: [] },
  ...over,
});

describe("boardKind", () => {
  it("výchozí pro roli má přednost před sdílením", () => {
    expect(
      boardKind(board({ defaultForRole: "office", shared: { roles: ["x"], users: [] } })),
    ).toBe("default");
  });
  it("sdílená s rolí nebo uživatelem, jinak osobní", () => {
    expect(boardKind(board({ shared: { roles: ["foreman"], users: [] } }))).toBe("shared");
    expect(boardKind(board({ shared: { roles: [], users: ["u1"] } }))).toBe("shared");
    expect(boardKind(board())).toBe("personal");
  });
});

describe("texty", () => {
  it("autor, nebo sada klienta", () => {
    expect(authorText({ ownerName: "Jan Novák" })).toBe("Jan Novák");
    expect(authorText({ ownerName: null })).toBe("Sada klienta");
  });
  it("počet widgetů se správným tvarem", () => {
    expect(widgetCountText(0)).toBe("0 widgetů");
    expect(widgetCountText(1)).toBe("1 widget");
    expect(widgetCountText(3)).toBe("3 widgety");
    expect(widgetCountText(5)).toBe("5 widgetů");
  });
  it("komu je sdílená: role názvem, uživatelé jménem", () => {
    const names = sharedWith(
      { shared: { roles: ["office", "gone"], users: ["u1", "u2"] } },
      new Map([["office", "Kancelář"]]),
      new Map([["u1", "Eva Dvořáková"]]),
    );
    expect(names).toEqual(["Kancelář", "gone", "Eva Dvořáková", "Neznámý uživatel"]);
  });
  it("zkrácený výpis", () => {
    expect(sharedSummary([])).toBe("—");
    expect(sharedSummary(["A", "B"])).toBe("A, B");
    expect(sharedSummary(["A", "B", "C"])).toBe("A, B a 1 další");
    expect(sharedSummary(["A", "B", "C", "D", "E", "F", "G"])).toBe("A, B a 5 dalších");
  });
});

describe("výchozí nástěnky podle rolí", () => {
  it("každá role dostane své výchozí nástěnky, ostatní jsou prázdné", () => {
    const r = roleDefaults(
      [
        { id: "1", name: "Provoz", defaultForRole: "foreman", isHome: true },
        { id: "2", name: "Osobní", defaultForRole: null, isHome: false },
      ],
      [
        { key: "owner", name: "Majitel" },
        { key: "foreman", name: "Mistr" },
      ],
    );
    expect(r[0]).toEqual({ roleKey: "owner", roleName: "Majitel", boards: [] });
    expect(r[1]!.boards).toEqual([{ id: "1", name: "Provoz", isHome: true }]);
  });
});

describe("sortBoards", () => {
  it("výchozí, sdílené, osobní; uvnitř podle názvu česky", () => {
    const sorted = sortBoards([
      { name: "Žluta", ...board() },
      { name: "Čtvrtletí", ...board({ shared: { roles: ["a"], users: [] } }) },
      { name: "Provoz", ...board({ defaultForRole: "foreman" }) },
      { name: "Auta", ...board() },
    ]);
    expect(sorted.map((b) => b.name)).toEqual(["Provoz", "Čtvrtletí", "Auta", "Žluta"]);
  });
});
