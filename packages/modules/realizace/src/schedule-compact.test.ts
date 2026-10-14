import { describe, expect, it } from "vitest";
import {
  FULL_SPAN_DAYS,
  MAX_ROWS,
  MIN_BAR_PCT,
  WINDOW_DAYS,
  barFor,
  compactTimeline,
  dueText,
  monthTicks,
  nextUp,
  pickRows,
  scheduleHealth,
  timelineWindow,
  type CompactPhase,
} from "./schedule-compact";
import { diffDaysIso } from "@rebar/core/time";

const ph = (
  id: string,
  startDate: string,
  endDate: string,
  extra: Partial<CompactPhase> = {},
): CompactPhase => ({
  id,
  name: `Fáze ${id}`,
  startDate,
  endDate,
  progress: 0,
  status: "planned",
  milestone: false,
  delay: 0,
  ...extra,
});

const TODAY = "2026-10-13";

describe("okno pásu", () => {
  it("krátký plán se ukáže celý od první fáze do konce poslední", () => {
    const w = timelineWindow(
      [ph("a", "2026-10-05", "2026-10-09"), ph("b", "2026-10-12", "2026-10-30")],
      TODAY,
    )!;
    expect(w).toEqual({ start: "2026-10-05", end: "2026-10-30", days: 26, windowed: false });
  });

  it("prázdný plán nemá okno", () => {
    expect(timelineWindow([], TODAY)).toBeNull();
  });

  it("dnešek těsně před začátkem nebo za koncem (s prací, která zbývá) se do pásu přidá", () => {
    const before = timelineWindow([ph("a", "2026-10-20", "2026-10-30")], TODAY)!;
    expect(before.start).toBe(TODAY);
    const after = timelineWindow([ph("a", "2026-10-01", "2026-10-09", { progress: 40 })], TODAY)!;
    expect(after.end).toBe(TODAY);
    // hotový plán se nenatahuje až do dneška
    const done = timelineWindow(
      [ph("a", "2026-10-01", "2026-10-09", { progress: 100, status: "done" })],
      TODAY,
    )!;
    expect(done.end).toBe("2026-10-09");
  });

  it("dnešek daleko od plánu se do pásu nepřidává", () => {
    const w = timelineWindow([ph("a", "2027-03-01", "2027-03-10")], TODAY)!;
    expect(w.start).toBe("2027-03-01");
  });

  it("dlouhý plán: okno 120 dní, které začíná 30 dní před dneškem", () => {
    const w = timelineWindow([ph("a", "2026-01-05", "2027-05-07")], TODAY)!;
    expect(w.windowed).toBe(true);
    expect(w.days).toBe(WINDOW_DAYS);
    expect(w.start).toBe("2026-09-13");
    expect(diffDaysIso(w.start, w.end) + 1).toBe(WINDOW_DAYS);
  });

  it("okno nepřeteče přes okraje plánu", () => {
    const longStart = timelineWindow([ph("a", "2026-10-01", "2027-06-30")], "2026-10-02")!;
    expect(longStart.start).toBe("2026-10-01");
    const longEnd = timelineWindow([ph("a", "2026-01-01", "2026-12-31")], "2026-12-30")!;
    expect(longEnd.end).toBe("2026-12-31");
    expect(longEnd.days).toBe(WINDOW_DAYS);
  });

  it("hranice: plán dlouhý právě FULL_SPAN_DAYS se ještě ukáže celý", () => {
    const w = timelineWindow([ph("a", "2026-07-07", "2026-12-03")], TODAY)!;
    expect(w.days).toBe(FULL_SPAN_DAYS);
    expect(w.windowed).toBe(false);
  });
});

describe("pozice pruhů", () => {
  const w = { start: "2026-10-01", end: "2026-10-10", days: 10, windowed: false };

  it("pruh zabírá dny od začátku do konce včetně", () => {
    const b = barFor(ph("a", "2026-10-03", "2026-10-06"), w)!;
    expect(b.left).toBeCloseTo(20);
    expect(b.width).toBeCloseTo(40);
    expect(b.cutLeft || b.cutRight).toBe(false);
  });

  it("jednodenní fáze má aspoň minimální šířku a nepřeteče vpravo", () => {
    const b = barFor(ph("a", "2026-10-10", "2026-10-10"), { ...w, days: 400 })!;
    expect(b.width).toBeGreaterThanOrEqual(MIN_BAR_PCT);
    expect(b.left + b.width).toBeLessThanOrEqual(100.0001);
  });

  it("milník je bod uprostřed dne, bez šířky", () => {
    const b = barFor(ph("m", "2026-10-05", "2026-10-05", { milestone: true }), w)!;
    expect(b.width).toBe(0);
    expect(b.left).toBeCloseTo(45);
  });

  it("fáze přes okraj okna se ořízne a pozná se to", () => {
    const b = barFor(ph("a", "2026-09-25", "2026-10-03"), w)!;
    expect(b.left).toBe(0);
    expect(b.width).toBeCloseTo(30);
    expect(b.cutLeft).toBe(true);
    expect(b.cutRight).toBe(false);
    const c = barFor(ph("c", "2026-10-08", "2026-10-20"), w)!;
    expect(c.cutRight).toBe(true);
    expect(c.left + c.width).toBeCloseTo(100);
  });

  it("fáze úplně mimo okno pruh nemá", () => {
    expect(barFor(ph("a", "2026-09-01", "2026-09-30"), w)).toBeNull();
    expect(barFor(ph("b", "2026-10-11", "2026-10-20"), w)).toBeNull();
  });

  it("stav pruhu: hotovo, zpožděno, probíhá, plán", () => {
    expect(barFor(ph("a", "2026-10-01", "2026-10-02", { progress: 100 }), w)!.state).toBe("done");
    expect(barFor(ph("a", "2026-10-01", "2026-10-02", { delay: 3 }), w)!.state).toBe("late");
    expect(barFor(ph("a", "2026-10-01", "2026-10-02", { progress: 30 }), w)!.state).toBe("active");
    expect(barFor(ph("a", "2026-10-01", "2026-10-02"), w)!.state).toBe("planned");
  });
});

