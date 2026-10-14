import type { ComponentType } from "react";

/** Volby klienta, které dlaždice potřebují znát v prohlížeči (zbytek konfigurace terminálu zůstává na serveru). */
export type TerminalClientSettings = {
  attendance: { requireJob: boolean; allowJobChange: boolean; showHours: boolean };
  diary: { requirePhoto: boolean };
};

export type TerminalWidgetProps = {
  /** Název dlaždice, jak ho nastavil správce. */
  label: string;
  settings: TerminalClientSettings;
  /** `card`: kompaktní karta na úvodní obrazovce; `page`: celá obrazovka dlaždice (jen dlaždice s `page: true`). */
  variant: "card" | "page";
  /** Adresa celé obrazovky dlaždice, nebo `null`, když ji nemá. */
  pageHref: string | null;
};

/** UI dlaždice terminálu, kterou nabízí modul (`ModuleUi.terminalWidgets[klíč]`). */
export type TerminalWidgetUi = {
  Widget: ComponentType<TerminalWidgetProps>;
};
