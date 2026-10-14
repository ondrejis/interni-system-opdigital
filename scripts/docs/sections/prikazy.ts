import { definitionOf, summary } from "../lib/corpus";
import { anchor, code, doc, generatedHeader, link, table, text } from "../lib/md";
import { asArray, commandsOf, type Runtime } from "../lib/runtime";
import { FIELD_HEADERS, fieldRows, schemaFields } from "../lib/zod-fields";

const DIR = "docs/reference/prikazy";

/** Serverové příkazy modulů: oprávnění a vstupní schéma jako tabulka polí. */
export function commandDocs(rt: Runtime): Record<string, string> {
  const out: Record<string, string> = {};
  const perModule = new Map<string, string[][]>();

  const groups = [
    ...rt.manifests.map((m) => ({
      id: m.id,
      name: m.name,
      ref: `docs/reference/moduly/${m.id}.md`,
      commands: commandsOf(rt.servers.get(m.id)),
    })),
    {
      id: "jadro",
      name: "Platforma (jádro)",
      ref: "docs/reference/moduly/jadro.md",
      commands: [...rt.platformCommands.values()],
    },
  ];
  for (const m of groups) {
    const commands = [...m.commands].sort((a, b) => (a.name < b.name ? -1 : 1));
    if (!commands.length) continue;
    const blocks = commands.map((c) => {
      const def = definitionOf("defineCommand", c.name);
      const perms = asArray(c.permission);
      const { fields, error } = schemaFields(c.input);
      const rows = perModule.get(m.id) ?? [];
      perModule.set(m.id, rows);
      rows.push([
        link(code(c.name), DIR, `${DIR}/${m.id}.md#${anchor(c.name)}`),
        perms.length ? perms.map((p) => code(p)).join(" nebo ") : "přihlášení",
        text(summary(def?.doc)),
      ]);
      return doc(
        `### ${c.name}`,
        summary(def?.doc) ? text(def!.doc!.description) : "",
        [
          `- **Oprávnění:** ${
            perms.length
              ? `${perms.map((p) => code(p)).join(" nebo ")} (stačí kterékoli)`
              : "stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))"
          }`,
          def ? `- **Definice:** ${code(def.file)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        error
          ? error
          : fields.length
            ? table([...FIELD_HEADERS], fieldRows(fields, code, text))
            : "_Bez vstupních polí._",
      );
    });
    out[`${DIR}/${m.id}.md`] = doc(
      m.id === "jadro" ? "# Příkazy platformy (jádro)" : `# Příkazy modulu ${m.name}`,
      generatedHeader("registr příkazů (`ModuleServer.commands`) a jejich Zod schémata"),
      `Příkaz je pojmenovaná akce nebo dotaz volaný z UI (\`api.command(name, input)\`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: ${link(m.name, DIR, m.ref)}. Počet příkazů: ${commands.length}.`,
      ...blocks,
    );
  }
  out[`${DIR}/README.md`] = doc(
    "# Serverové příkazy",
    generatedHeader("registry příkazů všech modulů"),
    `Všechny příkazy modulů (${[...perModule.values()].reduce((n, r) => n + r.length, 0)}) s oprávněním; vstupní pole jsou v souboru modulu.`,
    ...groups
      .filter((m) => perModule.has(m.id))
      .map((m) =>
        doc(
          `## ${m.name}`,
          `Podrobně: ${link(`prikazy/${m.id}.md`, DIR, `${DIR}/${m.id}.md`)}.`,
          table(["Příkaz", "Oprávnění", "Popis"], perModule.get(m.id)!),
        ),
      ),
  );
  return out;
}
