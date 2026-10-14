import { describe, expect, it } from "vitest";
import { validateEventDefs } from "@rebar/core/notifications";
import { deadlineReminders, stageOf, type ReminderAsset, type ReminderInterval } from "./notices";
import { strojeNotifications } from "./notifications";

const van = (over: Partial<ReminderAsset> = {}): ReminderAsset => ({
  id: "a1",
  name: "Dodávka",
  kind: "van",
  plate: "1A2 3456",
  meter: "km",
  meterValue: 10_000,
  stkDate: null,
  insuranceDate: null,
  vignetteDate: null,
  ...over,
});

describe("události strojů", () => {
  it("definice jsou platné a klíče zachovávají původní názvy", () => {
    expect(validateEventDefs(strojeNotifications)).toEqual([]);
    const keys = strojeNotifications.map((e) => e.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "stroje.deadline",
        "stroje.fuel",
        "stroje.reservation",
        "stroje.defect",
      ]),
    );
  });

  it("naléhavé jsou jen termíny do týdne a blokující závada", () => {
    const sev = Object.fromEntries(strojeNotifications.map((e) => [e.key, e.severity]));
    expect(sev).toMatchObject({
      "stroje.deadline": "normal",
      "stroje.deadline_urgent": "urgent",
      "stroje.defect": "normal",
      "stroje.defect_blocking": "urgent",
      "stroje.reservation_tomorrow": "normal",
    });
  });
});

describe("stupně termínu", () => {
  it("30 dní, 7 dní, po termínu", () => {
    expect(stageOf(null)).toBeNull();
    expect(stageOf(31)).toBeNull();
    expect(stageOf(30)).toBe("30");
    expect(stageOf(8)).toBe("30");
    expect(stageOf(7)).toBe("7");
    expect(stageOf(0)).toBe("7");
    expect(stageOf(-1)).toBe("overdue");
  });
});

describe("připomínky termínů", () => {
  it("STK za 20 dní je běžná, za 5 dní naléhavá, po termínu naléhavá; klíč nese datum i stupeň", () => {
    const a = van({ stkDate: "2026-11-20" });
    const [far] = deadlineReminders(a, [], "2026-10-31");
    expect(far).toMatchObject({ urgent: false, token: "stkDate:2026-11-20:30" });
    expect(far!.what).toBe("STK a emise za 20 dní");
    expect(far!.detail).toBe("STK a emise platí do 20. 11. 2026. SPZ 1A2 3456.");
    const [near] = deadlineReminders(a, [], "2026-11-15");
    expect(near).toMatchObject({ urgent: true, token: "stkDate:2026-11-20:7" });
    const [late] = deadlineReminders(a, [], "2026-11-22");
    expect(late).toMatchObject({ urgent: true, token: "stkDate:2026-11-20:overdue" });
    // nové datum termínu = nový klíč, připomene se znovu
    const [moved] = deadlineReminders(van({ stkDate: "2027-11-20" }), [], "2027-11-01");
    expect(moved!.token).toBe("stkDate:2027-11-20:30");
  });

  it("nic, když je termín daleko nebo nezadaný; přívěs nemá dálniční známku", () => {
    expect(deadlineReminders(van({ stkDate: "2027-01-01" }), [], "2026-10-01")).toEqual([]);
    expect(deadlineReminders(van(), [], "2026-10-01")).toEqual([]);
    const trailer = van({ kind: "trailer", vignetteDate: "2026-10-02" });
    expect(deadlineReminders(trailer, [], "2026-10-01")).toEqual([]);
    expect(deadlineReminders(van({ vignetteDate: "2026-10-02" }), [], "2026-10-01")).toHaveLength(
      1,
    );
  });

  it("servisní interval: blíží se je běžné, překročený naléhavý", () => {
    const iv: ReminderInterval = {
      id: "i1",
      assetId: "a1",
      title: "Výměna oleje",
      everyMeter: 15_000,
      everyMonths: null,
      lastDate: "2026-01-10",
      lastMeter: 0,
    };
    const soon = deadlineReminders(van({ meterValue: 14_000 }), [iv], "2026-10-01");
    expect(soon).toHaveLength(1);
    expect(soon[0]).toMatchObject({ urgent: false, token: "iv:i1:2026-01-10:0:soon" });
    expect(soon[0]!.what).toMatch(/^Výměna oleje: zbývá/);
    const over = deadlineReminders(van({ meterValue: 16_000 }), [iv], "2026-10-01");
    expect(over[0]).toMatchObject({ urgent: true, token: "iv:i1:2026-01-10:0:overdue" });
    expect(deadlineReminders(van({ meterValue: 5_000 }), [iv], "2026-10-01")).toEqual([]);
    // interval jiného stroje se nepočítá
    expect(deadlineReminders(van({ id: "a2", meterValue: 16_000 }), [iv], "2026-10-01")).toEqual(
      [],
    );
  });
});
