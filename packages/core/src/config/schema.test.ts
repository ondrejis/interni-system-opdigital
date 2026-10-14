import { describe, expect, it } from "vitest";
import { ClientConfigError, defineClientConfig } from "./define";
import type { ClientConfigInput } from "./schema";

const valid: ClientConfigInput = {
  slug: "stavby-novak",
  branding: { name: "Stavby Novák", shortName: "Novák", accentColor: "#336699" },
  modules: ["kontakty", "zakazky"],
};

describe("defineClientConfig", () => {
  it("doplní výchozí hodnoty", () => {
    const c = defineClientConfig(valid);
    expect(c.locale).toEqual({ locale: "cs-CZ", timezone: "Europe/Prague", currency: "CZK" });
    expect(c.security.require2faRoles).toEqual(["owner", "admin"]);
    expect(c.agency.serviceAccess).toBe("off");
  });

  it("odmítne neznámý modul a vypíše cestu k chybě", () => {
    const bad = { ...valid, modules: ["kontakty", "neexistuje"] } as unknown as ClientConfigInput;
    expect(() => defineClientConfig(bad)).toThrow(ClientConfigError);
    try {
      defineClientConfig(bad);
    } catch (e) {
      expect((e as ClientConfigError).slug).toBe("stavby-novak");
      expect((e as ClientConfigError).issues.join("\n")).toContain("modules");
    }
  });

  it("odmítne špatný slug a špatnou barvu najednou", () => {
    const bad = {
      ...valid,
      slug: "Špatný Slug",
      branding: { ...valid.branding, accentColor: "modrá" },
    };
    try {
      defineClientConfig(bad);
      expect.unreachable();
    } catch (e) {
      const issues = (e as ClientConfigError).issues.join("\n");
      expect(issues).toContain("slug");
      expect(issues).toContain("branding.accentColor");
    }
  });

  it("odmítne neznámé klíče (překlep v konfiguraci)", () => {
    const bad = { ...valid, modulez: [] } as unknown as ClientConfigInput;
    expect(() => defineClientConfig(bad)).toThrow(ClientConfigError);
  });

  it("nepustí interní název jádra do viditelného názvu systému", () => {
    const bad = { ...valid, branding: { ...valid.branding, name: "Rebar pro Nováka" } };
    expect(() => defineClientConfig(bad)).toThrow(/interní název/);
  });

  it("vyžaduje alespoň jeden modul", () => {
    expect(() => defineClientConfig({ ...valid, modules: [] })).toThrow(ClientConfigError);
  });
});
