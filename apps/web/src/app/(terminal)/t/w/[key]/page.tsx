import { notFound } from "next/navigation";
import { TerminalPageHeader } from "@rebar/ui";
import { requireCtx } from "@/server/request";
import { getTerminalState } from "@/server/terminal";
import { clientSettings } from "../../client-settings";
import { WidgetHost } from "../../widget-host";

export const dynamic = "force-dynamic";

/** Celá obrazovka jedné dlaždice. Dlaždice, kterou uživatel nesmí (vypnutá, vypnutý modul, bez oprávnění), je „nenalezeno“. */
export default async function TerminalWidgetPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await requireCtx({ allowTerminalOnly: true });
  const { tiles, config } = await getTerminalState(ctx);
  const tile = tiles.find((t) => t.key === decodeURIComponent(key) && t.page);
  if (!tile) notFound();
  return (
    <div>
      <TerminalPageHeader title={tile.label} />
      <WidgetHost
        tile={{ key: tile.key, label: tile.label, icon: tile.icon, page: tile.page }}
        settings={clientSettings(config)}
        variant="page"
      />
    </div>
  );
}
