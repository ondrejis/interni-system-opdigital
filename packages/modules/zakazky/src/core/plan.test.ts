import { describe, expect, it } from "vitest";
import { templatePayload } from "../contract";
import { DEFAULT_TEMPLATES } from "../templates/defaults";
import {
  defaultJobTitle,
  initialMarketingStage,
  initialStatus,
  phaseSkipped,
  planFromTemplate,
  type PlanOptions,
} from "./plan";

const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const LEAD = "00000000-0000-4000-8000-000000000003";

const tpl = (name: string) =>
  templatePayload.parse(DEFAULT_TEMPLATES.find((t) => t.name === name)!.payload);

const base: PlanOptions = {
  startDate: "2026-10-01",
  ownerId: OWNER,
  leadId: null,
  otherPartnerId: OTHER,
  billingModel: "one_off",
  active: true,
};

describe("plán zakázky ze šablony: fáze a termíny", () => {
  it("šablona Web dá šest fází v pořadí s daty od startu a první je rozpracovaná", () => {
    const plan = planFromTemplate(tpl("Web"), base);
    expect(plan.phases.map((p) => p.name)).toEqual([
      "Podklady",
      "Návrh",
      "Vývoj",
      "Revize klienta",
      "Spuštění",
      "Předání",
    ]);
    expect(plan.phases[0]).toMatchObject({
      status: "in_progress",
      plannedStart: "2026-10-01",
      plannedEnd: "2026-10-07",
    });
    expect(plan.phases[1]).toMatchObject({ status: "not_started", plannedStart: "2026-10-08" });
    // termín zakázky = konec poslední fáze (Předání: den 48, 4 dny)
    expect(plan.phases.at(-1)!.plannedEnd).toBe("2026-11-21");
    expect(plan.dueDate).toBe("2026-11-21");
    expect(plan.currentPhaseIndex).toBe(0);
  });

  it("plánovaná zakázka (start v budoucnu) nemá rozpracovanou fázi", () => {
    const plan = planFromTemplate(tpl("Web"), { ...base, active: false });
    expect(plan.phases.every((p) => p.status === "not_started")).toBe(true);
    expect(plan.currentPhaseIndex).toBe(0);
  });

  it("šablona bez fází: žádné fáze, žádná aktuální fáze a žádný termín", () => {
    const plan = planFromTemplate(templatePayload.parse({}), base);
    expect(plan).toMatchObject({
      phases: [],
      tasks: [],
      payments: [],
      currentPhaseIndex: null,
      dueDate: null,
    });
  });
});

describe("plán zakázky ze šablony: úkoly", () => {
  it("termín úkolu je start + počet dní, řešitel podle pravidla", () => {
    const payload = templatePayload.parse({
      phases: [{ name: "A" }, { name: "B" }],
      tasks: [
        { title: "t1", phaseIndex: 0, dueOffsetDays: 7, assignee: { rule: "owner" } },
        { title: "t2", phaseIndex: 1, dueOffsetDays: 0, assignee: { rule: "lead" } },
        { title: "t3", phaseIndex: 1, dueOffsetDays: null, assignee: { rule: "none" } },
        { title: "t4", phaseIndex: 1, assignee: { rule: "user", userId: OTHER } },
      ],
    });
    const plan = planFromTemplate(payload, {
      ...base,
      leadId: LEAD,
      knownUserIds: new Set([OTHER]),
    });
    expect(plan.tasks.map((t) => [t.title, t.dueDate, t.assigneeId])).toEqual([
      ["t1", "2026-10-08", OWNER],
      ["t2", "2026-10-01", LEAD],
      ["t3", null, null],
      ["t4", null, OTHER],
    ]);
  });

  it("vedoucí chybí: úkol s pravidlem „vedoucí“ dostane vlastník; neznámý uživatel také vlastník", () => {
    const payload = templatePayload.parse({
      phases: [{ name: "A" }],
      tasks: [
        { title: "t1", assignee: { rule: "lead" } },
        { title: "t2", assignee: { rule: "user", userId: LEAD } },
      ],
    });
    const plan = planFromTemplate(payload, { ...base, knownUserIds: new Set([OTHER]) });
    expect(plan.tasks.map((t) => t.assigneeId)).toEqual([OWNER, OWNER]);
  });

  it("úkoly přeskočené fáze se nezakládají", () => {
    const plan = planFromTemplate(tpl("Marketing – úvodní fáze"), {
      ...base,
      billingModel: "retainer",
    });
    const evaluation = plan.phases.find((p) => p.role === "intro_evaluation")!;
    expect(evaluation.status).toBe("skipped");
    expect(plan.tasks.some((t) => t.phaseIndex === evaluation.index)).toBe(false);
    expect(plan.tasks.length).toBe(
      tpl("Marketing – úvodní fáze").tasks.filter((t) => t.phaseIndex !== evaluation.index).length,
    );
  });
});

