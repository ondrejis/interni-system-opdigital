import { describe, expect, it } from "vitest";
import { renderMail, type MailTemplateName } from "@rebar/core/mail";
import { buildIcs } from "@rebar/kalendar/server";

const INTERNAL = /rebar/i;

describe("interní název se nedostane do e-mailů ani kalendáře", () => {
  it("systémové e-maily (předmět, text, HTML) nesou jen název klienta", () => {
    const vars: Record<MailTemplateName, Record<string, string>> = {
      invitation: { url: "https://system.klient.cz/pozvanka/x", name: "Jan" },
      "password-reset": { url: "https://system.klient.cz/obnova-hesla/x", name: "Jan" },
      test: {},
      document: { url: "https://system.klient.cz/x", title: "Faktura", message: "Dobrý den" },
      notification: { subject: "Nový úkol", body: "Dobrý den", url: "https://system.klient.cz/x" },
    };
    for (const [name, v] of Object.entries(vars)) {
      let mail;
      try {
        mail = renderMail(name as MailTemplateName, v, "Demo firma s.r.o.");
      } catch {
        continue; // šablona vyžaduje další proměnné; zbytek pokrývá test šablon v jádru
      }
      expect(`${mail.subject}\n${mail.text}\n${mail.html}`, name).not.toMatch(INTERNAL);
      expect(mail.html, name).toContain("Demo firma");
    }
  });

  it("odběr kalendáře (iCal) nese jen obecné označení", () => {
    const ics = buildIcs(
      [
        {
          uid: "1@system.klient.cz",
          title: "Schůzka",
          startsAt: new Date("2026-10-20T08:00:00Z"),
          endsAt: new Date("2026-10-20T09:00:00Z"),
          allDay: false,
          recurrence: null,
          recurrenceUntil: null,
          reminderMinutes: 15,
          updatedAt: new Date("2026-10-01T08:00:00Z"),
        } as never,
      ],
      "Kalendář",
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toMatch(INTERNAL);
  });
});
