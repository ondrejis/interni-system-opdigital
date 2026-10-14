import { addDaysIso, todayIso } from "@rebar/core/time";

/** Datum relativně k dnešku (`d(-7)` = před týdnem). Všechna demo data jsou takto „čerstvá“. */
export const d = (offsetDays: number): string => addDaysIso(todayIso(), offsetDays);
export const today = (): string => todayIso();

/** Nejbližší pracovní den (po–pá) k datu, ve směru do minulosti. */
export function workdayBefore(date: string): string {
  let x = date;
  for (;;) {
    const wd = new Date(`${x}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) return x;
    x = addDaysIso(x, -1);
  }
}

/** Pracovní den nejblíže před (nebo v) dni `d(offset)`. */
export const wd = (offsetDays: number): string => workdayBefore(d(offsetDays));
