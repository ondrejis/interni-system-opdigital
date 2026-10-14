import path from "node:path";
import { pathToFileURL } from "node:url";
import { definitions, propertyDocs, summary } from "../lib/corpus";
import { genericTable } from "../lib/generic";
import { notificationKinds } from "../lib/events";
import { code, doc, generatedHeader, link, plural, table, text } from "../lib/md";
import { ROOT } from "../lib/paths";
import {
  KNOWN_MANIFEST_KEYS,
  KNOWN_SERVER_KEYS,
  KNOWN_UI_KEYS,
  asArray,
  commandsOf,
  sizeOf,
  type Runtime,
} from "../lib/runtime";
import { FIELD_HEADERS, fieldRows, schemaFields } from "../lib/zod-fields";
import { tableNameOf } from "./entity";

const DIR = "docs/reference/moduly";

const perm = (p: string | readonly string[] | undefined) =>
  asArray(p as string | string[] | undefined)
    .map((x) => code(x))
    .join(" nebo ");

type SettingLike = {
  key: string;
  schema: unknown;
  default: Record<string, unknown>;
  secret?: readonly string[];
};

/** Nastavení (`defineSetting`) nalezená ve zdrojích, s runtime definicí, pokud ji soubor exportuje. */
async function settingsIn(prefix: string) {
  const defs = definitions().filter(
    (d) => d.callee === "defineSetting" && d.file.startsWith(prefix),
  );
  const out: { key: string; file: string; summary: string; def: SettingLike | null }[] = [];
  for (const d of defs) {
    let def: SettingLike | null;
    try {
      const mod = (await import(pathToFileURL(path.join(ROOT, d.file)).href)) as Record<
        string,
        unknown
      >;
      def =
        (Object.values(mod).find(
          (v) =>
            !!v &&
            typeof v === "object" &&
            (v as SettingLike).key === d.key &&
            "schema" in (v as object),
        ) as SettingLike | undefined) ?? null;
    } catch {
      def = null;
    }
    out.push({ key: d.key, file: d.file, summary: summary(d.doc), def });
  }
  return out;
}

