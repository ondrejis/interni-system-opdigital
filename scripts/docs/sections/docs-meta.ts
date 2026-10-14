import fs from "node:fs";
import path from "node:path";
import { definitions, walk } from "../lib/corpus";
import { notificationKinds } from "../lib/events";
import { formatMarkdown } from "../lib/format";
import { code, doc, generatedHeader, link, plural, table, text } from "../lib/md";
import { ROOT } from "../lib/paths";
import { commandsOf, type Runtime } from "../lib/runtime";

export const BLOCK_START = "<!-- docs:generated:start -->";
export const BLOCK_END = "<!-- docs:generated:end -->";
export const TODO_MARKER = "TODO: doplnit vyprávění";

const MODULE_DOCS = "docs/moduly";

/** Souhrn modulu z kódu, který se vkládá do vyprávěcí dokumentace mezi značky `docs:generated`. */
export async function moduleBlock(rt: Runtime, id: string): Promise<string> {
  const m = rt.manifests.find((x) => x.id === id)!;
  const server = rt.servers.get(id);
  const notif = notificationKinds().filter((n) =>
    n.files.some((f) => f.startsWith(`packages/modules/${id}/`)),
  );
  const settings = definitions().filter(
    (d) => d.callee === "defineSetting" && d.file.startsWith(`packages/modules/${id}/`),
  );
  const roles = rt.defaultRoles;
  const scope = (r: (typeof roles)[number], key: string) =>
    r.isSystem
      ? "vše"
      : r.permissions?.[key] === undefined
        ? ""
        : r.permissions[key] === true || r.permissions[key] === "all"
          ? "vše"
          : "moje";
  const ref = (p: string, label: string) => link(label, MODULE_DOCS, `docs/reference/${p}`);

  const lines = [
    `- **Popis z manifestu:** ${text(m.description)}`,
    `- **Závisí na:** ${m.dependsOn?.length ? m.dependsOn.map((d) => link(code(d), MODULE_DOCS, `docs/moduly/${d}.md`)).join(", ") : "žádném modulu"}`,
    `- **Entity:** ${(server?.entities ?? []).map((e) => link(code(e.key), MODULE_DOCS, `docs/reference/entity/${id}.md#${e.key}`)).join(", ") || "žádné"}`,
    `- **Příkazy:** ${commandsOf(server).length ? link(plural(commandsOf(server).length, "příkaz", "příkazy", "příkazů"), MODULE_DOCS, `docs/reference/prikazy/${id}.md`) : "žádné"}`,
    server?.jobs.length
      ? `- **Úlohy na pozadí:** ${server.jobs.map((j) => `${code(j.name)}${j.cron ? ` (${code(j.cron)})` : ""}`).join(", ")}`
      : "",
    settings.length
      ? `- **Nastavení v administraci:** ${settings.map((s) => code(s.key)).join(", ")}`
      : "",
    notif.length ? `- **Upozornění:** ${notif.map((n) => code(n.kind)).join(", ")}` : "",
    m.terminalWidgets?.length
      ? `- **Dlaždice terminálu:** ${m.terminalWidgets.map((w) => code(w.key)).join(", ")}`
      : "",
    `- **Referenční stránky:** ${[ref(`moduly/${id}.md`, "modul"), server?.entities.length ? ref(`entity/${id}.md`, "entity") : "", commandsOf(server).length ? ref(`prikazy/${id}.md`, "příkazy") : "", ref(`databaze/${id}.md`, "databáze")].filter(Boolean).join(", ")}`,
  ].filter(Boolean);

  const permTable = table(
    ["Oprávnění", "Název", ...roles.map((r) => `Výchozí: ${r.key}`)],
    m.permissions.map((p) => [code(p.key), text(p.label), ...roles.map((r) => scope(r, p.key))]),
  );
  const md = doc(
    `_Tento blok vzniká z kódu (\`pnpm docs:generate\`); neupravuj ho ručně. Vyprávění píš pod ním._`,
    lines.join("\n"),
    "**Oprávnění a jejich výchozí přidělení rolím:**",
    permTable,
  );
  return formatMarkdown(md);
}

/** Nahradí blok mezi značkami; `null`, když v souboru značky nejsou. Chybně uzavřený blok je chyba. */
export function applyBlock(existing: string, block: string): string | null {
  const a = existing.indexOf(BLOCK_START);
  const b = existing.indexOf(BLOCK_END);
  if (a === -1 && b === -1) return null;
  if (a === -1 || b === -1 || b < a)
    throw new Error(`Značky ${BLOCK_START} a ${BLOCK_END} musí být obě a ve správném pořadí.`);
  return `${existing.slice(0, a + BLOCK_START.length)}\n\n${block.trim()}\n\n${existing.slice(b)}`;
}

