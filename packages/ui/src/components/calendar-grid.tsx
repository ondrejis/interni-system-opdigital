"use client";

import { cs } from "date-fns/locale";
import { DayPicker } from "react-day-picker";

/** Mřížka kalendáře pro `DatePicker`; samostatný soubor kvůli línému načtení (velké závislosti). */
export default function CalendarGrid({
  selected,
  onSelect,
}: {
  selected: Date | undefined;
  onSelect: (d: Date | undefined) => void;
}) {
  return (
    <DayPicker
      mode="single"
      locale={cs}
      weekStartsOn={1}
      selected={selected}
      defaultMonth={selected}
      onSelect={onSelect}
      classNames={{
        root: "text-base",
        months: "relative",
        month_caption: "flex h-8 items-center justify-center font-medium",
        nav: "absolute right-0 top-0 flex gap-1",
        button_previous: "rounded-md p-1 text-muted hover:bg-hover",
        button_next: "rounded-md p-1 text-muted hover:bg-hover",
        weekday: "size-8 text-xs font-medium text-faint",
        day: "size-8 p-0",
        day_button: "size-8 rounded-md hover:bg-hover",
        selected: "[&>button]:bg-accent [&>button]:text-accent-fg [&>button:hover]:bg-accent",
        today: "font-semibold text-accent",
        outside: "text-faint opacity-60",
      }}
    />
  );
}
