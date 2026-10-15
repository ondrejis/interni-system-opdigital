import { describe, expect, it } from "vitest";
import { clientFolderName, jobFolderName, pragueToday } from "./naming";

const PATTERN = "{RRRR-MM} {Název zakázky}";

describe("název složky zakázky", () => {
  it("podle data zahájení: `{RRRR-MM} {Název zakázky}`", () => {
    expect(jobFolderName(PATTERN, { title: "Nový web", startDate: "2026-10-14" })).toBe(
      "2026-10 Nový web",
    );
  });

  it("bez data zahájení vezme dnešek v české zóně", () => {
    const now = new Date("2026-12-31T23:30:00Z"); // v Praze už 1. 1. 2027
    expect(pragueToday(now)).toBe("2027-01-01");
    expect(jobFolderName(PATTERN, { title: "Retainer" }, now)).toBe("2027-01 Retainer");
  });

  it("ostatní proměnné a čištění názvu", () => {
    expect(
      jobFolderName("{RRRR}/{MM} {Číslo} {Název zakázky}", {
        title: " A/B  web ",
        number: "Z-2026-004",
        startDate: "2026-03-02",
      }),
    ).toBe("2026-03 Z-2026-004 A-B web");
  });

  it("zakázka bez názvu dostane zástupný název", () => {
    expect(jobFolderName("{Název zakázky}", { title: "  " })).toBe("Zakázka bez názvu");
  });
});

describe("název složky klienta", () => {
  it("odstraní lomítka a zbytečné mezery", () => {
    expect(clientFolderName("  Novák  a syn s.r.o. ")).toBe("Novák a syn s.r.o.");
    expect(clientFolderName("A/B Stavby")).toBe("A-B Stavby");
    expect(clientFolderName("")).toBe("Klient bez názvu");
  });
});
