import { F, P, type Probe } from "./shared";

/** Vstupy příkazů: Kalendář. */
export const kalendarProbes: Record<string, Probe> = {
  "kalendar.range": P(() => ({ from: "2026-10-01", to: "2026-10-31", who: "all" }), true),
  "kalendar.options": P(() => ({}), true),
  "kalendar.event.get": P((e) => ({ id: e.f.ids.eventB }), true),
  "kalendar.event.save": F((e) => ({
    id: e.f.ids.eventB,
    title: "x",
    type: "meeting",
    allDay: true,
    startDate: "2026-10-20",
    endDate: "2026-10-20",
  })),
  "kalendar.event.delete": F((e) => ({ id: e.f.ids.eventB })),
  "kalendar.feed.status": P(() => ({}), true),
  "kalendar.feed.regenerate": P(() => ({}), true),
  "kalendar.import.list": P(() => ({}), true),
  "kalendar.import.add": P(() => ({ url: "http://127.0.0.1/x.ics" }), true),
  "kalendar.import.sync": F((e) => ({ id: e.f.ids.importB })),
  "kalendar.import.delete": F((e) => ({ id: e.f.ids.importB })),
};
