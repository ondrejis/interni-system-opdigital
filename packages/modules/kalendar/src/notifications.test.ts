import { describe, expect, it } from "vitest";
import { validateEventDefs } from "@rebar/core/notifications";
import { KALENDAR_NOTIFICATIONS, KALENDAR_REMINDER } from "./notifications";

describe("události upozornění kalendáře", () => {
  it("katalog je platný a klíče zůstaly stejné", () => {
    expect(validateEventDefs(KALENDAR_NOTIFICATIONS)).toEqual([]);
    expect(KALENDAR_NOTIFICATIONS.map((e) => e.key)).toEqual([
      "kalendar.invite",
      "kalendar.changed",
      "kalendar.cancelled",
      "kalendar.reminder",
    ]);
  });

  it("připomenutí je krátkodobé a jde odložit", () => {
    expect(KALENDAR_REMINDER).toMatchObject({ ttlSeconds: 600, snooze: true, severity: "normal" });
  });
});
