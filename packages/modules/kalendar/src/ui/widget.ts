import {
  defineDashboardMetric,
  defineModuleServer,
  type WidgetProvider,
} from "@rebar/core/module-server";
import type { ListItem } from "@rebar/core/dashboards-shared";
import type { CalendarItemDto } from "../contract";
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

/** Položky seznamu „Nadcházející schůzky“: dnešní nedokončené a zítřejší události; cizí soukromé jen jako „Obsazeno“ (bez místa a vazeb). */
export function upcomingListItems(
  items: CalendarItemDto[],
  now: { date: string; time: string },
  limit: number,
): ListItem[] {
  const nowIso = `${now.date}T${now.time}`;
  const tomorrow = addDaysIso(now.date, 1);
  return items
    .filter(
      (i) =>
        (i.kind === "event" || i.kind === "busy" || (i.kind === "layer" && i.layer === "ukoly")) &&
        !i.allDay &&
        i.end >= nowIso &&
        i.start.slice(0, 10) <= tomorrow,
    )
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, limit)
    .map((i) => {
      const today = i.start.slice(0, 10) === now.date;
      const busy = i.kind === "busy";
      const subtitle = busy
        ? i.owner
          ? `Kalendář: ${i.owner}`
          : undefined
        : [i.location, i.own ? null : i.owner].filter(Boolean).join(" · ") || undefined;
      return {
        id: i.id,
        title: busy ? "Obsazeno" : i.title,
        subtitle: `${i.start.slice(11, 16)}–${i.end.slice(11, 16)}${subtitle ? ` · ${subtitle}` : ""}`,
        badge: today ? "Dnes" : "Zítra",
        tone: today ? ("default" as const) : undefined,
        href: busy ? undefined : "/kalendar",
        date: i.start.slice(0, 10),
      };
    });
}

/** Metrika `kalendar.upcoming` (tvar seznam) pro widget „Nadcházející schůzky“ na Přehledu. */
export const upcomingMetric = defineDashboardMetric({
  key: "kalendar.upcoming",
  label: "Nadcházející schůzky",
  description:
    "Schůzky a události z kalendáře dnes a zítra; cizí soukromé události jen jako „Obsazeno“.",
  format: "number",
  shape: "list",
  permissions: ["kalendar.read"],
  async compute(ctx, input, deps) {
    const now = localParts(new Date());
    let result;
    try {
      result = await rangeItems(ctx, deps, {
        from: now.date,
        to: addDaysIso(now.date, 1),
        who: "all",
      });
    } catch {
      return { kind: "list", items: [], emptyText: "Dnes ani zítra nic není v kalendáři." };
    }
    return {
      kind: "list",
      items: upcomingListItems(result.items, now, input.limit),
      emptyText: "Dnes ani zítra nic není v kalendáři.",
    };
  },
});

/** Serverový příspěvek UI oblasti: widget pro Přehled a jeho záznam pro canary test soukromí. */
export const uiServer = defineModuleServer({
  widgets: [upcomingMeetings],
  privatePaths: [
    { name: "kalendar.widget.upcoming", run: (ctx, deps) => upcomingMeetings(ctx, deps) },
  ],
});
