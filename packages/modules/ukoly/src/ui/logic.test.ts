import { describe, expect, it } from "vitest";
import type { TaskDto } from "../contract";
import { parseQuickTask } from "../tasks/logic/quick-parse";
import {
  BOARD_COLUMNS,
  DEFAULT_STATE,
  boardColumns,
  datePresets,
  defaultGroupFor,
  effectiveQuick,
  estimateLabel,
  fromSavedConfig,
  groupTasks,
  listInput,
  parseEstimate,
  quickOverridePayload,
  slugKey,
  splitMentions,
  swipeOffset,
  swipeOutcome,
  toSavedConfig,
  type ListState,
} from "./logic";

// čtvrtek 15. 10. 2026, 10:00 pražského času (letní čas = UTC+2 do 25. 10.)
const NOW = new Date("2026-10-15T08:00:00Z");

let seq = 0;
function task(p: Partial<TaskDto> = {}): TaskDto {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Úkol ${seq}`,
    description: null,
    typeKey: "task",
    typeName: "Úkol",
    typeIcon: "check-square",
    typeColor: "gray",
    isCalendarEvent: false,
    status: "todo",
    priority: "none",
    assigneeId: "me",
    assigneeName: "Já",
    createdById: "me",
    createdByName: "Já",
    dueDate: null,
    dueTime: null,
    durationMin: null,
    allDay: false,
    place: null,
    estimateMin: null,
    outcome: null,
    completedAt: null,
    parentId: null,
    parentTitle: null,
    subtasks: { total: 0, done: 0 },
    deal: null,
    company: null,
    person: null,
    job: null,
    jobNumber: null,
    jobPhaseId: null,
    jobPhaseName: null,
    tags: [],
    sendInvites: false,
    state: "nodate",
    isPrivate: false,
    delegated: false,
    createdAt: "2026-10-01T08:00:00Z",
    updatedAt: "2026-10-01T08:00:00Z",
    ...p,
  };
}

describe("groupTasks: podle data", () => {
  it("řadí Po termínu, Dnes, Zítra, dny týdne, Později a Bez termínu", () => {
    const rows = [
      task({ title: "bez", dueDate: null }),
      task({ title: "později", dueDate: "2026-11-30" }),
      task({ title: "pátek", dueDate: "2026-10-16" }),
      task({ title: "sobota", dueDate: "2026-10-17" }),
      task({ title: "zítra", dueDate: "2026-10-16" }),
      task({ title: "dnes", dueDate: "2026-10-15" }),
      task({ title: "včera", dueDate: "2026-10-14" }),
    ];
    const g = groupTasks(rows, "date", NOW);
    expect(g.map((x) => x.title)).toEqual([
      "Po termínu",
      "Dnes",
      "Zítra",
      "So 17. 10.",
      "Později",
      "Bez termínu",
    ]);
    expect(g[0]!.tone).toBe("danger");
    expect(g[2]!.rows.map((r) => r.title)).toEqual(["pátek", "zítra"]);
  });

  it("hotové úkoly seskupí podle dne dokončení, nejnovější první", () => {
    const g = groupTasks(
      [
        task({ status: "done", completedAt: "2026-10-13T10:00:00Z" }),
        task({ status: "done", completedAt: "2026-10-15T07:00:00Z" }),
        task({ status: "done", completedAt: "2026-10-14T07:00:00Z" }),
      ],
      "date",
      NOW,
    );
    expect(g.map((x) => x.title)).toEqual([
      "Dokončeno dnes",
      "Dokončeno včera",
      "Dokončeno Út 13. 10.",
    ]);
  });

  it("bez seskupení je jedna skupina bez záhlaví; prázdný seznam nemá skupiny", () => {
    expect(groupTasks([task(), task()], "none", NOW)).toHaveLength(1);
    expect(groupTasks([task()], "none", NOW)[0]!.title).toBe("");
    expect(groupTasks([], "none", NOW)).toEqual([]);
    expect(groupTasks([], "date", NOW)).toEqual([]);
  });
});

describe("groupTasks: zakázka, klient, priorita", () => {
  const job = (id: string, title: string) => ({ id, title });

  it("úkol v zakázce bez fáze je ve skupině „Bez fáze“, úkoly bez zakázky jsou nakonec (UKO-08)", () => {
    const g = groupTasks(
      [
        task({ title: "a" }),
        task({
          title: "b",
          job: job("j1", "Web Novák"),
          jobNumber: "Z-2026-001",
          jobPhaseName: null,
        }),
        task({
          title: "c",
          job: job("j1", "Web Novák"),
          jobNumber: "Z-2026-001",
          jobPhaseName: "Návrh",
        }),
        task({
          title: "d",
          job: job("j0", "Audit"),
          jobNumber: "Z-2026-000",
          jobPhaseName: "Analýza",
        }),
      ],
      "job",
      NOW,
    );
    expect(g.map((x) => [x.title, x.subtitle])).toEqual([
      ["Z-2026-000 Audit", "Analýza"],
      ["Z-2026-001 Web Novák", "Návrh"],
      ["Z-2026-001 Web Novák", "Bez fáze"],
      ["Bez zakázky", undefined],
    ]);
  });

  it("klienti podle názvu, bez klienta a soukromý nakonec / s popiskem", () => {
    const g = groupTasks(
      [
        task({ company: { id: "c2", title: "Žabka s.r.o." } }),
        task({}),
        task({ company: { id: "c1", title: "Alfa a.s." } }),
        task({ company: { id: "c3", title: null } }),
      ],
      "company",
      NOW,
    );
    expect(g.map((x) => x.title)).toEqual([
      "Alfa a.s.",
      "Soukromý záznam",
      "Žabka s.r.o.",
      "Bez klienta",
    ]);
  });

  it("priority od urgentní po žádnou", () => {
    const g = groupTasks(
      [task({ priority: "none" }), task({ priority: "urgent" }), task({ priority: "medium" })],
      "priority",
      NOW,
    );
    expect(g.map((x) => x.key)).toEqual(["urgent", "medium", "none"]);
  });
});

describe("board podle stavu", () => {
  it("rozdělí do čtyř sloupců", () => {
    const c = boardColumns([
      task({ status: "todo" }),
      task({ status: "in_progress" }),
      task({ status: "done" }),
      task({ status: "todo" }),
    ]);
    expect(BOARD_COLUMNS).toEqual(["todo", "in_progress", "done", "canceled"]);
    expect(c.todo).toHaveLength(2);
    expect(c.canceled).toHaveLength(0);
  });
});

describe("datePresets", () => {
  it("dnes, zítra, příští pondělí a za týden (ve čtvrtek 15. 10. 2026)", () => {
    expect(datePresets(NOW).map((p) => [p.key, p.date])).toEqual([
      ["today", "2026-10-15"],
      ["tomorrow", "2026-10-16"],
      ["monday", "2026-10-19"],
      ["week", "2026-10-22"],
    ]);
  });
});

describe("listInput a uložené pohledy", () => {
  const state = (p: Partial<ListState> = {}): ListState => ({ ...DEFAULT_STATE, ...p });

  it("Delegované nemá scope, ostatní ano; prázdné filtry se vynechají", () => {
    expect(listInput(state())).toEqual({ view: "today", scope: "mine", limit: 500 });
    expect(listInput(state({ view: "delegated" }))).toEqual({ view: "delegated", limit: 500 });
    expect(
      listInput(state({ typeKey: "call", priority: ["high", "urgent"], q: " Novák " })),
    ).toEqual({
      view: "today",
      scope: "mine",
      typeKey: "call",
      priority: ["high", "urgent"],
      q: "Novák",
      limit: 500,
    });
  });

  it("výchozí seskupení: Bez termínu bez skupin, jinak podle data", () => {
    expect(defaultGroupFor("nodate")).toBe("none");
    expect(defaultGroupFor("today")).toBe("date");
  });

  it("stav → konfigurace → stav je beze ztráty pro všechny pohledy", () => {
    for (const view of ["today", "next7", "nodate", "delegated", "done", "all"] as const) {
      for (const group of ["date", "job", "company", "priority", "none"] as const) {
        const s = state({
          view,
          group,
          layout: view === "done" ? "board" : "list",
          scope: view === "all" ? "all" : "mine",
          typeKey: "meeting",
          priority: ["urgent"],
          q: "web",
        });
        expect(fromSavedConfig(toSavedConfig(s))).toEqual(s);
      }
    }
  });

  it("konfigurace používá jen skutečné atributy entity task a relativní operátory", () => {
    const cfg = toSavedConfig(state({ group: "job", layout: "board" }));
    expect(cfg.viewType).toBe("kanban");
    expect(cfg.group).toBe("job");
    const json = JSON.stringify(cfg.filters);
    expect(json).toContain("older_than_days");
    expect(json).not.toMatch(/2026-/);
    for (const attr of JSON.stringify(cfg.filters).matchAll(/"attr":"(\w+)"/g))
      expect(["status", "dueDate", "assignee", "type", "priority", "title"]).toContain(attr[1]);
  });

  it("neznámý pohled jádra se čte jako „Vše“ s výchozím seskupením", () => {
    expect(fromSavedConfig({ viewType: "table" })).toMatchObject({
      view: "all",
      scope: "all",
      layout: "list",
      group: "none",
    });
  });
});

describe("rychlé přidání: opravy náhledu", () => {
  const parse = parseQuickTask("zavolat Novákovi zítra 10:00", NOW);

  it("beze změn platí to, co parser rozpoznal", () => {
    expect(parse).toMatchObject({
      typeKey: "call",
      dueDate: "2026-10-16",
      dueTime: "10:00",
      title: "Zavolat Novákovi",
    });
    expect(effectiveQuick(parse, {})).toMatchObject({
      typeKey: "call",
      dueDate: "2026-10-16",
      dueTime: "10:00",
    });
    expect(quickOverridePayload(parse, {})).toEqual({});
  });

  it("oprava data a typu se do výstupu dostane, shoda s rozpoznaným ne", () => {
    const o = { typeKey: "meeting", dueDate: "2026-10-20", priority: parse.priority };
    expect(effectiveQuick(parse, o)).toMatchObject({ typeKey: "meeting", dueDate: "2026-10-20" });
    expect(quickOverridePayload(parse, o)).toEqual({ typeKey: "meeting", dueDate: "2026-10-20" });
  });

  it("zrušené datum zruší i čas a délku", () => {
    const p = parseQuickTask("schůzka s Novákem zítra 14:00 na hodinu", NOW);
    expect(p.durationMin).toBe(60);
    const e = effectiveQuick(p, { dueDate: null });
    expect(e).toMatchObject({ dueDate: null, dueTime: null, durationMin: null });
  });
});

describe("swipe", () => {
  it("krátký posun nic, střední odkryje lištu, dlouhý označí hotovo", () => {
    expect(swipeOutcome(-20)).toBe("none");
    expect(swipeOutcome(30)).toBe("none");
    expect(swipeOutcome(-80)).toBe("open");
    expect(swipeOutcome(-260)).toBe("done");
  });

  it("posun obsahu: doprava nic, po lištu 1:1, dál s odporem", () => {
    expect(swipeOffset(40)).toBe(0);
    expect(swipeOffset(-100)).toBe(-100);
    expect(swipeOffset(-260)).toBeLessThan(-160);
    expect(swipeOffset(-260)).toBeGreaterThan(-260);
  });
});

describe("splitMentions", () => {
  it("zvýrazní @jméno, nic víc", () => {
    expect(splitMentions("Díky @Patrik, mrkni na to")).toEqual([
      { text: "Díky ", mention: false },
      { text: "@Patrik", mention: true },
      { text: ", mrkni na to", mention: false },
    ]);
    expect(splitMentions("pište na info@opdigital.cz")).toEqual([
      { text: "pište na info@opdigital.cz", mention: false },
    ]);
    expect(splitMentions("@Ondřej")).toEqual([{ text: "@Ondřej", mention: true }]);
  });
});

describe("odhad času", () => {
  it("popisek", () => {
    expect(estimateLabel(0)).toBe("");
    expect(estimateLabel(45)).toBe("45 min");
    expect(estimateLabel(90)).toBe("1 h 30 min");
    expect(estimateLabel(120)).toBe("2 h");
  });

  it("zápis: minuty, hodiny, H:MM, prázdné a neplatné", () => {
    expect(parseEstimate("90")).toBe(90);
    expect(parseEstimate("45 min")).toBe(45);
    expect(parseEstimate("1,5 h")).toBe(90);
    expect(parseEstimate("2 hod")).toBe(120);
    expect(parseEstimate("1:30")).toBe(90);
    expect(parseEstimate("")).toBeNull();
    expect(parseEstimate("brzy")).toBeUndefined();
  });
});

describe("slugKey", () => {
  it("klíč typu z názvu", () => {
    expect(slugKey("Návštěva u klienta")).toBe("navsteva_u_klienta");
    expect(slugKey("  Řeší se! ")).toBe("resi_se");
    expect(slugKey("2. kolo")).toBe("t_2_kolo");
    expect(slugKey("!!!")).toBe("");
    expect(slugKey("A")).toBe("a_");
  });
});
