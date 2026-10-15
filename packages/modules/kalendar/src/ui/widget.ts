import { defineModuleServer, type WidgetProvider } from "@rebar/core/module-server";
import { addDaysIso, localParts } from "@rebar/core/time";
import { rangeItems } from "../google/range";

/*
  Dlaždice „Nadcházející schůzky“ pro Přehled (příspěvek PRE): schůzky a události s časem, které dnes ještě neskončily,
  a zítřejší. Jen moje (`who: "me"`); soukromí zajišťuje `rangeItems` (cizí soukromé i soukromé úkoly se sem nedostanou).
  Serverový kód, proto leží vedle UI jen jako samostatný soubor bez Reactu.
*/

const MAX_LINES = 3;

/** Dlaždice „Nadcházející schůzky“: dnešní nedokončené a zítřejší události a schůzky přihlášeného. */
export const upcomingMeetings: WidgetProvider = async (ctx, deps) => {
  if (!ctx.actor.userId) return [];
  const now = localParts(new Date());
  const tomorrow = addDaysIso(now.date, 1);
  let result;
  try {
    result = await rangeItems(ctx, deps, { from: now.date, to: tomorrow, who: "me" });
  } catch {
    return [];
  }
  const nowIso = `${now.date}T${now.time}`;
  const list = result.items
    .filter(
      (i) =>
        (i.kind === "event" || (i.kind === "layer" && i.layer === "ukoly")) &&
        !i.allDay &&
        i.end >= nowIso,
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const label = (i: (typeof list)[number]) =>
    `${i.start.slice(0, 10) === now.date ? "dnes" : "zítra"} ${i.start.slice(11, 16)} ${i.title}`;
  const n = list.length;
  return [
    {
      id: "kalendar.upcoming",
      module: "kalendar",
      title: "Nadcházející schůzky",
      value: n === 0 ? "Žádné" : `${n} ${n === 1 ? "schůzka" : n < 5 ? "schůzky" : "schůzek"}`,
      hint:
        n === 0
          ? "Dnes ani zítra nic není v kalendáři."
          : list.slice(0, MAX_LINES).map(label).join(" · ") +
            (n > MAX_LINES ? ` · +${n - MAX_LINES}` : ""),
      href: "/kalendar",
      tone: "default",
      order: 20,
    },
  ];
};

/** Serverový příspěvek UI oblasti: widget pro Přehled a jeho záznam pro canary test soukromí. */
export const uiServer = defineModuleServer({
  widgets: [upcomingMeetings],
  privatePaths: [
    { name: "kalendar.widget.upcoming", run: (ctx, deps) => upcomingMeetings(ctx, deps) },
  ],
});
