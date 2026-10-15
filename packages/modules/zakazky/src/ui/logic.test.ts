import { describe, expect, it } from "vitest";
import type { BoardCard, PhasePreview, PhaseView } from "../contract";
import {
  DEFAULT_FILTER,
  addPayment,
  addPhase,
  addTask,
  blankRow,
  cardsOf,
  completeWarnings,
  defaultRetainerForm,
  defaultTitle,
  dropOutcome,
  dueLabel,
  filterCards,
  groupTasksByPhase,
  jobWarning,
  movePhase,
  nextMonth,
  nextPhase,
  payloadDirty,
  payloadIssues,
  paymentsTotal,
  phaseChangeMessage,
  plural,
  prefillRowsOf,
  reasonForStatus,
  removePhase,
  retainerErrors,
  rowErrors,
  rowsFromPrefill,
  sortCards,
  stripBlockedReason,
  stripStages,
  sumPrice,
  templateChoice,
  taskMovePatch,
  toApiRows,
  toRetainerSetup,
  updatePhase,
  updateTask,
  planPhaseChange,
} from "./logic";
import type { BoardCardX, TaskLite } from "./types";

const card = (over: Partial<BoardCardX> = {}): BoardCardX => ({
  id: "j1",
  number: "Z-2026-001",
  title: "Web pro Novákovi",
  companyId: "c1",
  companyName: "Novák s.r.o.",
  type: "web",
  status: "active",
  currentPhaseId: "p1",
  currentPhaseName: "Návrh",
  ownerId: "u1",
  ownerName: "Ondřej Dvořák",
  dueDate: null,
  overdue: false,
  slipping: false,
  priceMinor: null,
  isPrivate: false,
  ...over,
});

const phase = (over: Partial<PhaseView> & { id: string; position: number }): PhaseView => ({
  name: over.id,
  role: null,
  status: "not_started",
  plannedStart: null,
  plannedEnd: null,
  completedAt: null,
  openTasks: null,
  ...over,
});

describe("čeština a text", () => {
  it("plural skloňuje 1, 2–4 a 5+", () => {
    expect(plural(1, "úkol", "úkoly", "úkolů")).toBe("1 úkol");
    expect(plural(3, "úkol", "úkoly", "úkolů")).toBe("3 úkoly");
    expect(plural(5, "úkol", "úkoly", "úkolů")).toBe("5 úkolů");
    expect(plural(0, "úkol", "úkoly", "úkolů")).toBe("0 úkolů");
  });

  it("dueLabel popisuje termín vůči dnešku", () => {
    expect(dueLabel("2026-10-14", "2026-10-14")).toEqual({ text: "dnes", tone: "warning" });
    expect(dueLabel("2026-10-15", "2026-10-14").text).toBe("zítra");
    expect(dueLabel("2026-10-20", "2026-10-14")).toEqual({ text: "za 6 dní", tone: "normal" });
    expect(dueLabel("2026-10-13", "2026-10-14")).toEqual({ text: "včera", tone: "danger" });
    expect(dueLabel("2026-10-10", "2026-10-14")).toEqual({ text: "před 4 dny", tone: "danger" });
    expect(dueLabel(null).tone).toBe("none");
  });

  it("defaultTitle skládá „klient – typ“", () => {
    expect(defaultTitle("Novák s.r.o.", "marketing")).toBe("Novák s.r.o. – Marketing");
    expect(defaultTitle(null, "systemy")).toBe("Systémy");
  });
});

describe("varování po termínu", () => {
  it("po termínu má přednost před skluzem", () => {
    expect(jobWarning({ overdue: true, slipping: true, dueDate: "2026-10-01" })?.kind).toBe(
      "overdue",
    );
    expect(jobWarning({ overdue: false, slipping: true, dueDate: null })).toEqual({
      kind: "slipping",
      label: "Má úkoly po termínu",
    });
    expect(jobWarning({ overdue: false, slipping: false, dueDate: null })).toBeNull();
  });
});