function settingsBlock(
  settings: Awaited<ReturnType<typeof settingsIn>>,
  docsFile: (file: string) => Map<string, string>,
): string {
  if (!settings.length) return "";
  return doc(
    "## Nastavení",
    "Nastavení uložená v tabulce `setting` (klíč → JSON), která správce mění v administraci. Tajná pole se ukládají šifrovaně.",
    ...settings.map((s) => {
      const fields = s.def ? schemaFields(s.def.schema, docsFile(s.file)) : null;
      return doc(
        `### ${s.key}`,
        [
          s.summary ? text(s.summary) : "",
          `Definice: ${code(s.file)}.`,
          s.def?.secret?.length
            ? `Tajná pole: ${s.def.secret.map((x) => code(x)).join(", ")}.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        fields && !fields.error && fields.fields.length
          ? table(
              [...FIELD_HEADERS, "Výchozí hodnota v kódu"],
              fields.fields.map((f) => {
                const top = !f.path.includes(".") && !f.path.includes("[");
                const dv = top ? s.def!.default[f.path] : undefined;
                return [
                  ...fieldRows([f], code, text)[0]!,
                  dv === undefined ? "" : code((JSON.stringify(dv) ?? "").slice(0, 80)),
                ];
              }),
            )
          : "_Schéma nelze z kódu rozepsat (viz zdroj)._",
      );
    }),
  );
}

/** Referenční stránka každého modulu a platformy: manifest, závislosti, nabídka UI, nastavení, události. */
export async function moduleDocs(rt: Runtime): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const notif = notificationKinds();
  const rows: string[][] = [];

  for (const m of rt.manifests) {
    const server = rt.servers.get(m.id);
    const ui = rt.ui[m.id] as Record<string, unknown> | undefined;
    const sections: string[] = [];

    // --- manifest
    sections.push(
      doc(
        `# Modul ${m.name} (${m.id})`,
        generatedHeader(
          "manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory",
        ),
        `${text(m.description)}`,
        [
          `- **Identifikátor:** ${code(m.id)}, ikona ${code(m.icon)}`,
          `- **Závisí na:** ${
            m.dependsOn?.length
              ? m.dependsOn.map((d) => link(code(d), DIR, `${DIR}/${d}.md`)).join(", ")
              : "žádném modulu"
          }`,
          `- **Balíček:** ${code(`packages/modules/${m.id}`)}`,
          `- **Vyprávěcí dokumentace:** ${link(`docs/moduly/${m.id}.md`, DIR, `docs/moduly/${m.id}.md`)}`,
          `- **Příkazy:** ${commandsOf(server).length ? link(plural(commandsOf(server).length, "příkaz", "příkazy", "příkazů"), DIR, `docs/reference/prikazy/${m.id}.md`) : "žádné"}`,
          `- **Entity:** ${(server?.entities ?? []).map((e) => link(code(e.key), DIR, `docs/reference/entity/${m.id}.md#${e.key}`)).join(", ") || "žádné"}`,
          `- **Databáze:** ${link("tabulky a migrace", DIR, `docs/reference/databaze/${m.id}.md`)}`,
        ].join("\n"),
      ),
    );

    // --- navigace, stránky
    if (m.nav.length)
      sections.push(
        doc(
          "## Navigace",
          table(
            ["Položka", "Adresa", "Ikona", "Oprávnění", "Sekce panelu", "Nadřazená položka"],
            m.nav.map((n) => [
              text(n.label),
              code(n.href),
              code(n.icon),
              perm(n.permission),
              n.group ?? "",
              n.parent ? code(n.parent) : "",
            ]),
          ),
        ),
      );
    const uiPages = ((ui?.pages as { path: string }[] | undefined) ?? []).map((p) => p.path);
    if (m.pages?.length || uiPages.length)
      sections.push(
        doc(
          "## Stránky modulu",
          table(
            ["Adresa", "Název", "Oprávnění", "Vykreslení v UI modulu"],
            (m.pages ?? []).map((p) => [
              code(p.path),
              text(p.title),
              perm(p.permission),
              uiPages.includes(p.path) ? "ano" : "ne",
            ]),
          ),
          uiPages.filter((p) => !(m.pages ?? []).some((x) => x.path === p)).length
            ? `UI modulu vykresluje i adresy bez záznamu v manifestu: ${uiPages
                .filter((p) => !(m.pages ?? []).some((x) => x.path === p))
                .map((p) => code(p))
                .join(", ")}.`
            : "",
        ),
      );

    // --- oprávnění
    sections.push(
      doc(
        "## Oprávnění",
        `Výchozí přidělení rolím je v ${link("opravneni.md", DIR, "docs/reference/opravneni.md")}.`,
        table(
          ["Klíč", "Název", "Popis"],
          m.permissions.map((p) => [code(p.key), text(p.label), text(p.description ?? "")]),
        ),
      ),
    );

    // --- seed
    const seed = m.seed;
    if (seed) {
      const parts: string[] = [];
      if (seed.pipelines?.length)
        parts.push(
          doc(
            "### Pipeline",
            table(
              ["Entita", "Klíč", "Název", "Stavy (v pořadí)"],
              seed.pipelines.map((p) => [
                code(p.entityType),
                code(p.key),
                text(p.name),
                p.stages.map((s) => text(s.name)).join(" → "),
              ]),
            ),
          ),
        );
      if (seed.lookups?.length)
        parts.push(
          doc(
            "### Číselníky",
            table(
              ["Klíč", "Název", "Hodnoty"],
              seed.lookups.map((l) => [
                code(l.key),
                text(l.name),
                l.items.map((i) => `${code(i.value)} (${text(i.label)})`).join(", "),
              ]),
            ),
          ),
        );
      if (seed.series?.length)
        parts.push(
          doc(
            "### Číselné řady",
            table(
              ["Klíč", "Vzor", "Nulování"],
              seed.series.map((s) => [code(s.key), code(s.pattern), s.reset ?? ""]),
            ),
          ),
        );
      if (seed.views?.length)
        parts.push(
          doc(
            "### Výchozí pohledy",
            table(
              ["Entita", "Název", "Pořadí"],
              seed.views.map((v) => [code(v.entityType), text(v.name), v.position ?? ""]),
            ),
          ),
        );
      if (parts.length)
        sections.push(
          doc(
            "## Výchozí data (seed)",
            "Doplní se při seedu klienta, jen když modul běží; co správce změnil v administraci, se nepřepisuje.",
            ...parts,
          ),
        );
    }

    // --- UI
    if (ui) {
      const uiParts: string[] = [];
      const byEntity = (rec: unknown) =>
        Object.entries((rec as Record<string, unknown[]> | undefined) ?? {}).sort(([a], [b]) =>
          a < b ? -1 : 1,
        );
      const tabs = byEntity(ui.recordTabs);
      if (tabs.length)
        uiParts.push(
          doc(
            "### Záložky na detailu záznamu",
            table(
              ["Entita", "Záložka", "Název", "Oprávnění", "Skupina", "Pořadí", "Podmíněná"],
              tabs.flatMap(([entity, list]) =>
                (
                  list as {
                    id: string;
                    label: string;
                    permission?: string | string[];
                    group?: string;
                    order?: number;
                    visible?: unknown;
                  }[]
                ).map((t) => [
                  code(entity),
                  code(t.id),
                  text(t.label),
                  perm(t.permission),
                  t.group ? code(t.group) : "",
                  t.order ?? "",
                  t.visible ? "ano (podle záznamu)" : "",
                ]),
              ),
            ),
          ),
        );
      const groups = byEntity(ui.recordTabGroups);
      if (groups.length)
        uiParts.push(
          doc(
            "### Skupiny záložek",
            table(
              ["Entita", "Skupina", "Název", "Oprávnění", "Pořadí"],
              groups.flatMap(([entity, list]) =>
                (
                  list as {
                    id: string;
                    label: string;
                    permission?: string | string[];
                    order: number;
                  }[]
                ).map((g) => [
                  code(entity),
                  code(g.id),
                  text(g.label),
                  perm(g.permission),
                  g.order,
                ]),
              ),
            ),
          ),
        );
      const actions = byEntity(ui.recordActions);
      if (actions.length)
        uiParts.push(
          doc(
            "### Akce v hlavičce detailu",
            table(
              ["Entita", "Akce", "Název", "Oprávnění", "Hlavní", "Okno"],
              actions.flatMap(([entity, list]) =>
                (
                  list as {
                    id: string;
                    label: string;
                    permission?: string | string[];
                    primary?: boolean;
                    dialog?: unknown;
                  }[]
                ).map((a) => [
                  code(entity),
                  code(a.id),
                  text(a.label),
                  perm(a.permission),
                  a.primary ? "ano" : "",
                  a.dialog ? "ano" : "",
                ]),
              ),
            ),
          ),
        );
      const bulk = byEntity(ui.bulkActions);
      if (bulk.length)
        uiParts.push(
          doc(
            "### Hromadné akce v seznamu",
            table(
              ["Entita", "Akce", "Název", "Oprávnění"],
              bulk.flatMap(([entity, list]) =>
                (list as { id: string; label: string; permission?: string | string[] }[]).map(
                  (a) => [code(entity), code(a.id), text(a.label), perm(a.permission)],
                ),
              ),
            ),
          ),
        );
      const overview = byEntity(ui.recordOverview);
      if (overview.length)
        uiParts.push(
          doc(
            "### Karty na přehledu záznamu",
            table(
              ["Entita", "Karta", "Sloupec", "Pořadí", "Oprávnění", "Podmíněná"],
              overview.flatMap(([entity, list]) =>
                (
                  list as {
                    id: string;
                    column?: string;
                    order?: number;
                    permission?: string | string[];
                    visible?: unknown;
                  }[]
                ).map((c) => [
                  code(entity),
                  code(c.id),
                  c.column ?? "main",
                  c.order ?? "",
                  perm(c.permission),
                  c.visible ? "ano (podle záznamu)" : "",
                ]),
              ),
            ),
          ),
        );
      const headers = Object.keys((ui.recordHeader as object | undefined) ?? {}).sort();
      if (headers.length)
        uiParts.push(
          `Vlastní hlavičku detailu (pás pod názvem) mají entity: ${headers.map((h) => code(h)).join(", ")}.`,
        );
      const hidden = byEntity(ui.hiddenCoreTabs);
      if (hidden.length)
        uiParts.push(
          "Základní záložky, které modul u entity skrývá: " +
            hidden
              .map(([e, l]) => `${code(e)}: ${(l as string[]).map((x) => code(x)).join(", ")}`)
              .join("; ") +
            ".",
        );
      for (const k of Object.keys(ui)
        .filter((k) => !KNOWN_UI_KEYS.has(k))
        .sort())
        uiParts.push(
          doc(
            `### ${k}`,
            "_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._",
            genericTable(ui[k]),
          ),
        );
      if (uiParts.length)
        sections.push(
          doc(
            "## Rozšíření uživatelského rozhraní",
            "Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.",
            ...uiParts,
          ),
        );
    }

    // --- server
    if (server) {
      const parts: string[] = [];
      if (server.jobs.length)
        parts.push(
          doc(
            "### Úlohy na pozadí",
            table(
              ["Úloha", "Plán (cron)", "Opakování po chybě", "Popis"],
              server.jobs.map((j) => [
                code(j.name),
                j.cron ? code(j.cron) : "jen na požádání",
                j.retryLimit ?? "výchozí",
                text(
                  summary(
                    definitions().find((d) => d.key === j.name && d.callee.endsWith("Job"))?.doc,
                  ),
                ),
              ]),
            ),
            `Souhrn všech úloh: ${link("udalosti-a-ulohy.md", DIR, "docs/reference/udalosti-a-ulohy.md")}.`,
          ),
        );
      if (server.phaseHooks.length)
        parts.push(
          doc(
            "### Háčky přechodu fáze",
            table(
              ["Háček", "Entita", "Z fáze", "Do fáze", "Kontrola", "Akce před", "Akce po"],
              server.phaseHooks.map((h) => [
                code(h.id),
                code(h.entity),
                (h.from ?? ["*"]).map((x) => (x === "" ? "(bez fáze)" : code(x))).join(", "),
                h.to.map((x) => (x === "" ? "(bez fáze)" : code(x))).join(", "),
                h.check ? "ano" : "",
                h.run ? "ano" : "",
                h.after ? "ano" : "",
              ]),
            ),
          ),
        );
      if (server.deleteBlockers.length)
        parts.push(
          doc(
            "### Blokace smazání",
            table(
              ["Blokace", "Mazaná entita", "Navázané záznamy (1 / 2–4 / 5+)", "Doporučení"],
              server.deleteBlockers.map((b) => [
                code(b.id),
                code(b.entity),
                b.noun.map((x) => text(x)).join(" / "),
                b.fix ? text(b.fix) : "výchozí",
              ]),
            ),
          ),
        );
      if (server.calendarLayers.length)
        parts.push(
          doc(
            "### Vrstvy kalendáře",
            table(
              ["Klíč", "Název", "Barva"],
              server.calendarLayers.map((l) => [code(l.key), text(l.label), code(l.color)]),
            ),
          ),
        );
      const counts: string[] = [];
      if (server.attention.length)
        counts.push(`položky „Vyžaduje pozornost“: ${server.attention.length} poskytovatelů`);
      if (server.widgets.length)
        counts.push(`dlaždice přehledu: ${server.widgets.length} poskytovatelů`);
      if (counts.length)
        parts.push(
          doc(
            "### Poskytovatelé dat",
            `Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: ${counts.join("; ")}.`,
          ),
        );
      for (const [k, v] of Object.entries(server)) {
        if (KNOWN_SERVER_KEYS.has(k) || !sizeOf(v)) continue;
        parts.push(
          doc(
            `### ${k}`,
            "_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._",
            genericTable(v),
          ),
        );
      }
      if (parts.length) sections.push(doc("## Serverová část", ...parts));
    }

    // --- nastavení
    const settings = await settingsIn(`packages/modules/${m.id}/`);
    const sb = settingsBlock(settings, propertyDocs);
    if (sb) sections.push(sb);

    // --- upozornění
    const mine = notif.filter((n) =>
      n.files.some((f) => f.startsWith(`packages/modules/${m.id}/`)),
    );
    if (mine.length)
      sections.push(
        doc(
          "## Upozornění",
          "Druhy upozornění (`kind`), která kód modulu vytváří. Příjemce, text a odkaz určuje místo vzniku.",
          table(
            ["Druh", "Vzniká v"],
            mine.map((n) => [
              code(n.kind),
              n.files
                .filter((f) => f.startsWith(`packages/modules/${m.id}/`))
                .map((f) => code(f))
                .join(", "),
            ]),
          ),
        ),
      );

    // --- neznámé klíče manifestu
    const extra = Object.keys(m)
      .filter((k) => !KNOWN_MANIFEST_KEYS.has(k))
      .sort();
    if (extra.length)
      sections.push(
        doc(
          "## Další vlastnosti manifestu",
          ...extra.map((k) =>
            doc(`### ${k}`, genericTable((m as unknown as Record<string, unknown>)[k])),
          ),
        ),
      );

    // --- tabulky
    const ents = server?.entities ?? [];
    if (ents.length)
      sections.push(
        doc(
          "## Tabulky entit",
          table(
            ["Entita", "Tabulka"],
            ents.map((e) => [code(e.key), code(tableNameOf(e))]),
          ),
        ),
      );

    out[`${DIR}/${m.id}.md`] = doc(...sections);
    rows.push([
      link(m.name, DIR, `${DIR}/${m.id}.md`),
      text(m.description),
      m.dependsOn?.map((d) => code(d)).join(", ") ?? "",
      String(m.permissions.length),
      String(ents.length),
      String(commandsOf(server).length),
      String(server?.jobs.length ?? 0),
    ]);
  }

  // --- platforma
  out[`${DIR}/jadro.md`] = await coreModuleDoc(rt, notif);

  out[`${DIR}/README.md`] = doc(
    "# Moduly",
    generatedHeader("manifesty a serverové části modulů"),
    "Referenční stránka každého modulu: co modul v kódu deklaruje (navigace, oprávnění, entity, výchozí data, záložky a akce na detailu, úlohy, nastavení). Vyprávěcí popis (jak modul funguje, toky, pravidla) je v `docs/moduly/`.",
    table(["Modul", "Popis", "Závisí na", "Oprávnění", "Entity", "Příkazy", "Úlohy"], rows),
    `Platforma (jádro, ne modul): ${link("jadro.md", DIR, `${DIR}/jadro.md`)}.`,
  );
  return out;
}

async function coreModuleDoc(
  rt: Runtime,
  notif: ReturnType<typeof notificationKinds>,
): Promise<string> {
  const settings = await settingsIn("packages/core/");
  const jobDefs = definitions();
  return doc(
    "# Platforma (jádro)",
    generatedHeader("`packages/core`: oprávnění platformy, úlohy jádra, nastavení, upozornění"),
    "Jádro není modul: nemá manifest ani vypnutí. Poskytuje databázi, přihlášení, oprávnění, audit, entity, soubory, frontu úloh, nastavení a rozšíření. Podrobnosti o funkcích jádra jsou v [API referenci](../api/README.md).",
    doc(
      "## Oprávnění platformy",
      table(
        ["Klíč", "Název", "Popis"],
        rt.permissions
          .filter((p) => p.owner === "core")
          .map((p) => [code(p.key), text(p.label), text(p.description ?? "")]),
      ),
    ),
    doc(
      "## Úlohy jádra",
      table(
        ["Úloha", "Plán (cron)", "Opakování po chybě", "Popis"],
        rt.coreJobs.map((j) => [
          code(j.name),
          j.cron ? code(j.cron) : "jen na požádání",
          j.retryLimit ?? "výchozí",
          text(summary(jobDefs.find((d) => d.key === j.name && d.callee.endsWith("Job"))?.doc)),
        ]),
      ),
    ),
    settingsBlock(settings, propertyDocs),
    doc(
      "## Upozornění",
      table(
        ["Druh", "Vzniká v"],
        notif
          .filter((n) => n.files.some((f) => f.startsWith("packages/core/")))
          .map((n) => [
            code(n.kind),
            n.files
              .filter((f) => f.startsWith("packages/core/"))
              .map((f) => code(f))
              .join(", "),
          ]),
      ),
    ),
    `Databázové tabulky jádra: ${link("databaze/jadro.md", DIR, "docs/reference/databaze/jadro.md")}. Příkazy platformy: ${rt.platformCommands.size ? `${link("prikazy/jadro.md", DIR, "docs/reference/prikazy/jadro.md")} (${rt.platformCommands.size})` : "žádné"}.`,
  );
}
