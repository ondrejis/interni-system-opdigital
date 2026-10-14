import { describe, expect, it } from "vitest";
import { build } from "../scripts/docs/build";

/*
  Rychlá kontrola generátoru dokumentace (bez API reference, ta je pomalá a kryje ji `pnpm docs:check`):
  výstup je deterministický, úplný a bez zbytků po chybách (`undefined`, `[object Object]`).
  Aktuálnost vůči commitnutým souborům hlídá `pnpm docs:check`.
*/
describe("generátor dokumentace z kódu", () => {
  it("dvě generování nad stejným kódem dají stejný výstup", async () => {
    const a = await build("runtime");
    const b = await build("runtime");
    expect([...b.keys()]).toEqual([...a.keys()]);
    for (const [file, content] of a) expect(b.get(file), file).toBe(content);
  }, 60_000);

  it("pokrývá všechny oblasti a nemá zbytky po chybách", async () => {
    const out = await build("runtime");
    const files = [...out.keys()];
    for (const required of [
      "docs/reference/opravneni.md",
      "docs/reference/prostredi.md",
      "docs/reference/trasy.md",
      "docs/reference/udalosti-a-ulohy.md",
      "docs/reference/exporty-a-importy.md",
      "docs/reference/databaze/README.md",
      "docs/reference/entity/README.md",
      "docs/reference/prikazy/README.md",
      "docs/reference/moduly/README.md",
    ])
      expect(files, required).toContain(required);

    const bad: string[] = [];
    for (const [file, content] of out) {
      if (!content.endsWith("\n") || content.endsWith("\n\n")) bad.push(`${file}: konec souboru`);
      if (/\[object Object\]|\bundefined\b|\bNaN\b/.test(content))
        bad.push(`${file}: zbytek po chybě`);
      if (!file.startsWith("docs/moduly/") && !content.includes("pnpm docs:generate"))
        bad.push(`${file}: chybí hlavička generovaného souboru`);
      if (/\d{4}-\d{2}-\d{2}T\d{2}:/.test(content)) bad.push(`${file}: časové razítko`);
      if (content.includes(process.cwd())) bad.push(`${file}: absolutní cesta`);
    }
    expect(bad).toEqual([]);
  }, 60_000);
});
