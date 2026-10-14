import { asArray, commandsOf, type Runtime } from "../lib/runtime";
import { code, doc, generatedHeader, table, text } from "../lib/md";

/** Oprávnění a matice výchozích rolí. */
export function permissionsDoc(rt: Runtime): Record<string, string> {
  const roles = rt.defaultRoles;
  const catalog = new Map(rt.permissions.map((p) => [p.key, p]));

  const scopeOf = (role: (typeof roles)[number], key: string): string => {
    if (role.isSystem) return "vše";
    const s = role.permissions?.[key];
    return s === undefined ? "" : s === true || s === "all" ? "vše" : "moje";
  };

  // použití oprávnění: kdo je vyžaduje
  type Use = {
    entities: string[];
    attributes: string[];
    commands: string[];
    nav: string[];
    other: string[];
  };
  const uses = new Map<string, Use>();
  const use = (key: string): Use => {
    let u = uses.get(key);
    if (!u) uses.set(key, (u = { entities: [], attributes: [], commands: [], nav: [], other: [] }));
    return u;
  };
  for (const m of rt.manifests) {
    for (const n of m.nav) for (const k of asArray(n.permission)) use(k).nav.push(n.href);
    for (const p of m.pages ?? []) for (const k of asArray(p.permission)) use(k).nav.push(p.path);
    const server = rt.servers.get(m.id);
    for (const e of server?.entities ?? []) {
      for (const [op, key] of Object.entries(e.permissions))
        if (key) use(key).entities.push(`${e.key} (${op})`);
      for (const a of e.attributes)
        if (a.permission) use(a.permission).attributes.push(`${e.key}.${a.key}`);
    }
    for (const c of commandsOf(server))
      for (const k of asArray(c.permission)) use(k).commands.push(c.name);
  }
  for (const c of rt.platformCommands.values())
    for (const k of asArray(c.permission)) use(k).commands.push(c.name);

  const unknown = [...uses.keys()].filter((k) => !catalog.has(k) && k !== "account.self").sort();

  const groups = ["core", ...rt.manifests.map((m) => m.id)];
  const ownerLabel = (o: string) =>
    o === "core" ? "Platforma (jádro)" : `Modul ${rt.manifests.find((m) => m.id === o)?.name ?? o}`;

  const catalogBlocks = groups.map((g) => {
    const perms = rt.permissions.filter((p) => p.owner === g);
    if (!perms.length) return "";
    return doc(
      `### ${ownerLabel(g)}`,
      table(
        ["Klíč", "Název", "Popis", ...roles.map((r) => `Výchozí: ${r.key}`)],
        perms.map((p) => [
          code(p.key),
          text(p.label),
          text(p.description ?? ""),
          ...roles.map((r) => scopeOf(r, p.key)),
        ]),
      ),
    );
  });

  const usageRows = [...rt.permissions]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((p) => {
      const u = uses.get(p.key);
      const list = (xs: string[] | undefined, max = 6) =>
        !xs?.length
          ? ""
          : xs.length <= max
            ? xs.map((x) => code(x)).join(", ")
            : `${xs
                .slice(0, max)
                .map((x) => code(x))
                .join(", ")} a dalších ${xs.length - max}`;
      return [
        code(p.key),
        list(u?.entities),
        list(u?.attributes),
        u?.commands.length ? String(u.commands.length) : "",
        list([...(u?.nav ?? []), ...(u?.other ?? [])]),
      ];
    });

  const matrixIntro = roles
    .map(
      (r) =>
        `- ${code(r.key)}: ${text(r.name)}${r.description ? ` (${text(r.description)})` : ""}${r.isSystem ? ", systémová role se všemi oprávněními" : ""}`,
    )
    .join("\n");

  const content = doc(
    "# Oprávnění a výchozí role",
    generatedHeader(
      "katalog oprávnění z manifestů a `CORE_PERMISSIONS`, výchozí role z `DEFAULT_ROLES`, použití z entit, příkazů a navigace",
    ),
    "Oprávnění je klíč `<modul>.<akce>` (platformní mají vlastní prefix). Role je pojmenovaná sada oprávnění; každé oprávnění v roli má **rozsah**: " +
      "`vše` = všechny záznamy, `moje` = jen vlastní a přidělené záznamy (viz [ADR 007](../adr/007-opravneni-v-datove-vrstve.md)). " +
      "Majitel (systémová role `owner`) má všechna oprávnění zapnutých modulů. Role se po prvním založení spravují v administraci, tabulka níže je jen **výchozí stav ze seedu** (`DEFAULT_ROLES`); klient může seed upravit.",
    "## Výchozí role",
    matrixIntro,
    "## Katalog oprávnění a matice výchozích rolí",
    "Prázdná buňka = role oprávnění nemá.",
    ...catalogBlocks,
    "## Kde se oprávnění vyžaduje",
    "Přehled z registru entit, příkazů, navigace a stránek. Sloupec Příkazy je počet příkazů, které oprávnění vyžadují (stačí kterékoli z uvedených, viz [příkazy](prikazy/README.md)).",
    table(
      ["Oprávnění", "Entity (operace)", "Atributy entit", "Příkazy", "Navigace, stránky, dlaždice"],
      usageRows,
    ),
    unknown.length
      ? doc(
          "## Oprávnění použitá v kódu, ale chybějící v katalogu",
          "Tohle je chyba v kódu: oprávnění se vyžaduje, ale žádný manifest ho nedefinuje.",
          unknown.map((k) => `- ${code(k)}`).join("\n"),
        )
      : "## Kontrola konzistence\nVšechna oprávnění vyžadovaná entitami, příkazy, navigací a stránkami jsou v katalogu.",
  );
  return { "docs/reference/opravneni.md": content };
}
