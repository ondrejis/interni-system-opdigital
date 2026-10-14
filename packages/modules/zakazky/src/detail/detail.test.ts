import { describe, expect, it } from "vitest";
import { effectivePhase, fromExecution, fromPreparation, phaseAtLeast } from "./visibility";

describe("viditelnost podle fáze zakázky", () => {
  it("pozastavená zakázka se chová jako fáze, ze které byla pozastavena; prohraná je „lost“", () => {
    expect(effectivePhase({ phase: "paused", pausedFrom: "execution" })).toBe("execution");
    expect(effectivePhase({ phase: "lost" })).toBe("lost");
    expect(effectivePhase({ phase: "paused", pausedFrom: "lost" })).toBe("lost");
  });

  it("zakázka bez fáze (stará data) se bere jako běžící", () => {
    expect(effectivePhase({})).toBe("execution");
    expect(effectivePhase({ phase: "neznama" })).toBe("execution");
  });

  it("od přípravy a od realizace; prohraná zakázka nikdy", () => {
    expect(fromPreparation({ phase: "offer" })).toBe(false);
    expect(fromPreparation({ phase: "preparation" })).toBe(true);
    expect(fromExecution({ phase: "preparation" })).toBe(false);
    expect(fromExecution({ phase: "warranty" })).toBe(true);
    expect(phaseAtLeast({ phase: "lost" }, "inquiry")).toBe(false);
  });
});