/** Obsah nově založené kostry vyprávěcí dokumentace modulu ze šablony `docs/moduly/_sablona.md`. */
export function scaffoldModuleDoc(rt: Runtime, id: string): string {
  const m = rt.manifests.find((x) => x.id === id)!;
  const tpl = fs.readFileSync(path.join(ROOT, MODULE_DOCS, "_sablona.md"), "utf8");
  const server = rt.servers.get(id);
  const reference = `Referenční stránky vzniklé z kódu: ${[
    link("modul", MODULE_DOCS, `docs/reference/moduly/${id}.md`),
    server?.entities.length ? link("entity", MODULE_DOCS, `docs/reference/entity/${id}.md`) : "",
    commandsOf(server).length
      ? link("příkazy", MODULE_DOCS, `docs/reference/prikazy/${id}.md`)
      : "",
    link("databáze", MODULE_DOCS, `docs/reference/databaze/${id}.md`),
  ]
    .filter(Boolean)
    .join(", ")}.`;
  return tpl
    .replaceAll("{{name}}", m.name)
    .replaceAll("{{id}}", id)
    .replaceAll("{{reference}}", reference);
}

const TITLE = /^#\s+(.+?)\s*#*\s*$/m;

function titleOf(file: string): string {
  if (file.endsWith("/_sablona.md")) return "Šablona vyprávěcí dokumentace modulu";
  const md = fs.readFileSync(path.join(ROOT, file), "utf8");
  const m = TITLE.exec(md.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, ""));
  return m?.[1]?.replace(/`/g, "") ?? path.basename(file, ".md");
}

/** Skupiny rozcestníku: pořadí a popis; dokument mimo známé skupiny spadne do „Ostatní“. */
const GROUPS: { title: string; blurb: string; files: string[] }[] = [
  {
    title: "Začínáme a architektura",
    blurb: "Co systém je, jak je postavený a jak se upravuje pro klienta.",
    files: ["README.md", "docs/ARCHITECTURE.md", "docs/CUSTOMIZATION.md", "docs/TERMINAL.md"],
  },
  {
    title: "Provoz a bezpečnost",
    blurb: "Nasazení, provoz, zálohy, bezpečnost a výkon.",
    files: [
      "docs/DEPLOYMENT.md",
      "docs/RUNBOOK.md",
      "docs/SECURITY.md",
      "docs/security-notes.md",
      "docs/PERFORMANCE.md",
    ],
  },
  {
    title: "Vývoj dokumentace",
    blurb: "Jak se udržuje dokumentace přesná a aktuální.",
    files: ["docs/DOCS-PROCES.md"],
  },
  {
    title: "Stav, audity a otevřené otázky",
    blurb: "Pracovní a historické dokumenty.",
    files: [
      "docs/AUDIT.md",
      "docs/OPEN-QUESTIONS.md",
      "docs/ZAKAZKA.md",
      "docs/UI-SPACING.md",
      "CHANGELOG.md",
    ],
  },
];

/** Rozcestník `docs/INDEX.md`: odkaz na každý dokument v `docs/` (generovaný, takže nic nechybí). */
export async function indexDoc(rt: Runtime): Promise<string> {
  const all = ["README.md", "CHANGELOG.md", ...walk("docs", (f) => f.endsWith(".md"))]
    .filter((f) => f !== "docs/INDEX.md")
    .filter((f) => !f.startsWith("docs/reference/") || f === "docs/reference/README.md");
  const used = new Set<string>();
  const row = (f: string) => `- ${link(text(titleOf(f)), "docs", f)} (${code(f)})`;
  const blocks: string[] = [];
  for (const g of GROUPS) {
    const present = g.files.filter((f) => all.includes(f));
    present.forEach((f) => used.add(f));
    if (present.length) blocks.push(doc(`## ${g.title}`, g.blurb, present.map(row).join("\n")));
  }

  const moduleDocs = all.filter((f) => f.startsWith("docs/moduly/"));
  moduleDocs.forEach((f) => used.add(f));
  const modOrder = rt.manifests.map((m) => `docs/moduly/${m.id}.md`);
  const sortedModules = [
    ...moduleDocs.filter((f) => f.endsWith("/_sablona.md")),
    ...modOrder.filter((f) => moduleDocs.includes(f)),
    ...moduleDocs.filter((f) => !f.endsWith("/_sablona.md") && !modOrder.includes(f)).sort(),
  ];
  blocks.push(
    doc(
      "## Moduly (vyprávěcí dokumentace)",
      "Jak každý modul funguje: účel, role, toky, stavy, pravidla, integrace a omezení. Kostry s nedopsanými sekcemi se postupně doplňují (`pnpm docs:status` je vypíše).",
      sortedModules.map(row).join("\n"),
    ),
  );

  blocks.push(
    doc(
      "## Reference (generovaná z kódu)",
      "Přesné seznamy, které vznikají z kódu a nikdy se neupravují ručně (`pnpm docs:generate`, kontrola `pnpm docs:check`).",
      `- ${link("Přehled reference", "docs", "docs/reference/README.md")}`,
      [
        ["Moduly", "docs/reference/moduly/README.md"],
        ["Entity a pole", "docs/reference/entity/README.md"],
        ["Serverové příkazy", "docs/reference/prikazy/README.md"],
        ["Oprávnění a výchozí role", "docs/reference/opravneni.md"],
        ["Proměnné prostředí a konfigurace", "docs/reference/prostredi.md"],
        ["Databáze a migrace", "docs/reference/databaze/README.md"],
        ["Události, upozornění a úlohy", "docs/reference/udalosti-a-ulohy.md"],
        ["Trasy aplikace", "docs/reference/trasy.md"],
        ["Exporty a importy", "docs/reference/exporty-a-importy.md"],
        ["API reference (TSDoc)", "docs/reference/api/README.md"],
      ]
        .map(([t, f]) => `- ${link(t!, "docs", f!)}`)
        .join("\n"),
    ),
  );
  used.add("docs/reference/README.md");

  const adrs = all.filter((f) => f.startsWith("docs/adr/"));
  adrs.forEach((f) => used.add(f));
  blocks.push(
    doc(
      "## Architektonická rozhodnutí (ADR)",
      "Proč je věc udělaná tak, jak je. Každé rozhodnutí má vlastní číslované ADR.",
      adrs.map(row).join("\n"),
    ),
  );

  const rest = all.filter((f) => !used.has(f));
  if (rest.length) blocks.push(doc("## Ostatní dokumenty", rest.map(row).join("\n")));

  return formatMarkdown(
    doc(
      "# Rozcestník dokumentace",
      generatedHeader("seznam souborů `docs/` a jejich nadpisy"),
      "Rozcestník ke všemu v `docs/`. Každý dokument je tu uveden; test `tests/docs.test.ts` hlídá, že nic nechybí a že odkazy vedou na existující soubory a kotvy.",
      ...blocks,
    ),
  );
}

