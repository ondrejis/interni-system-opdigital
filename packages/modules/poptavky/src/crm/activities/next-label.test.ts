import { describe, expect, it } from "vitest";
import { nextActivityLook, nextActivityTone } from "./next-label";

// 13. 10. 2026 12:00 pražského času (úterý)
const NOW = new Date("2026-10-13T10:00:00Z");

describe("nextActivityLook", () => {
  it("bez aktivit je to výzva k naplánování", () => {
    const l = nextActivityLook(null, 0, NOW);
    expect(l.state).toBe("none");
    expect(l.text).toBe("Naplánovat");
    expect(l.hint).toContain("nemá naplánovanou");
  });

  it("dnes s časem, budoucí a celodenní aktivita", () => {
    expect(nextActivityLook("2026-10-13T14:00:00Z", 1, NOW)).toMatchObject({
      state: "today",
      text: "Dnes 16:00",
    });
    expect(nextActivityLook("2026-10-14T07:00:00Z", 1, NOW)).toMatchObject({
      state: "future",
      text: "Zítra 9:00",
    });
    // celý den = půlnoc pražského času: bez „0:00“
    expect(nextActivityLook("2026-10-13T22:00:00Z", 1, NOW)).toMatchObject({
      state: "future",
      text: "Zítra",
    });
    expect(nextActivityLook("2026-10-12T22:00:00Z", 1, NOW)).toMatchObject({
      state: "today",
      text: "Dnes",
    });
  });

  it("po termínu ukáže počet dní a počet dalších aktivit jde do tooltipu", () => {
    const l = nextActivityLook("2026-10-10T07:00:00Z", 3, NOW);
    expect(l.state).toBe("overdue");
    expect(l.text).toBe("Po termínu 3 d");
    expect(l.hint).toContain("a 2 další");
    expect(nextActivityLook("2026-10-13T06:00:00Z", 1, NOW).text).toBe("Po termínu");
  });
});

describe("nextActivityTone", () => {
  it("po termínu je červená, dnes zelená jen bez hnití, ostatní šedé", () => {
    expect(nextActivityTone("overdue", true)).toBe("danger");
    expect(nextActivityTone("today", false)).toBe("success");
    expect(nextActivityTone("today", true)).toBe("muted");
    expect(nextActivityTone("future", false)).toBe("muted");
    expect(nextActivityTone("none", true)).toBe("muted");
  });
});
