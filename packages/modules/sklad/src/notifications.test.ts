import { describe, expect, it } from "vitest";
import { validateEventDefs } from "@rebar/core/notifications";
import { SKLAD_NOTIFICATIONS } from "./notifications";

describe("události upozornění skladu", () => {
  it("katalog je platný a klíč zůstal stejný", () => {
    expect(validateEventDefs(SKLAD_NOTIFICATIONS)).toEqual([]);
    expect(SKLAD_NOTIFICATIONS.map((e) => e.key)).toEqual(["sklad.low"]);
  });
});
