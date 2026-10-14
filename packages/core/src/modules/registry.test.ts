import { describe, expect, it } from "vitest";
import { defineModule, type ModuleManifest } from "./manifest";
import { collectNav, collectPermissions, ModuleResolutionError, resolveModules } from "./registry";

const mod = (
  id: ModuleManifest["id"],
  dependsOn: ModuleManifest["dependsOn"] = [],
): ModuleManifest =>
  defineModule({
    id,
    name: id,
    description: id,
    icon: "box",
    dependsOn,
    nav: [{ label: id, href: `/${id}`, icon: "box" }],
    permissions: [{ key: `${id}.read`, label: id }],
  });

const kontakty = mod("kontakty");
const zakazky = mod("zakazky", ["kontakty"]);
const fakturace = mod("fakturace", ["zakazky", "kontakty"]);
const sklad = mod("sklad");
const all = [kontakty, zakazky, fakturace, sklad];

describe("resolveModules", () => {
  it("řadí závislosti před moduly, které je potřebují", () => {
    const ids = resolveModules(["fakturace", "zakazky", "kontakty"], all).map((m) => m.id);
    expect(ids.indexOf("kontakty")).toBeLessThan(ids.indexOf("zakazky"));
    expect(ids.indexOf("zakazky")).toBeLessThan(ids.indexOf("fakturace"));
  });

  it("odmítne zapnutý modul bez zapnuté závislosti", () => {
    expect(() => resolveModules(["fakturace"], all)).toThrow(ModuleResolutionError);
    expect(() => resolveModules(["zakazky"], all)).toThrow(/vyžaduje zapnutý modul „kontakty“/);
  });

  it("odmítne modul, který v sestavení neexistuje", () => {
    expect(() => resolveModules(["stroje"], all)).toThrow(/není v tomto sestavení/);
  });

  it("zachytí cyklus", () => {
    const a = mod("kontakty", ["zakazky"]);
    const b = mod("zakazky", ["kontakty"]);
    expect(() => resolveModules(["kontakty", "zakazky"], [a, b])).toThrow(/Cyklická/);
  });

  it("vypnutý modul nezanechá stopu v navigaci ani v oprávněních", () => {
    const enabled = resolveModules(["kontakty", "zakazky"], all);
    expect(collectNav(enabled).map((n) => n.href)).toEqual(["/kontakty", "/zakazky"]);
    const keys = collectPermissions(enabled).map((p) => p.key);
    expect(keys).toContain("zakazky.read");
    expect(keys).not.toContain("fakturace.read");
    expect(keys).not.toContain("sklad.read");
  });
});
