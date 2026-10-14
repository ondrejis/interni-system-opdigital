import { getAccount } from "@rebar/core/auth";
import { formatDate } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import { TerminalEmpty } from "@rebar/ui";
import { requireCtx } from "@/server/request";
import { getTerminalState } from "@/server/terminal";
import { clientSettings } from "./client-settings";
import { WidgetHost } from "./widget-host";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terminál" };

/** Úvodní obrazovka terminálu: dlaždice v pořadí, jak je nastavil klient (a správce), jen ty, které uživatel smí. */
export default async function TerminalHome() {
  const ctx = await requireCtx({ allowTerminalOnly: true });
  const [{ tiles, config }, account] = await Promise.all([getTerminalState(ctx), getAccount(ctx)]);
  const settings = clientSettings(config);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Dobrý den, {account.name.split(" ")[0]}</h1>
        <p className="text-base text-muted" data-testid="today">
          {formatDate(todayIso())}
        </p>
      </div>
      {tiles.length === 0 ? (
        <TerminalEmpty>
          Pro vaši roli teď není v terminálu nic zapnuté. Obraťte se na správce systému.
        </TerminalEmpty>
      ) : (
        tiles.map((t) => (
          <WidgetHost
            key={t.key}
            tile={{ key: t.key, label: t.label, icon: t.icon, page: t.page }}
            settings={settings}
            variant="card"
          />
        ))
      )}
    </div>
  );
}
