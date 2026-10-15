/*
  Veřejné funkce modulu „kalendar“ pro jiné moduly (`@rebar/kalendar/api`; smí je importovat jen modul, který má
  „kalendar“ v `dependsOn`). Podle D §2.4 modul nenabízí žádnou službu ani hard API: ostatní moduly s kalendářem
  mluví jen přes úkoly (`task.*` události, vrstvy `calendarLayers`), nikdy přímo. Tady jsou jen čisté, bezstavové
  pomůcky a konstanty, které smí použít i UI jiných modulů (např. text „Obsazeno“).
*/
export { BUSY_TITLE, CALENDAR_TIME_ZONE, WORK_HOURS } from "./contract";
export type { CalendarItemDto, EventAttendee, LinkRef } from "./contract";