describe("plán zakázky ze šablony: platby", () => {
  const intro = tpl("Marketing – úvodní fáze");

  it("úvodní fáze: dvě platby po 7 000 Kč, první fakturuje vlastník, druhou druhý partner", () => {
    const plan = planFromTemplate(intro, { ...base, billingModel: "intro_then_retainer" });
    expect(plan.payments).toEqual([
      {
        description: "Úvodní fáze – 1. platba",
        kind: "intro",
        amountMinor: 700_000,
        issuerId: OWNER,
        dueOn: "2026-10-15",
      },
      {
        description: "Úvodní fáze – 2. platba",
        kind: "intro",
        amountMinor: 700_000,
        issuerId: OTHER,
        dueOn: "2026-11-15",
      },
    ]);
    // pořadí fází: vyhodnocení před retainerem, obě zůstanou v plánu
    expect(plan.phases.map((p) => p.role)).toEqual([
      null,
      null,
      null,
      null,
      "intro_evaluation",
      "retainer",
    ]);
    expect(plan.phases.find((p) => p.role === "intro_evaluation")!.status).toBe("not_started");
  });

  it("bez druhého partnera fakturuje obě platby vlastník", () => {
    const plan = planFromTemplate(intro, {
      ...base,
      billingModel: "intro_then_retainer",
      otherPartnerId: null,
    });
    expect(plan.payments.map((p) => p.issuerId)).toEqual([OWNER, OWNER]);
  });

  it("rovnou retainer: úvodní platby ani vyhodnocení nevznikají", () => {
    const plan = planFromTemplate(intro, { ...base, billingModel: "retainer" });
    expect(plan.payments).toEqual([]);
    expect(plan.phases.find((p) => p.role === "intro_evaluation")!.status).toBe("skipped");
    // aktuální je první nepřeskočená fáze
    expect(plan.currentPhaseIndex).toBe(0);
    expect(plan.dueDate).toBe(plan.phases.find((p) => p.role === "retainer")!.plannedEnd);
  });

  it("platba jiného druhu než intro vznikne při každém modelu", () => {
    const payload = templatePayload.parse({
      phases: [{ name: "A" }],
      payments: [{ description: "Záloha", kind: "one_off", amountMinor: 500_00, dueOffsetDays: 3 }],
    });
    for (const billingModel of ["one_off", "retainer", "intro_then_retainer", "hourly"] as const)
      expect(planFromTemplate(payload, { ...base, billingModel }).payments).toHaveLength(1);
  });
});

describe("výchozí šablony", () => {
  it("všechny projdou kontrolou obsahu a nemají dvě fáze se stejnou rolí", () => {
    for (const t of DEFAULT_TEMPLATES)
      expect(() => templatePayload.parse(t.payload), t.name).not.toThrow();
  });

  it("pro každý typ je právě jedna výchozí", () => {
    for (const type of ["web", "marketing", "systemy"] as const)
      expect(DEFAULT_TEMPLATES.filter((t) => t.type === type && t.isDefault)).toHaveLength(1);
  });

  it("úvodní fáze marketingu: 2 × 7 000 Kč a role vyhodnocení a retaineru", () => {
    const t = tpl("Marketing – úvodní fáze");
    expect(t.payments.map((p) => p.amountMinor)).toEqual([700_000, 700_000]);
    expect(t.payments.map((p) => p.issuer.rule)).toEqual(["owner", "other"]);
    expect(t.phases.map((p) => p.name)).toEqual([
      "Onboarding (přístupy, Business Manager, pixel)",
      "Tvorba kreativ a videí",
      "Spuštění kampaní",
      "Optimalizace",
      "Vyhodnocení úvodní fáze",
      "Retainer",
    ]);
    expect(t.phases.map((p) => p.role)).toEqual([
      null,
      null,
      null,
      null,
      "intro_evaluation",
      "retainer",
    ]);
  });
});

describe("pravidla okolo plánu", () => {
  it("fáze vyhodnocení se přeskakuje mimo model „úvodní fáze, pak retainer“", () => {
    expect(phaseSkipped("intro_evaluation", "intro_then_retainer")).toBe(false);
    expect(phaseSkipped("intro_evaluation", "retainer")).toBe(true);
    expect(phaseSkipped("intro_evaluation", "one_off")).toBe(true);
    expect(phaseSkipped("retainer", "retainer")).toBe(false);
    expect(phaseSkipped(null, "retainer")).toBe(false);
  });

  it("stav marketingu nové zakázky podle typu a modelu", () => {
    expect(initialMarketingStage("marketing", "intro_then_retainer")).toBe("intro");
    expect(initialMarketingStage("marketing", "retainer")).toBe("retainer");
    expect(initialMarketingStage("marketing", "one_off")).toBeNull();
    expect(initialMarketingStage("web", "intro_then_retainer")).toBeNull();
  });

  it("start v budoucnu = plánovaná, jinak aktivní", () => {
    expect(initialStatus("2026-10-15", "2026-10-14")).toBe("planned");
    expect(initialStatus("2026-10-14", "2026-10-14")).toBe("active");
    expect(initialStatus("2026-10-01", "2026-10-14")).toBe("active");
  });

  it("výchozí název zakázky", () => {
    expect(defaultJobTitle("Novák s.r.o.", "Web")).toBe("Novák s.r.o. – Web");
  });
});
