import { describe, expect, it } from "vitest";
import { appearancePatch, readAppearance, resolveStartPage } from "./prefs";

describe("předvolby vzhledu", () => {
  it("chybějící nebo poškozená data nahradí výchozími hodnotami", () => {
    const defaults = { theme: "system", density: "comfortable", startPage: null };
    expect(readAppearance(undefined)).toEqual(defaults);
    expect(readAppearance({})).toEqual(defaults);
    expect(readAppearance("nesmysl")).toEqual(defaults);
    expect(readAppearance({ theme: "neon", density: 3, startPage: "https://zlo.example" })).toEqual(
      defaults,
    );
  });

  it("platné hodnoty zachová, cizí klíče ignoruje", () => {
    expect(
      readAppearance({ theme: "dark", density: "compact", startPage: "/obchody", lastFilter: {} }),
    ).toEqual({ theme: "dark", density: "compact", startPage: "/obchody" });
  });

  it("změna přijme jen platné hodnoty a jen interní adresy", () => {
    expect(appearancePatch.parse({ theme: "light" })).toEqual({ theme: "light" });
    expect(appearancePatch.safeParse({ theme: "modrý" }).success).toBe(false);
    expect(appearancePatch.safeParse({ startPage: "//evil.example" }).success).toBe(false);
    expect(appearancePatch.safeParse({ startPage: "https://evil.example" }).success).toBe(false);
    expect(appearancePatch.safeParse({ startPage: "/../x" }).success).toBe(false);
    expect(appearancePatch.parse({ startPage: "/muj-prostor/hosting" })).toEqual({
      startPage: "/muj-prostor/hosting",
    });
    expect(appearancePatch.parse({ startPage: null })).toEqual({ startPage: null });
  });

  it("úvodní stránka se použije jen když je mezi dostupnými, jinak výchozí", () => {
    const allowed = ["/prehled", "/obchody", "/ukoly"];
    expect(resolveStartPage({ startPage: "/obchody" }, allowed, "/prehled")).toBe("/obchody");
    expect(resolveStartPage({ startPage: "/finance" }, allowed, "/prehled")).toBe("/prehled");
    expect(resolveStartPage({ startPage: null }, allowed, "/nastaveni/ucet")).toBe(
      "/nastaveni/ucet",
    );
  });
});
