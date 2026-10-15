import { P, type Probe } from "./shared";

const ID = "11111111-1111-4111-8111-111111111111";

/** Vstupy příkazů: modul „kalendar“ (Google Kalendář: účet, kalendáře, schůzky, vazby, nastavení). */
export const kalendarProbes: Record<string, Probe> = {
  "kalendar.range": P(() => ({ from: "2026-10-12", to: "2026-10-18" }), true),
  "kalendar.account": P(() => ({}), true),
  "kalendar.connect.start": P(() => ({}), true),
  "kalendar.disconnect": P(() => ({}), true),
  "kalendar.calendars.refresh": P(() => ({}), true),
  "kalendar.toggleCalendar": P(() => ({ calendarId: ID, visible: true }), true),
  "kalendar.setWriteTarget": P(() => ({ calendarId: ID }), true),
  "kalendar.sync": P(() => ({}), true),
  "kalendar.test": P(() => ({}), true),
  "kalendar.createMeeting": P(
    () => ({
      title: "Schůzka",
      startsAt: "2026-10-15T09:00:00+02:00",
      endsAt: "2026-10-15T10:00:00+02:00",
    }),
    true,
  ),
  "kalendar.move": P(
    () => ({
      eventId: ID,
      startsAt: "2026-10-15T09:00:00+02:00",
      endsAt: "2026-10-15T10:00:00+02:00",
    }),
    true,
  ),
  "kalendar.delete": P(() => ({ eventId: ID }), true),
  "kalendar.link": P(() => ({ eventId: ID, companyId: ID }), true),
  "kalendar.suggestLinks": P(() => ({ eventId: ID }), true),
  "kalendar.forRecord": P(() => ({ companyId: ID }), true),
  "kalendar.settings.get": P(() => ({}), true),
  "kalendar.settings.save": P(() => ({ privateMeetingsToGoogle: true }), true),
};
