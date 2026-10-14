import { describe, expect, it } from "vitest";
import {
  ACTIVE_PHASES,
  MAIN_PHASES,
  PHASES,
  PHASE_KEYS,
  allowedNext,
  canTransition,
  isPriceLocked,
  primaryActionFor,
  transitionProblem,
} from "./phases";
import { CRM_DEAL_STAGES, JOB_STAGES, phaseForLegacyStage } from "./stages";
import { JOB_VIEWS } from "./views";

describe("fáze zakázky", () => {
  it("každá fáze má český název, barvu a jedinečné pořadí; hlavní řada jde po sobě", () => {
    expect(new Set(PHASE_KEYS.map((k) => PHASES[k].order)).size).toBe(PHASE_KEYS.length);
    for (const k of PHASE_KEYS) {
      expect(PHASES[k].key).toBe(k);
      expect(PHASES[k].label.length).toBeGreaterThan(2);
    }
    const orders = MAIN_PHASES.map((k) => PHASES[k].order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("hlavní akce vedou do povolené další fáze", () => {
    for (const k of PHASE_KEYS) {
      const a = PHASES[k].primaryAction;
      if (a) expect(canTransition(k, a.to), `${k} → ${a.to}`).toBe(true);
    }
    expect(PHASES.inquiry.primaryAction).toEqual({ label: "Vytvořit nabídku", to: "offer" });
    expect(PHASES.preparation.primaryAction?.label).toBe("Zahájit realizaci");
    expect(PHASES.closed.primaryAction).toBeNull();
  });

  it("přechody: dopředu o fázi, zpět o fázi, prohra před předáním, uzavřenou jde jen znovu otevřít", () => {
    expect(canTransition("inquiry", "offer")).toBe(true);
    expect(canTransition("inquiry", "preparation")).toBe(true);
    expect(canTransition("inquiry", "execution")).toBe(false);
    expect(canTransition("offer", "lost")).toBe(true);
    expect(canTransition("execution", "lost")).toBe(true);
    expect(canTransition("handover", "lost")).toBe(false);
    expect(canTransition("execution", "preparation")).toBe(true);
    expect(canTransition("closed", "execution")).toBe(false);
    expect(allowedNext("closed")).toEqual(["warranty"]);
    expect(canTransition("execution", "execution")).toBe(true);
  });

  it("pozastavená zakázka se vrací jen do původní fáze (nebo do prohráno)", () => {
    expect(allowedNext("paused", "execution")).toEqual(["execution", "lost"]);
    expect(canTransition("paused", "preparation", "execution")).toBe(false);
    expect(allowedNext("paused", null)).toEqual(["lost"]);
    expect(primaryActionFor("paused", "execution")).toEqual({
      label: "Obnovit zakázku",
      to: "execution",
    });
    expect(primaryActionFor("paused", null)).toBeNull();
  });

  it("věta o zamítnutém přechodu nabídne možnosti", () => {
    expect(transitionProblem("inquiry", "execution")).toMatch(
      /Z fáze „Poptávka“ nejde přejít do fáze „Realizace“\. Možné další fáze: „Nabídka“/,
    );
    expect(transitionProblem("inquiry", "offer")).toBeNull();
  });

  it("smluvní cena je zamčená od realizace, u pozastavené podle původní fáze", () => {
    expect(isPriceLocked("preparation")).toBe(false);
    expect(isPriceLocked("execution")).toBe(true);
    expect(isPriceLocked("closed")).toBe(true);
    expect(isPriceLocked("paused", "preparation")).toBe(false);
    expect(isPriceLocked("paused", "execution")).toBe(true);
    expect(ACTIVE_PHASES).toContain("execution");
  });
});

describe("výchozí stavy a mapování starých stavů", () => {
  it("výchozí pipeline má stav pro každou fázi a stav Realizace se jmenuje přesně tak", () => {
    expect(new Set(JOB_STAGES.map((s) => s.phase))).toEqual(new Set(PHASE_KEYS));
    expect(JOB_STAGES.find((s) => s.phase === "execution")?.name).toBe("Realizace");
    expect(JOB_STAGES.find((s) => s.phase === "closed")?.kind).toBe("done");
    expect(JOB_STAGES.find((s) => s.phase === "lost")?.kind).toBe("lost");
    // stavy mimo obchodní fáze se jmenují jako fáze; obchodní (poptávka, nabídka) určuje CRM
    for (const s of JOB_STAGES.filter((s) => s.phase !== "inquiry" && s.phase !== "offer"))
      expect(s.name).toBe(PHASES[s.phase].label);
  });

  it("obchodní stavy CRM: tři v poptávce, tři v nabídce, rostoucí pravděpodobnost a dny hnití", () => {
    expect(CRM_DEAL_STAGES.map((s) => `${s.phase}:${s.name}`)).toEqual([
      "inquiry:Nová poptávka",
      "inquiry:Kontaktováno",
      "inquiry:Obhlídka",
      "offer:Nabídka v přípravě",
      "offer:Nabídka odeslána",
      "offer:Jednání",
    ]);
    expect(CRM_DEAL_STAGES.map((s) => s.probabilityPct)).toEqual([10, 20, 35, 50, 65, 80]);
    expect(CRM_DEAL_STAGES.map((s) => s.rottingDays)).toEqual([3, 5, 7, 5, 10, 7]);
    expect(JOB_STAGES.slice(0, CRM_DEAL_STAGES.length)).toEqual([...CRM_DEAL_STAGES]);
  });

  it("staré stavy se mapují na fáze (shodně s migrací)", () => {
    expect(phaseForLegacyStage("Příprava", "open")).toBe("preparation");
    expect(phaseForLegacyStage("Realizace", "open")).toBe("execution");
    expect(phaseForLegacyStage("Předání", "open")).toBe("handover");
    expect(phaseForLegacyStage("Hotovo", "done")).toBe("closed");
    expect(phaseForLegacyStage("Zrušeno", "lost")).toBe("lost");
    expect(phaseForLegacyStage("Něco vlastního", "done")).toBe("closed");
    expect(phaseForLegacyStage("Čekáme na materiál", "open")).toBeNull();
  });
});

describe("výchozí pohledy", () => {
  it("jsou pojmenované jednou a míří na fáze, které existují", () => {
    const names = JOB_VIEWS.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "Moje zakázky",
        "Nabídky čekající na odpověď",
        "V realizaci",
        "Po termínu",
        "V záruce",
      ]),
    );
    const phaseValues = (node: unknown): string[] => {
      if (!node || typeof node !== "object") return [];
      const n = node as { attr?: string; value?: unknown; conditions?: unknown[] };
      if (n.conditions) return n.conditions.flatMap(phaseValues);
      return n.attr === "phase" ? [n.value].flat().map(String) : [];
    };
    const used = JOB_VIEWS.flatMap((v) => phaseValues(v.config.filters));
    expect(used.length).toBeGreaterThan(5);
    for (const p of used) expect(PHASE_KEYS as readonly string[]).toContain(p);
  });
});
