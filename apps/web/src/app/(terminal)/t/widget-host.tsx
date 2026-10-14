"use client";

import {
  TasksWidget,
  TerminalCard,
  TerminalEmpty,
  useModuleUi,
  type TerminalClientSettings,
  type TerminalWidgetUi,
} from "@rebar/ui";
import { Component, type ReactNode } from "react";

/** UI dlaždic platformy (nepatří žádnému modulu). */
const CORE_WIDGETS: Record<string, TerminalWidgetUi> = {
  "core.tasks": { Widget: TasksWidget },
};

export type HostTile = {
  key: string;
  label: string;
  icon: string;
  page: boolean;
};

/** Chyba jedné dlaždice nesmí shodit celý terminál. */
class Boundary extends Component<{ tile: HostTile; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.error(`Dlaždice ${this.props.tile.key} selhala`, error);
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <TerminalCard title={this.props.tile.label} icon={this.props.tile.icon}>
        <TerminalEmpty>Dlaždici se nepodařilo zobrazit. Zkuste stránku načíst znovu.</TerminalEmpty>
      </TerminalCard>
    );
  }
}

/** Vykreslí dlaždici podle klíče: UI dodává modul (`ModuleUi.terminalWidgets`), jádro konkrétní moduly nezná. */
export function WidgetHost({
  tile,
  settings,
  variant,
}: {
  tile: HostTile;
  settings: TerminalClientSettings;
  variant: "card" | "page";
}) {
  const modules = useModuleUi();
  const ui =
    CORE_WIDGETS[tile.key] ??
    [...modules.values()].map((m) => m.terminalWidgets?.[tile.key]).find(Boolean);
  if (!ui) return null;
  const { Widget } = ui;
  return (
    <Boundary tile={tile}>
      <Widget
        label={tile.label}
        settings={settings}
        variant={variant}
        pageHref={tile.page ? `/t/w/${tile.key}` : null}
      />
    </Boundary>
  );
}