/** Úvod generované reference: co je kde a kolik toho je. */
export function referenceReadme(rt: Runtime, files: readonly string[]): string {
  const count = (re: RegExp) => files.filter((f) => re.test(f)).length;
  const modules = rt.manifests.length;
  const commands = [...rt.servers.values()].reduce((n, s) => n + s.commands.size, 0);
  const entities = [...rt.servers.values()].reduce((n, s) => n + s.entities.length, 0);
  return doc(
    "# Reference generovaná z kódu",
    generatedHeader("celý kód repozitáře"),
    "Všechno v této složce vzniká přímo z kódu a **nikdy se neupravuje ručně**. Správnost zaručuje kontrola driftu: `pnpm docs:check` (součást `pnpm check` a CI) znovu vygeneruje obsah a porovná ho s commitnutým. Když se změní kód, spusť `pnpm docs:generate` a výsledek commitni. Proces popisuje [DOCS-PROCES](../DOCS-PROCES.md), rozhodnutí [ADR 022](../adr/022-dokumentace-z-kodu.md).",
    table(
      ["Dokument", "Co v něm je", "Zdroj"],
      [
        [
          link("moduly/", "docs/reference", "docs/reference/moduly/README.md"),
          `manifest, navigace, nabídka UI, úlohy, nastavení každého z ${modules} modulů`,
          "manifesty, `ModuleServer`, `ModuleUi`",
        ],
        [
          link("entity/", "docs/reference", "docs/reference/entity/README.md"),
          `${entities} entit: pole, typy, vazby, povinnost, výčty`,
          "registr entit",
        ],
        [
          link("prikazy/", "docs/reference", "docs/reference/prikazy/README.md"),
          `${commands} serverových příkazů: oprávnění a vstupní pole`,
          "registr příkazů, Zod schémata",
        ],
        [
          link("opravneni.md", "docs/reference", "docs/reference/opravneni.md"),
          "katalog oprávnění a matice výchozích rolí",
          "manifesty, `DEFAULT_ROLES`",
        ],
        [
          link("prostredi.md", "docs/reference", "docs/reference/prostredi.md"),
          "proměnné prostředí a konfigurace klienta",
          "validační schémata",
        ],
        [
          link("databaze/", "docs/reference", "docs/reference/databaze/README.md"),
          "tabulky, sloupce, vazby, indexy, migrace",
          "Drizzle schéma, žurnály migrací",
        ],
        [
          link("udalosti-a-ulohy.md", "docs/reference", "docs/reference/udalosti-a-ulohy.md"),
          "plánované úlohy, druhy upozornění, události rozšíření",
          "registr úloh, zdroje",
        ],
        [
          link("trasy.md", "docs/reference", "docs/reference/trasy.md"),
          "stránky, route handlery, serverové akce",
          "`apps/web/src/app`",
        ],
        [
          link("exporty-a-importy.md", "docs/reference", "docs/reference/exporty-a-importy.md"),
          "exporty seznamů, PDF, kanály, příjem dat zvenčí",
          "registry a trasy",
        ],
        [
          link("api/", "docs/reference", "docs/reference/api/README.md"),
          `API referenční stránky (${count(/^docs\/reference\/api\/.+\/.+\.md$/)} vstupních bodů balíčků)`,
          "TSDoc ve zdrojích",
        ],
      ],
    ),
    "Co se z kódu zjistit nedá (logika zakázky, pravidla výpočtů, postupy práce), popisují ručně psané [moduly](../INDEX.md#moduly-vyprávěcí-dokumentace).",
  );
}
