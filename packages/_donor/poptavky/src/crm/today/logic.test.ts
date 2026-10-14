import { describe, expect, it } from "vitest";
import { waitingLabel } from "./logic";

describe("waitingLabel", () => {
  const now = new Date("2026-10-13T10:00:00Z");
  it("říká dnes, včera a před N dny podle pražských dnů", () => {
    expect(waitingLabel("2026-10-13T06:00:00Z", now)).toBe("dnes");
    expect(waitingLabel("2026-10-12T22:30:00Z", now)).toBe("dnes"); // v Praze už 13. 10. 00:30
    expect(waitingLabel("2026-10-12T21:30:00Z", now)).toBe("včera"); // v Praze 12. 10. 23:30
    expect(waitingLabel("2026-10-12T10:00:00Z", now)).toBe("včera");
    expect(waitingLabel("2026-10-10T10:00:00Z", now)).toBe("před 3 dny");
    expect(waitingLabel("2026-09-13T10:00:00Z", now)).toBe("před 30 dny");
  });
  it("budoucí příchod je dnes", () => {
    expect(waitingLabel("2026-10-20T10:00:00Z", now)).toBe("dnes");
  });
});
