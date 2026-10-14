import { describe, expect, it } from "vitest";
import { formatNumber, previewNext, validatePattern } from "./numbering";
import { patternWarning } from "./pattern";

describe("formatNumber", () => {
  const d = new Date(2026, 9, 8);
  it("dosadí rok, měsíc a doplní nulami", () => {
    expect(formatNumber("FV-{YYYY}-{NNNN}", 7, d)).toBe("FV-2026-0007");
    expect(formatNumber("{YY}{MM}{NNN}", 42, d)).toBe("2610042");
    expect(formatNumber("Z{N}", 12345, d)).toBe("Z12345");
  });
});

describe("validatePattern", () => {
  it("vyžaduje právě jedno pořadové číslo a zná jen povolené proměnné", () => {
    expect(validatePattern("FV-{YYYY}-{NNNN}")).toBeNull();
    expect(validatePattern("FAKTURA")).toMatch(/pořadové číslo/);
    expect(validatePattern("{NNN}-{NNN}")).toMatch(/jen jednou/);
    expect(validatePattern("{NNN}{DEN}")).toMatch(/neznámou proměnnou/);
    expect(validatePattern("x".repeat(70) + "{NNN}")).toMatch(/dlouhý/);
  });
});

describe("patternWarning a previewNext", () => {
  it("roční řada bez roku ve vzoru dostane upozornění, jinak ne", () => {
    expect(patternWarning("FV-{NNNN}", "yearly")).toMatch(/neobsahuje rok/);
    expect(patternWarning("FV-{NNNN}", "never")).toBeNull();
    expect(patternWarning("FV-{YYYY}-{NNNN}", "yearly")).toBeNull();
    expect(patternWarning("{YY}{NNN}", "yearly")).toBeNull();
  });

  it("náhled dalšího čísla navazuje na řadu a po změně roku začíná od jedničky", () => {
    const row = {
      pattern: "FV-{YYYY}-{NNNN}",
      reset: "yearly" as const,
      period: "2026",
      lastValue: 41,
    };
    expect(previewNext(row, new Date(2026, 5, 1))).toBe("FV-2026-0042");
    expect(previewNext(row, new Date(2027, 0, 2))).toBe("FV-2027-0001");
    expect(previewNext({ ...row, period: "", lastValue: 0 }, new Date(2026, 0, 2))).toBe(
      "FV-2026-0001",
    );
    expect(previewNext({ ...row, reset: "never", period: "all" }, new Date(2030, 0, 1))).toBe(
      "FV-2030-0042",
    );
  });
});