describe("pás fází", () => {
  const phases = [
    phase({ id: "b", position: 1, role: "intro_evaluation" }),
    phase({ id: "a", position: 0 }),
    phase({ id: "c", position: 2, role: "retainer" }),
  ];

  it("fáze jsou podle pozice a role mají barvu", () => {
    const s = stripStages(phases);
    expect(s.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(s[1]!.color).toBe("orange");
    expect(s[2]!.color).toBe("purple");
  });

  it("na Retainer u marketingu před rozhodnutím nejde kliknout", () => {
    expect(
      stripBlockedReason({ type: "marketing", marketingStage: "decision" }, { role: "retainer" }),
    ).toMatch(/Pokračovat na retainer/);
    expect(
      stripBlockedReason({ type: "marketing", marketingStage: "retainer" }, { role: "retainer" }),
    ).toBeNull();
    expect(
      stripBlockedReason({ type: "web", marketingStage: null }, { role: "retainer" }),
    ).toBeNull();
    expect(
      stripBlockedReason({ type: "marketing", marketingStage: "intro" }, { role: null }),
    ).toBeNull();
  });

  it("nextPhase vrací následující fázi", () => {
    expect(nextPhase(phases, "a")?.id).toBe("b");
    expect(nextPhase(phases, "c")).toBeNull();
    expect(nextPhase(phases, null)?.id).toBe("a");
  });

  const preview = (over: Partial<PhasePreview>): PhasePreview => ({
    target: { id: "c", name: "C" },
    completing: [],
    reopening: [],
    totalOpenTasks: 0,
    blockedReason: null,
    ...over,
  });

  it("planPhaseChange: blokace, přímá změna, dotaz na úkoly", () => {
    expect(planPhaseChange(preview({ blockedReason: "Ne." }))).toEqual({
      kind: "blocked",
      reason: "Ne.",
    });
    expect(
      planPhaseChange(preview({ completing: [{ id: "a", name: "A", openTasks: 0 }] })).kind,
    ).toBe("direct");
    expect(
      planPhaseChange(preview({ completing: [{ id: "a", name: "A", openTasks: null }] })).kind,
    ).toBe("direct");
    const ask = planPhaseChange(
      preview({
        completing: [
          { id: "a", name: "A", openTasks: 2 },
          { id: "b", name: "B", openTasks: 0 },
          { id: "c", name: "C", openTasks: 3 },
        ],
      }),
    );
    expect(ask).toEqual({
      kind: "ask",
      phases: [
        { id: "a", name: "A", openTasks: 2 },
        { id: "c", name: "C", openTasks: 3 },
      ],
      totalOpenTasks: 5,
    });
  });

  it("phaseChangeMessage zmíní dokončené fáze a úkoly", () => {
    expect(phaseChangeMessage("Vývoj", { completedPhaseIds: [], completedTasks: 0 })).toBe(
      "Zakázka je ve fázi „Vývoj“.",
    );
    expect(phaseChangeMessage("Vývoj", { completedPhaseIds: ["a", "b"], completedTasks: 1 })).toBe(
      "Zakázka je ve fázi „Vývoj“. Dokončeno: 2 fáze. Dokončeno: 1 úkol.",
    );
  });
});

describe("dokončení zakázky", () => {
  it("upozorní na úkoly a platby, ale nic nezakazuje", () => {
    expect(completeWarnings({ openTasks: 0, unpaidPayments: 0 })).toEqual([]);
    expect(completeWarnings({ openTasks: 1, unpaidPayments: 2 })).toEqual([
      "Zakázka má ještě 1 otevřený úkol.",
      "Zakázka má 2 neuhrazené platby.",
    ]);
  });

  it("důvod dokončení: zrušená, retainer ukončen, dokončena", () => {
    expect(reasonForStatus("cancelled", { type: "web", marketingStage: null })).toBe("cancelled");
    expect(reasonForStatus("done", { type: "marketing", marketingStage: "retainer" })).toBe(
      "retainer_ended",
    );
    expect(reasonForStatus("done", { type: "marketing", marketingStage: "decision" })).toBe(
      "finished",
    );
    expect(reasonForStatus("done", { type: "web", marketingStage: null })).toBe("finished");
  });
});

describe("board a seznam", () => {
  it("cardsOf zploští sloupce bez duplicit", () => {
    const result = {
      by: "status" as const,
      type: null,
      columns: [
        { key: "a", label: "A", cards: [card({ id: "1" }), card({ id: "2" })] as BoardCard[] },
        { key: "b", label: "B", cards: [card({ id: "2" })] as BoardCard[] },
      ],
    };
    expect(cardsOf(result).map((c) => c.id)).toEqual(["1", "2"]);
    expect(cardsOf(undefined)).toEqual([]);
  });

  it("dropOutcome: stav, fáze a no-op", () => {
    expect(dropOutcome("status", { status: "paused" }, card({ status: "active" }))).toEqual({
      kind: "status",
      status: "paused",
    });
    expect(dropOutcome("status", { status: "active" }, card({ status: "active" })).kind).toBe(
      "noop",
    );
    expect(
      dropOutcome("phase", { phaseName: "Vývoj" }, card({ currentPhaseName: "Návrh" })),
    ).toEqual({
      kind: "phase",
      phaseName: "Vývoj",
    });
    expect(
      dropOutcome("phase", { phaseName: "Návrh" }, card({ currentPhaseName: "Návrh" })).kind,
    ).toBe("noop");
    expect(dropOutcome("phase", {}, card()).kind).toBe("noop");
  });

  const cards = [
    card({
      id: "1",
      number: "Z-2026-001",
      title: "Žlutý web",
      companyName: "Čapek a syn",
      status: "active",
      dueDate: "2026-12-01",
      priceMinor: 5_000_000,
    }),
    card({
      id: "2",
      number: "Z-2026-002",
      title: "Kampaň",
      type: "marketing",
      companyName: "Beta",
      status: "done",
      dueDate: null,
      priceMinor: null,
      ownerId: "u2",
      ownerName: "Patrik Šilhánek",
    }),
    card({
      id: "3",
      number: "Z-2026-003",
      title: "CRM",
      type: "systemy",
      companyName: "Alfa",
      status: "paused",
      overdue: true,
      dueDate: "2026-09-01",
      priceMinor: 1_000_000,
      members: [{ userId: "u3", name: "Eva Nová" }],
    }),
  ];

  it("filtr: živé vs. uzavřené, typ, moje, po termínu", () => {
    expect(filterCards(cards, DEFAULT_FILTER).map((c) => c.id)).toEqual(["1", "3"]);
    expect(filterCards(cards, { ...DEFAULT_FILTER, scope: "closed" }).map((c) => c.id)).toEqual([
      "2",
    ]);
    expect(
      filterCards(cards, { ...DEFAULT_FILTER, scope: "all", type: "marketing" }).map((c) => c.id),
    ).toEqual(["2"]);
    expect(
      filterCards(cards, { ...DEFAULT_FILTER, scope: "all", mineUserId: "u2" }).map((c) => c.id),
    ).toEqual(["2"]);
    expect(
      filterCards(cards, { ...DEFAULT_FILTER, scope: "all", mineUserId: "u3" }).map((c) => c.id),
    ).toEqual(["3"]);
    expect(filterCards(cards, { ...DEFAULT_FILTER, onlyWarning: true }).map((c) => c.id)).toEqual([
      "3",
    ]);
  });

  it("hledání je bez diakritiky a hledá ve více polích", () => {
    expect(
      filterCards(cards, { ...DEFAULT_FILTER, scope: "all", q: "zluty" }).map((c) => c.id),
    ).toEqual(["1"]);
    expect(
      filterCards(cards, { ...DEFAULT_FILTER, scope: "all", q: "capek" }).map((c) => c.id),
    ).toEqual(["1"]);
    expect(
      filterCards(cards, { ...DEFAULT_FILTER, scope: "all", q: "z-2026-003" }).map((c) => c.id),
    ).toEqual(["3"]);
    expect(
      filterCards(cards, { ...DEFAULT_FILTER, scope: "all", q: "eva nova" }).map((c) => c.id),
    ).toEqual(["3"]);
    expect(filterCards(cards, { ...DEFAULT_FILTER, scope: "all", q: "nic takového" })).toEqual([]);
  });

  it("řazení: prázdné hodnoty vždy na konec, obě směry", () => {
    expect(sortCards(cards, "due", "asc").map((c) => c.id)).toEqual(["3", "1", "2"]);
    expect(sortCards(cards, "due", "desc").map((c) => c.id)).toEqual(["1", "3", "2"]);
    expect(sortCards(cards, "price", "desc").map((c) => c.id)).toEqual(["1", "3", "2"]);
    expect(sortCards(cards, "company", "asc").map((c) => c.id)).toEqual(["3", "2", "1"]);
    expect(sortCards(cards, "number", "desc").map((c) => c.id)).toEqual(["3", "2", "1"]);
  });

  it("sumPrice sečte jen ceny, bez cen vrací null", () => {
    expect(sumPrice(cards)).toBe(6_000_000);
    expect(sumPrice([card({ priceMinor: null })])).toBeNull();
  });
});

describe("úkoly po fázích", () => {
  const phases = [phase({ id: "p2", position: 1 }), phase({ id: "p1", position: 0 })];
  const task = (over: Partial<TaskLite> & { id: string }): TaskLite => ({
    title: over.id,
    status: "todo",
    priority: "medium",
    assigneeId: null,
    assigneeName: null,
    dueDate: null,
    estimateMin: null,
    jobPhaseId: null,
    ...over,
  });

  it("skupiny jsou podle fází a na konci „Bez fáze“; úkol s neznámou fází patří do „Bez fáze“", () => {
    const groups = groupTasksByPhase(
      [
        task({ id: "a", jobPhaseId: "p1", dueDate: "2026-11-02" }),
        task({ id: "b", jobPhaseId: "p1", dueDate: "2026-11-01" }),
        task({ id: "c", jobPhaseId: "p1", status: "done" }),
        task({ id: "d", jobPhaseId: "p2" }),
        task({ id: "e", jobPhaseId: null }),
        task({ id: "f", jobPhaseId: "smazana" }),
      ],
      phases,
    );
    expect(groups.map((g) => g.key)).toEqual(["p1", "p2", "none"]);
    expect(groups[0]!.open.map((t) => t.id)).toEqual(["b", "a"]);
    expect(groups[0]!.closed.map((t) => t.id)).toEqual(["c"]);
    expect(groups[2]!.name).toBe("Bez fáze");
    expect(groups[2]!.open.map((t) => t.id).sort()).toEqual(["e", "f"]);
    expect(groups[2]!.phaseId).toBeNull();
  });

  it("přetažení do téže skupiny nic nedělá", () => {
    expect(taskMovePatch({ id: "a", jobPhaseId: "p1" }, "p1")).toBeNull();
    expect(taskMovePatch({ id: "a", jobPhaseId: "p1" }, "p2")).toEqual({
      id: "a",
      jobPhaseId: "p2",
    });
    expect(taskMovePatch({ id: "a", jobPhaseId: null }, null)).toBeNull();
    expect(taskMovePatch({ id: "a", jobPhaseId: "p1" }, null)).toEqual({
      id: "a",
      jobPhaseId: null,
    });
  });
});

describe("retainer", () => {
  it("nextMonth přeskočí přes konec roku", () => {
    expect(nextMonth(new Date("2026-11-15T10:00:00Z"))).toBe("2026-12");
    expect(nextMonth(new Date("2026-12-15T10:00:00Z"))).toBe("2027-01");
  });

  it("validuje částku, měsíc, den a fakturujícího", () => {
    const f = defaultRetainerForm("u1", new Date("2026-11-15T10:00:00Z"));
    expect(Object.keys(retainerErrors(f))).toEqual(["amount"]);
    expect(retainerErrors({ ...f, amountMinor: 1_500_000, issueDay: 29 }).issueDay).toBeTruthy();
    expect(retainerErrors({ ...f, amountMinor: 1_500_000, issuerId: null }).issuer).toBeTruthy();
    expect(
      retainerErrors({ ...f, amountMinor: 1_500_000, fromMonth: "2026-13" }).fromMonth,
    ).toBeTruthy();
    expect(retainerErrors({ ...f, amountMinor: 1_500_000 })).toEqual({});
  });

  it("toRetainerSetup: pevně jeden fakturující, nebo střídavě s prvním", () => {
    const f = {
      ...defaultRetainerForm("u1", new Date("2026-11-15T10:00:00Z")),
      amountMinor: 1_500_000,
    };
    expect(toRetainerSetup({ ...f, amountMinor: null })).toBeNull();
    expect(toRetainerSetup(f)).toEqual({
      amountMinor: 1_500_000,
      fromMonth: "2026-12",
      issueDay: 1,
      issuerMode: "fixed",
      issuerId: "u1",
      split: [],
    });
    expect(toRetainerSetup({ ...f, issuerMode: "alternate" })).toMatchObject({
      issuerMode: "alternate",
      firstIssuerId: "u1",
    });
  });
});

describe("dialog „Založit zakázky z obchodu“", () => {
  const now = new Date("2026-11-15T10:00:00Z");

  it("bez odpovědi serveru vznikne řádek za každou službu s výchozími hodnotami", () => {
    const rows = rowsFromPrefill(undefined, {
      services: ["web", "marketing"],
      clientName: "Novák",
      ownerId: "u1",
      now,
    });
    expect(rows.map((r) => [r.type, r.title, r.startDate, r.ownerId, r.billingModel])).toEqual([
      ["web", "Novák – Web", "2026-11-15", "u1", undefined],
      ["marketing", "Novák – Marketing", "2026-11-15", "u1", "intro_then_retainer"],
    ]);
  });

  it("odpověď serveru jde jako pole i jako { rows }", () => {
    const p = {
      type: "web" as const,
      templateId: "t1",
      templateName: "Web",
      title: "Web X",
      startDate: "2026-11-20",
      ownerId: "u2",
      memberIds: ["u3"],
      billingModel: "one_off" as const,
      priceMinor: 5_000_000,
    };
    expect(prefillRowsOf([p])).toHaveLength(1);
    expect(prefillRowsOf({ rows: [p] })).toHaveLength(1);
    expect(prefillRowsOf(null)).toEqual([]);
    const rows = rowsFromPrefill({ rows: [p] }, { services: ["web"], now });
    expect(rows[0]).toMatchObject({
      templateId: "t1",
      title: "Web X",
      ownerId: "u2",
      memberIds: ["u3"],
    });
  });

  it("chyby řádku a převod na vstup API", () => {
    const row = blankRow("marketing", { clientName: "Novák", ownerId: "u1", now });
    expect(rowErrors(row)).toEqual([]);
    expect(rowErrors({ ...row, title: " ", ownerId: null })).toHaveLength(2);

    const direct = { ...row, billingModel: "retainer" as const };
    expect(rowErrors(direct)).toContain("Zadejte měsíční částku.");
    const ok = {
      ...direct,
      retainer: { ...direct.retainer, amountMinor: 1_500_000 },
      memberIds: ["u1", "u3"],
    };
    expect(rowErrors(ok)).toEqual([]);
    const [api] = toApiRows([ok]);
    expect(api).toMatchObject({
      type: "marketing",
      templateId: null,
      title: "Novák – Marketing",
      ownerId: "u1",
      memberIds: ["u3"],
      billingModel: "retainer",
      retainer: { amountMinor: 1_500_000, fromMonth: "2026-12" },
    });

    const [intro] = toApiRows([row]);
    expect(intro).not.toHaveProperty("retainer");
    expect(intro).toMatchObject({ billingModel: "intro_then_retainer" });
  });
});

describe("výběr šablony", () => {
  it("výchozí, prázdná a konkrétní", () => {
    expect(templateChoice("__default")).toEqual({});
    expect(templateChoice("__none")).toEqual({ withoutTemplate: true });
    expect(templateChoice("abc")).toEqual({ templateId: "abc" });
  });
});

describe("editor šablony", () => {
  const base = () => {
    let p = addPhase(
      addPhase(
        addPhase({ v: 1 as const, phases: [], tasks: [], payments: [] }, "Podklady"),
        "Návrh",
      ),
      "Vývoj",
    );
    p = addTask(p, 0, "Sehnat texty");
    p = addTask(p, 1, "Návrh homepage");
    p = addTask(p, 2, "Naprogramovat");
    return p;
  };

  it("nová fáze začíná po konci předchozí", () => {
    const p = base();
    expect(p.phases.map((f) => f.offsetDays)).toEqual([0, 7, 14]);
  });

  it("odebrání fáze přesune její úkoly do předchozí a přečísluje následující", () => {
    const p = removePhase(base(), 1);
    expect(p.phases.map((f) => f.name)).toEqual(["Podklady", "Vývoj"]);
    expect(p.tasks.map((t) => [t.title, t.phaseIndex])).toEqual([
      ["Sehnat texty", 0],
      ["Návrh homepage", 0],
      ["Naprogramovat", 1],
    ]);
    const first = removePhase(base(), 0);
    expect(first.tasks.map((t) => t.phaseIndex)).toEqual([0, 0, 1]);
    expect(removePhase(base(), 9)).toEqual(base());
  });

  it("posun fáze nese její úkoly s sebou", () => {
    const p = movePhase(base(), 0, 1);
    expect(p.phases.map((f) => f.name)).toEqual(["Návrh", "Podklady", "Vývoj"]);
    expect(p.tasks.find((t) => t.title === "Sehnat texty")!.phaseIndex).toBe(1);
    expect(p.tasks.find((t) => t.title === "Návrh homepage")!.phaseIndex).toBe(0);
    expect(movePhase(base(), 0, -1)).toEqual(base());
    expect(movePhase(base(), 2, 1)).toEqual(base());
  });

  it("kontrola obsahu: názvy, duplicitní role, řešitel, platby", () => {
    expect(payloadIssues(base())).toEqual([]);
    let p = updatePhase(base(), 0, { role: "retainer" });
    p = updatePhase(p, 1, { role: "retainer" });
    expect(payloadIssues(p)).toContain("Každou zvláštní roli smí mít nejvýš jedna fáze.");
    p = updateTask(base(), 0, { title: " " });
    expect(payloadIssues(p)).toContain("Každý úkol potřebuje název.");
    p = updateTask(base(), 0, { assignee: { rule: "user" } });
    expect(payloadIssues(p).join(" ")).toMatch(/Konkrétní uživatel/);
    p = addPayment(base());
    expect(payloadIssues(p)).toEqual([
      "Každá platba potřebuje popis.",
      "Částka každé platby musí být kladná.",
    ]);
    expect(
      paymentsTotal({
        ...p,
        payments: [
          { ...p.payments[0]!, amountMinor: 700_000 },
          { ...p.payments[0]!, amountMinor: 700_000 },
        ],
      }),
    ).toBe(1_400_000);
  });

  it("payloadDirty pozná změnu", () => {
    expect(payloadDirty(base(), base())).toBe(false);
    expect(payloadDirty(base(), addPayment(base()))).toBe(true);
  });
});