describe("výběr řádků", () => {
  const many = Array.from({ length: 12 }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    return ph(`p${i}`, `2026-10-${day}`, `2026-10-${day}`, i === 9 ? { delay: 4 } : {});
  });

  it("do limitu se ukážou všechny fáze v pořadí harmonogramu", () => {
    expect(pickRows(many.slice(0, MAX_ROWS), TODAY).map((p) => p.id)).toEqual(
      many.slice(0, MAX_ROWS).map((p) => p.id),
    );
  });

  it("nad limit mají přednost zpožděné, pak nejbližší plánované; pořadí zůstane", () => {
    const rows = pickRows(many, TODAY);
    expect(rows).toHaveLength(MAX_ROWS);
    expect(rows.map((p) => p.id)).toContain("p9"); // zpožděná
    const idx = rows.map((p) => many.indexOf(p));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("pás říká, kolik fází se nevešlo", () => {
    const t = compactTimeline(many, TODAY)!;
    expect(t.bars).toHaveLength(MAX_ROWS);
    expect(t.hidden).toBe(many.length - MAX_ROWS);
  });
});

describe("značka dnes a měsíce", () => {
  it("dnes je uprostřed dne a mimo okno je null", () => {
    const t = compactTimeline([ph("a", "2026-10-01", "2026-10-30")], TODAY)!;
    expect(t.today).toBeCloseTo(((12 + 0.5) / 30) * 100);
    const past = compactTimeline(
      [ph("a", "2026-01-01", "2026-01-30", { progress: 100, status: "done" })],
      TODAY,
    )!;
    expect(past.today).toBeNull();
  });

  it("popisky měsíců: začátek okna a první dny dalších měsíců, leden nese rok", () => {
    const ticks = monthTicks({
      start: "2026-11-02",
      end: "2027-02-20",
      days: 111,
      windowed: false,
    });
    expect(ticks.map((t) => t.label)).toEqual(["lis", "pro", "led 27", "úno"]);
    expect(ticks[0]!.left).toBe(0);
  });

  it("popisek měsíce těsně před prvním dalším se vynechá, aby se nepřekrývaly", () => {
    const ticks = monthTicks({ start: "2026-10-30", end: "2026-12-20", days: 52, windowed: false });
    expect(ticks.map((t) => t.label)).toEqual(["lis", "pro"]);
  });
});

describe("zpoždění a nejbližší fáze", () => {
  it("souhrn zpoždění", () => {
    expect(scheduleHealth([])).toEqual({ kind: "empty" });
    expect(scheduleHealth([ph("a", "2026-10-01", "2026-10-02", { progress: 100 })])).toEqual({
      kind: "done",
    });
    expect(scheduleHealth([ph("a", "2026-10-20", "2026-10-22")])).toEqual({ kind: "ontrack" });
    const late = scheduleHealth([
      ph("a", "2026-10-01", "2026-10-02", { delay: 2 }),
      ph("b", "2026-10-05", "2026-10-09", { delay: 7 }),
      ph("c", "2026-10-20", "2026-10-22"),
    ]);
    expect(late).toMatchObject({ kind: "late", delay: 7, count: 2 });
  });

  it("nejbližší: zpožděné a rozpracované podle konce, plánované podle začátku, hotové ne", () => {
    const list = nextUp(
      [
        ph("hotovo", "2026-09-01", "2026-09-10", { progress: 100 }),
        ph("plan-pozdeji", "2026-11-01", "2026-11-10"),
        ph("bezi", "2026-10-05", "2026-10-30", { progress: 20 }),
        ph("pozdeno", "2026-09-20", "2026-09-30", { delay: 9 }),
        ph("milnik", "2026-10-15", "2026-10-15", { milestone: true }),
      ],
      3,
    );
    expect(list.map((p) => p.id)).toEqual(["pozdeno", "milnik", "bezi"]);
  });
});

describe("kdy je fáze na řadě", () => {
  it("texty podle dne", () => {
    expect(dueText(true, "2026-10-13", TODAY)).toBe("začíná dnes");
    expect(dueText(false, "2026-10-13", TODAY)).toBe("končí dnes");
    expect(dueText(true, "2026-10-14", TODAY)).toBe("začne zítra");
    expect(dueText(false, "2026-10-20", TODAY)).toBe("končí za 7 dní");
    expect(dueText(false, "2026-10-10", TODAY)).toBe("měla skončit před 3 dny");
    expect(dueText(true, "2026-10-12", TODAY)).toBe("měla začít včera");
  });
});
