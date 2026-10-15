import { createCtx, type Actor, type Scope } from "@rebar/core/rbac";
import opsysSeed from "../../../../../../clients/opsys/seed/index";
import { describe, expect, it } from "vitest";
import { allowedSections, SETTINGS_SECTIONS } from "./sections";

const CONFIG = [
  "/nastaveni/stavy",
  "/nastaveni/ciselniky",
  "/nastaveni/vlastni-pole",
  "/nastaveni/rady",
  "/nastaveni/moduly",
];
/** Řádky, které mají vedle `settings.manage` i užší oprávnění (Pipeline, Vlastní pole). */
const NARROW: Record<string, string> = {
  "/nastaveni/stavy": "settings.pipelines",
  "/nastaveni/vlastni-pole": "settings.custom_fields",
};

const ctxFor = (perms: Record<string, Scope>, unrestricted = false) => {
  const actor: Actor = {
    kind: "user",
    userId: "u1",
    roleKey: "x",
    permissions: new Map(Object.entries(perms)),
    unrestricted,
    restriction: null,
  };
  return createCtx({} as never, actor);
};
const hrefs = (ctx: ReturnType<typeof ctxFor>) => allowedSections(ctx).map((s) => s.href);

describe("sekce Nastavení podle oprávnění", () => {
  it("konfigurační stránky vyžadují settings.manage", () => {
    for (const href of CONFIG) {
      const permission = SETTINGS_SECTIONS.find((s) => s.href === href)?.permission;
      expect(permission).toEqual(
        NARROW[href] ? ["settings.manage", NARROW[href]] : "settings.manage",
      );
    }
  });

  it("Pipeline a Vlastní pole vidí i ten, kdo má jen settings.pipelines / settings.custom_fields", () => {
    expect(hrefs(ctxFor({ "settings.pipelines": "all" }))).toContain("/nastaveni/stavy");
    expect(hrefs(ctxFor({ "settings.pipelines": "all" }))).not.toContain("/nastaveni/vlastni-pole");
    expect(hrefs(ctxFor({ "settings.custom_fields": "all" }))).toContain("/nastaveni/vlastni-pole");
  });

  it("majitel (settings.manage) vidí všech pět konfiguračních stránek", () => {
    const seen = hrefs(ctxFor({ "settings.manage": "all" }));
    for (const href of CONFIG) expect(seen).toContain(href);
  });

  it("partner a externista správcovskou konfiguraci nevidí, jen vlastní účet (a Pipeline či Vlastní pole podle užšího oprávnění)", () => {
    for (const key of ["partner", "external"]) {
      const role = (opsysSeed.roles ?? []).find((r) => r.key === key)!;
      const seen = hrefs(ctxFor((role.permissions ?? {}) as Record<string, Scope>));
      const perms = role.permissions ?? {};
      for (const href of CONFIG) {
        // Pipeline a Vlastní pole smí vidět ten, kdo má jen užší oprávnění (Patrik)
        const narrow = NARROW[href];
        if (narrow && narrow in perms) expect(seen).toContain(href);
        else expect(seen, `${key} nesmí vidět ${href}`).not.toContain(href);
      }
      expect(seen).toContain("/nastaveni/zabezpeceni");
    }
  });

  it("Profil (jméno, heslo, zařízení) má každý přihlášený, i bez jakéhokoli oprávnění", () => {
    expect(hrefs(ctxFor({}))).toEqual(
      expect.arrayContaining(["/nastaveni/ucet", "/nastaveni/zabezpeceni"]),
    );
    const own = SETTINGS_SECTIONS.find((s) => s.href === "/nastaveni/ucet");
    expect(own?.permission).toBeNull();
    // bez správcovských oprávnění je Profil první položka, na kterou Nastavení přesměruje
    expect(hrefs(ctxFor({}))[0]).toBe("/nastaveni/ucet");
  });

  it("Nástěnky vyžadují dashboards.manage, Exporty má každý přihlášený", () => {
    expect(SETTINGS_SECTIONS.find((s) => s.href === "/nastaveni/nastenky")?.permission).toBe(
      "dashboards.manage",
    );
    expect(SETTINGS_SECTIONS.find((s) => s.href === "/nastaveni/exporty")?.permission).toBeNull();
    expect(hrefs(ctxFor({}))).toContain("/nastaveni/exporty");
    expect(hrefs(ctxFor({}))).not.toContain("/nastaveni/nastenky");
    expect(hrefs(ctxFor({ "dashboards.manage": "all" }))).toContain("/nastaveni/nastenky");
  });

  it("OPSYS nemá upozornění ani DPH: jejich sekce se v nabídce nenabízejí", () => {
    const seen = hrefs(ctxFor({ "settings.manage": "all" }));
    for (const href of [
      "/nastaveni/upozorneni",
      "/nastaveni/pravidla-upozorneni",
      "/nastaveni/dph",
    ])
      expect(seen).not.toContain(href);
  });

  it("sekce modulů se nabízejí jen při zapnutém modulu", () => {
    const ctx = ctxFor({ "disk.manage": "all", "finance.settings": "all" });
    expect(allowedSections(ctx, new Set(["disk"])).map((s) => s.href)).toEqual(
      expect.arrayContaining(["/nastaveni/google-disk"]),
    );
    expect(allowedSections(ctx, new Set(["disk"])).map((s) => s.href)).not.toContain(
      "/nastaveni/finance",
    );
  });

  it("funkce vypnuté v konfiguraci klienta se v nabídce nenabízejí", () => {
    const ctx = ctxFor({ "dashboards.manage": "all" });
    const without = (f: "dashboards" | "exports") =>
      allowedSections(ctx, undefined, new Set([f])).map((s) => s.href);
    expect(without("dashboards")).not.toContain("/nastaveni/nastenky");
    expect(without("dashboards")).toContain("/nastaveni/exporty");
    expect(without("exports")).not.toContain("/nastaveni/exporty");
    expect(without("exports")).toContain("/nastaveni/nastenky");
    // bez seznamu vypnutých funkcí se nabízí vše, na co aktér má právo
    expect(hrefs(ctx)).toEqual(
      expect.arrayContaining(["/nastaveni/nastenky", "/nastaveni/exporty"]),
    );
  });
});
