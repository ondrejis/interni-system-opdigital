/** Pomocné funkce pro skládání markdownu. Všechny jsou čisté a deterministické. */

/** Text nad každým generovaným souborem: komu patří a jak se přegeneruje. */
export function generatedHeader(source: string): string {
  return [
    "<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->",
    "",
    `> **Generovaný dokument.** Vzniká přímo z kódu (${source}). Neupravuj ho ručně: změň kód a spusť \`pnpm docs:generate\`.`,
    "> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.",
    "",
  ].join("\n");
}

/** Inline kód; správně zvládne i text s backticky. */
export function code(s: string | number | boolean | null | undefined): string {
  const v = String(s ?? "");
  if (v === "") return "";
  if (!v.includes("`")) return `\`${v}\``;
  const fence = "``";
  return `${fence} ${v} ${fence}`;
}

/** Běžný text: znaky `<` a `>` mimo kód se escapují, aby se z `<slug>` neudělala (zmizelá) HTML značka. */
export function text(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .split(/(`+[^`]*`+)/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/</g, "&lt;").replace(/>/g, "&gt;")))
    .join("");
}

/** Buňka tabulky: bez zalomení řádku, svislítko escapované. */
function cell(s: string | number | boolean | null | undefined): string {
  return String(s ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

/** Tabulka. Buňky jsou už hotový markdown (použij `code`/`text`); `table` jen ošetří zalomení a svislítka. */
export function table(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const head = `| ${headers.map(cell).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map((c) => cell(c as string)).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

/** Odrážkový seznam. */
export function bullets(items: readonly string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

/** Spojí bloky prázdnými řádky a ukončí soubor jedním novým řádkem. */
export function doc(...blocks: (string | null | undefined | false)[]): string {
  return (
    blocks
      .filter((b): b is string => typeof b === "string" && b !== "")
      .map((b) => b.replace(/\n+$/, ""))
      .join("\n\n") + "\n"
  );
}

/** Kotva nadpisu podle pravidel GitHubu (stejná jako v `tests/docs.test.ts`). */
export function anchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Odkaz na soubor v repozitáři z dokumentu ve složce `fromDir` (obě cesty od kořene repozitáře). */
export function link(label: string, fromDir: string, target: string): string {
  const [file = "", hash] = target.split("#") as [string, string | undefined];
  let r = relativePosix(fromDir, file);
  if (r === "") r = file.split("/").pop() ?? file;
  return `[${label}](${r}${hash ? `#${hash}` : ""})`;
}

/** Relativní cesta mezi dvěma cestami od kořene repozitáře (s lomítky). */
export function relativePosix(fromDir: string, to: string): string {
  const a = fromDir.split("/").filter(Boolean);
  const b = to.split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/");
}

/** Slovo podle počtu (1 / 2–4 / 5+). */
export function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

/** Seřadí podle českého abecedního pořadí, ale deterministicky nezávisle na locale stroje. */
export function byKey<T>(key: (t: T) => string): (a: T, b: T) => number {
  return (a, b) => {
    const x = key(a);
    const y = key(b);
    return x < y ? -1 : x > y ? 1 : 0;
  };
}
