import { appRoutes, serverActions } from "../lib/routes";
import { code, doc, generatedHeader, table, text } from "../lib/md";
import type { Runtime } from "../lib/runtime";
import { asArray } from "../lib/runtime";

/** Trasy aplikace (stránky, route handlery), trasy z manifestů modulů a serverové akce. */
export function routeDocs(rt: Runtime): Record<string, string> {
  const routes = appRoutes();
  const pages = routes.filter((r) => r.kind === "page");
  const handlers = routes.filter((r) => r.kind === "route");
  const actions = serverActions();

  const moduleRoutes = rt.manifests.flatMap((m) => {
    const server = rt.servers.get(m.id);
    const entityRoutes = (server?.entities ?? []).flatMap((e) => [
      [code(e.listPath), "seznam", m.id, code(e.key), code(e.permissions.read)],
      [code(`${e.listPath}/<id>`), "detail", m.id, code(e.key), code(e.permissions.read)],
    ]);
    const pageRoutes = (m.pages ?? []).map((p) => [
      code(p.path),
      "stránka modulu",
      m.id,
      text(p.title),
      asArray(p.permission as string | string[] | undefined)
        .map((x) => code(x))
        .join(" nebo "),
    ]);
    return [...entityRoutes, ...pageRoutes];
  });

  const actionsByFile = new Map<string, typeof actions>();
  for (const a of actions) actionsByFile.set(a.file, [...(actionsByFile.get(a.file) ?? []), a]);

  return {
    "docs/reference/trasy.md": doc(
      "# Trasy aplikace",
      generatedHeader(
        'soubory `page` a `route` v `apps/web/src/app`, manifesty modulů a soubory se serverovými akcemi (`"use server"`)',
      ),
      "Aplikace je Next.js (App Router). Dynamické části adresy jsou v hranatých závorkách; skupina tras v závorkách (např. `(app)`) se do adresy nepromítá, ale sdílí rozložení (přihlášená část aplikace).",
      "## Stránky",
      table(
        ["Adresa", "Skupina", "Soubor", "Popis"],
        pages.map((r) => [code(r.path), r.group ? code(r.group) : "", code(r.file), text(r.doc)]),
      ),
      "## Route handlery (API)",
      table(
        ["Adresa", "Metody", "Soubor", "Popis"],
        handlers.map((r) => [
          code(r.path),
          r.methods.map((x) => code(x)).join(", "),
          code(r.file),
          text(r.doc),
        ]),
      ),
      "## Trasy modulů",
      "Stránky seznamů a detailů vzniklé z registru entit a stránky z manifestů modulů obsluhuje společná trasa `[...path]` (viz stránky výše). Které jsou dostupné, závisí na zapnutých modulech a oprávněních.",
      table(["Adresa", "Druh", "Modul", "Entita / název", "Oprávnění"], moduleRoutes),
      "## Serverové akce",
      'Funkce v souborech s direktivou `"use server"` volá rozhraní aplikace přímo. Oprávnění a validaci hlídá každá akce uvnitř (viz [ADR 007](../adr/007-opravneni-v-datove-vrstve.md)).',
      ...[...actionsByFile.entries()].map(([file, list]) =>
        doc(
          `### ${file}`,
          table(
            ["Akce", "Parametry", "Popis"],
            list.map((a) => [code(a.name), code(a.params), text(a.doc)]),
          ),
        ),
      ),
    ),
  };
}
