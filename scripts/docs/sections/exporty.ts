import { EXPORT_MAX_ROWS } from "@rebar/core/export";
import { definitionOf, summary } from "../lib/corpus";
import { appRoutes } from "../lib/routes";
import { code, doc, generatedHeader, table, text } from "../lib/md";
import { commandsOf, type Runtime } from "../lib/runtime";

const OUT = /export|pdf|feed|ics|download|print/i;
const IN = /import|intake|upload|sync|invitation/i;

/** Exporty a importy: seznamy entit do XLSX/CSV, PDF, kalendářové kanály, příjem dat zvenčí. */
export function exportDocs(rt: Runtime): Record<string, string> {
  const routes = appRoutes().filter((r) => r.kind === "route");
  const commands = rt.manifests.flatMap((m) =>
    commandsOf(rt.servers.get(m.id)).map((c) => ({ module: m.id, c })),
  );
  const exportRoute = routes.find((r) => r.path === "/api/export/[entity]");
  const entities = rt.manifests.flatMap((m) =>
    (rt.servers.get(m.id)?.entities ?? []).map((e) => ({ module: m.id, e })),
  );

  const commandRows = (re: RegExp) =>
    commands
      .filter(({ c }) => re.test(c.name))
      .sort((a, b) => (a.c.name < b.c.name ? -1 : 1))
      .map(({ c }) => [code(c.name), text(summary(definitionOf("defineCommand", c.name)?.doc))]);
  const routeRows = (re: RegExp) =>
    routes
      .filter((r) => re.test(r.path))
      .map((r) => [
        code(r.path),
        r.methods.map((x) => code(x)).join(", "),
        code(r.file),
        text(r.doc),
      ]);

  return {
    "docs/reference/exporty-a-importy.md": doc(
      "# Exporty a importy",
      generatedHeader(
        "registr entit, route handlery v `apps/web/src/app`, příkazy modulů a konstanty exportu v `@rebar/core/export`",
      ),
      "## Export seznamů do souboru (XLSX, CSV)",
      exportRoute
        ? `Tlačítko Export v každém seznamu entity volá ${code(exportRoute.path)} (${exportRoute.methods.map((m) => code(m)).join(", ")}). Exportuje se celá filtrovaná sada podle viditelných sloupců, nejvýše ${String(EXPORT_MAX_ROWS).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} řádků. Sloupce bez oprávnění ke čtení se nevyexportují. Zdroj: ${code(exportRoute.file)}.`
        : "Obecná trasa exportu seznamů zatím neexistuje.",
      table(
        ["Entita", "Modul", "Oprávnění k exportu"],
        entities.map(({ module, e }) => [
          code(e.key),
          module,
          e.permissions.export
            ? code(e.permissions.export)
            : `chybí, stačí čtení ${code(e.permissions.read)}`,
        ]),
      ),
      "## Další výstupy (PDF, kalendářové kanály, tisk)",
      "Route handlery, jejichž adresa napovídá export, PDF, kanál nebo tisk (výběr podle názvu adresy):",
      routeRows(OUT).length
        ? table(["Adresa", "Metody", "Soubor", "Popis"], routeRows(OUT))
        : "_Žádné._",
      "## Příjem dat zvenčí (import, veřejný formulář, nahrání souborů)",
      "Route handlery a příkazy, jejichž název napovídá import, příjem poptávky, nahrávání nebo synchronizaci (výběr podle názvu):",
      routeRows(IN).length
        ? table(["Adresa", "Metody", "Soubor", "Popis"], routeRows(IN))
        : "_Žádné._",
      commandRows(IN).length ? table(["Příkaz", "Popis"], commandRows(IN)) : "",
      "## Příkazy související s exportem nebo odesláním dokladů",
      commandRows(/export|pdf|send|dispatch|mail|ics|feed/i).length
        ? table(["Příkaz", "Popis"], commandRows(/export|pdf|send|dispatch|mail|ics|feed/i))
        : "_Žádné._",
    ),
  };
}
