import { describe, expect, it } from "vitest";
import { validateEventDefs } from "@rebar/core/notifications";
import { dueIn } from "./due";
import { FAKTURACE_NOTIFICATIONS } from "./notifications";

describe("události upozornění fakturace", () => {
  it("katalog je platný a klíče zůstaly stejné", () => {
    expect(validateEventDefs(FAKTURACE_NOTIFICATIONS)).toEqual([]);
    expect(FAKTURACE_NOTIFICATIONS.map((e) => e.key)).toEqual([
      "invoice.overdue",
      "invoice.due_soon",
      "invoice.paid",
      "received_invoice.overdue",
      "invoice.mail_failed",
    ]);
  });

  it("každá částka je označená jako peníze", () => {
    for (const e of FAKTURACE_NOTIFICATIONS)
      for (const [name, p] of Object.entries(e.params))
        if (/amount|remaining/i.test(name)) expect(p.sensitive, `${e.key}.${name}`).toBe("money");
  });

  it("dueIn skloňuje dny", () => {
    expect([0, 1, 2, 3, 4, 5].map(dueIn)).toEqual([
      "dnes",
      "zítra",
      "za 2 dny",
      "za 3 dny",
      "za 4 dny",
      "za 5 dní",
    ]);
  });
});
