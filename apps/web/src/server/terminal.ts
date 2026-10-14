import "server-only";
import {
  bottomTiles,
  collectTerminalWidgets,
  isTerminalOnlyRole,
  loadEffectiveTerminalConfig,
  visibleTerminalTiles,
  type ResolvedTile,
  type TerminalConfig,
} from "@rebar/core/terminal";
import { can, type Ctx } from "@rebar/core/rbac";
import { cache } from "react";
import { getServices } from "./services";

export type TerminalState = {
  /** Konfigurace, která platí (výchozí z `config.ts` přepsané nastavením správce). */
  config: TerminalConfig;
  /** Dlaždice, které tento uživatel smí vidět a používat (zapnuté, zapnutý modul, oprávnění role). */
  tiles: ResolvedTile[];
  /** Dlaždice pro spodní lištu (nejvýš tři). */
  bottom: ResolvedTile[];
  /** Role používá jen terminál: do kancelářského rozhraní se nedostane. */
  terminalOnly: boolean;
};

/**
 * Stav terminálu pro přihlášeného: jednou za požadavek. Server z něj vychází při zobrazení dlaždic, při otevření obrazovky
 * dlaždice i při přijetí zápisu, takže dlaždice vypnutého modulu nebo bez oprávnění se nezobrazí a server ji odmítne.
 */
export const getTerminalState = cache(async (ctx: Ctx): Promise<TerminalState> => {
  const { runtime, settings } = getServices();
  const config = await loadEffectiveTerminalConfig(settings, ctx.db, runtime.config.terminal);
  const defs = collectTerminalWidgets(runtime.modules);
  const tiles = config.enabled ? visibleTerminalTiles(defs, config, (p) => can(ctx, p)) : [];
  return {
    config,
    tiles,
    bottom: bottomTiles(tiles),
    terminalOnly: ctx.actor.kind === "user" && isTerminalOnlyRole(config, ctx.actor.roleKey),
  };
});

/** Uživatel s rolí jen pro terminál (kancelářské rozhraní mu je zavřené). */
export async function isTerminalOnly(ctx: Ctx): Promise<boolean> {
  const { runtime } = getServices();
  // rychlá cesta: terminál vypnutý v konfiguraci nezamyká nikoho a nestojí ani dotaz do databáze
  if (!runtime.config.terminal.enabled) return false;
  return (await getTerminalState(ctx)).terminalOnly;
}
