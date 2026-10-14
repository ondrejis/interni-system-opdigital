import type { TerminalConfig } from "@rebar/core/terminal";
import type { TerminalClientSettings } from "@rebar/ui";

/** Volby, které dlaždice potřebují znát v prohlížeči (zbytek konfigurace terminálu zůstává na serveru). */
export const clientSettings = (c: TerminalConfig): TerminalClientSettings => ({
  attendance: c.attendance,
  diary: c.diary,
});
