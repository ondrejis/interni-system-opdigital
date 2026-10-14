"use client";

import { ClockCard } from "@rebar/dochazka/ui";

/** Píchačka přímo na úvodní stránce telefonu: příchod a odchod na jedno ťuknutí. */
export function HomeClock() {
  return (
    <div className="mt-4 md:hidden" data-testid="home-clock">
      <ClockCard compact />
    </div>
  );
}
