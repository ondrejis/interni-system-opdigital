import { describe, expect, it } from "vitest";
import { CORE_NOTIFICATION_EVENTS, validateEventDefs } from "@rebar/core/notifications";
import { manifest } from "./index";
import { ZAKAZKY_NOTIFICATIONS } from "./notifications";

describe("události upozornění modulu Zakázky", () => {
  it("jsou platné a klíče jsou jedinečné i vůči jádru", () => {
    expect(validateEventDefs([...CORE_NOTIFICATION_EVENTS, ...ZAKAZKY_NOTIFICATIONS])).toEqual([]);
  });

  it("jsou všechny v manifestu", () => {
    expect((manifest.notifications ?? []).map((e) => e.key).sort()).toEqual(
      ZAKAZKY_NOTIFICATIONS.map((e) => e.key).sort(),
    );
  });

  it("částky jsou označené jako citlivé a plánovaná událost se nezdvojuje", () => {
    for (const e of ZAKAZKY_NOTIFICATIONS) {
      if ("amount" in e.params) expect(e.params.amount.sensitive).toBe("money");
      if (e.scheduled) expect(e.dedupe).toBe("day");
    }
  });
});
