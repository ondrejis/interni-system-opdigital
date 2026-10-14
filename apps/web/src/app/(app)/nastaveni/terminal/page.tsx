import {
  collectTerminalWidgets,
  listTerminalRoleChoices,
  loadTerminalSettings,
  mergeTerminalConfig,
  resolveTerminalTiles,
} from "@rebar/core/terminal";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";
import { TerminalSettingsForm, type TileRow } from "./terminal-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terminál řemeslníka" };

/** Nastavení mobilního terminálu řemeslníka: kdo ho používá, které dlaždice jsou vidět, v jakém pořadí a pod jakým názvem. */
export default async function TerminalSettingsPage() {
  const ctx = await requireCan("settings.manage");
  const { runtime, settings } = getServices();
  const base = runtime.config.terminal;
  const [{ value: stored, problems }, roles] = await Promise.all([
    loadTerminalSettings(settings, ctx.db),
    listTerminalRoleChoices(ctx),
  ]);
  const defs = collectTerminalWidgets(runtime.modules);
  const effective = mergeTerminalConfig(base, stored);
  const row = (t: ReturnType<typeof resolveTerminalTiles>[number]): TileRow => ({
    key: t.key,
    label: t.label === t.defaultLabel ? "" : t.label,
    defaultLabel: t.defaultLabel,
    description: t.description,
    icon: t.icon,
    enabled: t.enabled,
    page: t.page,
  });
  return (
    <TerminalSettingsForm
      enabled={base.enabled}
      roles={roles}
      tiles={resolveTerminalTiles(defs, effective).map(row)}
      selectedRoles={effective.roles}
      attendance={effective.attendance}
      diary={effective.diary}
      defaults={{
        roles: base.roles,
        tiles: resolveTerminalTiles(defs, base).map(row),
        attendance: base.attendance,
        diary: base.diary,
      }}
      problems={problems}
    />
  );
}
