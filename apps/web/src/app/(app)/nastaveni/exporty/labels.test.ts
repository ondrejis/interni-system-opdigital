import { describe, expect, it } from "vitest";
import {
  describeTiming,
  formatBytes,
  formatCount,
  isRunActive,
  isTime,
  recipientsText,
  resolveTab,
  runStatus,
  templateHref,
  timeText,
} from "./labels";

describe("formatBytes", () => {
  it("bajty, kB, MB a GB s desetinnou čárkou", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 kB");
    expect(formatBytes(1536)).toBe("1,5 kB");
    expect(formatBytes(10.5 * 1024 * 1024)).toBe("10,5 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3 GB");
  });
  it("neznámá velikost je pomlčka", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(-5)).toBe("—");
  });
});

describe("formatCount", () => {
  it("odděluje tisíce a zvládne neznámý počet", () => {
    expect(formatCount(null)).toBe("—");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(12345).replace(/\s/g, " ")).toBe("12 345");
  });
});

describe("describeTiming", () => {
  it("denně", () => {
    expect(
      describeTiming({ frequency: "daily", weekday: null, monthDay: null, timeLocal: "07:00" }),
    ).toBe("Každý den v 7:00");
  });
  it("týdně se správným pádem dne", () => {
    const at = (weekday: number) =>
      describeTiming({ frequency: "weekly", weekday, monthDay: null, timeLocal: "07:00" });
    expect(at(1)).toBe("Každé pondělí v 7:00");
    expect(at(3)).toBe("Každou středu v 7:00");
    expect(at(4)).toBe("Každý čtvrtek v 7:00");
    expect(at(7)).toBe("Každou neděli v 7:00");
  });
  it("měsíčně: den v měsíci a poslední den", () => {
    expect(
      describeTiming({ frequency: "monthly", weekday: null, monthDay: 5, timeLocal: "18:30" }),
    ).toBe("Každého 5. v měsíci v 18:30");
    expect(
      describeTiming({ frequency: "monthly", weekday: null, monthDay: 0, timeLocal: "07:00" }),
    ).toBe("Poslední den v měsíci v 7:00");
  });
});

describe("timeText a isTime", () => {
  it("odstraní úvodní nulu hodin", () => {
    expect(timeText("07:05")).toBe("7:05");
    expect(timeText("17:00")).toBe("17:00");
    expect(timeText("nesmysl")).toBe("nesmysl");
  });
  it("platný čas HH:MM", () => {
    expect(isTime("07:00")).toBe(true);
    expect(isTime("23:59")).toBe(true);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("7:00")).toBe(false);
    expect(isTime("")).toBe(false);
  });
});

describe("stavy exportu", () => {
  it("mapuje známé stavy na české štítky s barvou", () => {
    expect(runStatus("queued")).toEqual({ label: "Ve frontě", color: "gray" });
    expect(runStatus("running").label).toBe("Zpracovává se");
    expect(runStatus("done")).toEqual({ label: "Hotovo", color: "green" });
    expect(runStatus("failed")).toEqual({ label: "Selhalo", color: "red" });
    expect(runStatus("expired").label).toBe("Vypršelo");
  });
  it("neznámý stav se ukáže tak, jak přišel", () => {
    expect(runStatus("xyz")).toEqual({ label: "xyz", color: "gray" });
  });
  it("obnovuje se jen fronta a zpracování", () => {
    expect(["queued", "running"].every(isRunActive)).toBe(true);
    expect(["done", "failed", "expired"].some(isRunActive)).toBe(false);
  });
});

describe("recipientsText", () => {
  it("jeden, více a nikdo", () => {
    expect(recipientsText([])).toBe("—");
    expect(recipientsText(["Jan Novák"])).toBe("Jan Novák");
    expect(recipientsText(["Jan Novák", "Eva"])).toBe("Jan Novák a 1 další");
    expect(recipientsText(["A", "B", "C", "D", "E", "F"])).toBe("A a 5 dalších");
  });
});

describe("templateHref a resolveTab", () => {
  it("odkaz na seznam entity s parametrem šablony", () => {
    expect(templateHref("/zakazky", "abc-1")).toBe("/zakazky?exportTemplate=abc-1");
    expect(templateHref(undefined, "abc-1")).toBeNull();
  });
  it("záložka z adresy jen z povolených, jinak první", () => {
    expect(resolveTab("plany", ["moje", "sablony", "plany"])).toBe("plany");
    expect(resolveTab("historie", ["moje", "sablony"])).toBe("moje");
    expect(resolveTab(null, ["sablony", "plany"])).toBe("sablony");
  });
});
