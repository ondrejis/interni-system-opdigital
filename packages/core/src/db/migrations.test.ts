import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CORE_MIGRATIONS } from "./migrate";
import { migrationSources } from "./migrations";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "opsys-migrations-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const withJournal = (id: string) => {
  const dir = path.join(root, "packages", "modules", id, "drizzle", "meta");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "_journal.json"), "{}");
};

describe("migrationSources", () => {
  it("jádro je první, modul bez migrací (prázdná kostra) se přeskočí a pořadí drží MODULE_IDS", () => {
    withJournal("kontakty");
    withJournal("zakazky");
    fs.mkdirSync(path.join(root, "packages", "modules", "klienti", "drizzle"), { recursive: true });
    const sources = migrationSources(root, ["kontakty", "klienti", "zakazky", "disk"]);
    expect(sources.map((s) => s.table)).toEqual([
      undefined,
      "__drizzle_migrations_kontakty",
      "__drizzle_migrations_zakazky",
    ]);
    expect(sources[0]!.folder).toBe(CORE_MIGRATIONS);
  });

  it("pomlčka v id modulu se v názvu tabulky záznamu migrací nahradí podtržítkem", () => {
    withJournal("muj-prostor");
    withJournal("sablony-emailu");
    const tables = migrationSources(root, ["sablony-emailu", "muj-prostor"]).map((s) => s.table);
    expect(tables).toEqual([
      undefined,
      "__drizzle_migrations_sablony_emailu",
      "__drizzle_migrations_muj_prostor",
    ]);
    for (const t of tables.filter(Boolean)) expect(t).toMatch(/^[a-z_]+$/);
  });
});
