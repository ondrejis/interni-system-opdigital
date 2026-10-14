/** Pořadí položek v jednom dni kalendáře (čistá logika bez React a databáze; `now` se předává zvenku). */

export type OrderedItem = {
  kind: "event" | "busy" | "layer" | "holiday";
  title: string;
  /** Celodenní: `YYYY-MM-DD`; jinak místní `YYYY-MM-DDTHH:mm`. */
  start: string;
  end: string;
  allDay: boolean;
  /** Událost patří přihlášenému (ne jen pozvanému). */
  own: boolean;
};

const KIND_ORDER: Record<OrderedItem["kind"], number> = { event: 0, busy: 1, layer: 2, holiday: 3 };
const timeOf = (s: string) => (s.length > 10 ? s.slice(11, 16) : "");

/**
 * Porovnávač pro řazení položek dne `day`. V měsíční mřížce se po třetí položce zbytek schová za „+ N další“, proto
 * jdou nahoru: události před obsazeností a vrstvami jiných modulů; mezi událostmi vlastní před pozvanými; v dnešním dni
 * nejdřív to, co ještě neskončilo (`now` = `YYYY-MM-DDTHH:mm`, a jen když `day` je dnes); uvnitř celodenní, pak čas.
 */
export function dayComparator(
  day: string,
  now: string | null,
): (a: OrderedItem, b: OrderedItem) => number {
  const over = (it: OrderedItem) =>
    now !== null && day === now.slice(0, 10) && !it.allDay && it.end < now;
  return (a, b) =>
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    Number(b.own) - Number(a.own) ||
    Number(over(a)) - Number(over(b)) ||
    Number(b.allDay) - Number(a.allDay) ||
    timeOf(a.start).localeCompare(timeOf(b.start)) ||
    a.title.localeCompare(b.title, "cs");
}
