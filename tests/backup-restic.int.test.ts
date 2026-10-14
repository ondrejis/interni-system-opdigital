import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const run = promisify(execFile);
const script = path.resolve(import.meta.dirname, "../deploy/scripts/backup-tool.sh");

/*
  Zálohovací nástroj proti SKUTEČNÉMU resticu s lokálním souborovým repozitářem (ne S3) a skutečnému PostgreSQL:
  záloha → změna dat → obnova → shoda, zkouška obnovy, druhý snapshot, kontrola integrity a špatné heslo.
  Test se přeskočí, když restic, pg_dump nebo jq nejsou k dispozici (v CI je instaluje job `check`).
*/

const admin = new URL(inject("rebarDb").admin);
const scratch = `backup_restic_${Math.random().toString(36).slice(2, 8)}`;
let root: string;
let sql: ReturnType<typeof postgres>;
let src: ReturnType<typeof postgres>;
let available = true;

function env(over: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // flock není na macOS; na Linuxu (CI) se použije skutečný
    PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
    PGHOST: admin.hostname,
    PGPORT: admin.port || "5432",
    PGUSER: decodeURIComponent(admin.username),
    ...(admin.password ? { PGPASSWORD: decodeURIComponent(admin.password) } : {}),
    PGDATABASE: scratch,
    RESTIC_REPOSITORY: path.join(root, "repo"),
    RESTIC_PASSWORD: "ci-restic-heslo",
    BACKUP_STATUS_FILE: path.join(root, "status", "backup.json"),
    BACKUP_WORK: path.join(root, "work"),
    FILES_DIR: path.join(root, "files"),
    ...over,
  };
}

async function tool(args: string[], over: Record<string, string> = {}) {
  try {
    const r = await run("bash", [script, ...args], { env: env(over) });
    return { code: 0, out: r.stdout + r.stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}
const status = () => JSON.parse(fs.readFileSync(path.join(root, "status", "backup.json"), "utf8"));
const restic = (...args: string[]) => run("restic", args, { env: env() });
/** Obnova zakládá databázi znovu a ukončí otevřená spojení; po ní se k ní připojíme znovu. */
const reconnect = async () => {
  await src.end().catch(() => undefined);
  src = postgres(inject("rebarDb").admin.replace(/\/[^/]*$/, `/${scratch}`), {
    max: 1,
    onnotice: () => {},
  });
};
const counts = async () => {
  const [{ f }] = (await src`select count(*)::int as f from firmy`) as [{ f: number }];
  const [{ z }] = (await src`select count(*)::int as z from zakazky`) as [{ z: number }];
  return [f, z];
};

beforeAll(async () => {
  try {
    await run("restic", ["version"]);
    await run("pg_dump", ["--version"]);
    await run("jq", ["--version"]);
  } catch {
    available = false;
    return;
  }
  root = fs.mkdtempSync(path.join(os.tmpdir(), "backup-restic-"));
  fs.mkdirSync(path.join(root, "bin"));
  fs.mkdirSync(path.join(root, "files"));
  try {
    await run("flock", ["--version"]);
  } catch {
    fs.writeFileSync(path.join(root, "bin", "flock"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  }
  fs.writeFileSync(path.join(root, "files", "a.txt"), "soubor A");
  fs.mkdirSync(path.join(root, "files", "podslozka"));
  fs.writeFileSync(path.join(root, "files", "podslozka", "b.txt"), "soubor B");

  const base = inject("rebarDb").admin;
  sql = postgres(base, { max: 1, onnotice: () => {} });
  await sql.unsafe(
    `CREATE DATABASE "${scratch}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'cs-CZ' LOCALE 'en_US.UTF-8'`,
  );
  src = postgres(base.replace(/\/[^/]*$/, `/${scratch}`), { max: 1, onnotice: () => {} });
  await src.unsafe(`
    create table firmy (id serial primary key, nazev text);
    create table zakazky (id serial primary key, nazev text);
    insert into firmy (nazev) select 'Firma ' || g from generate_series(1, 50) g;
    insert into zakazky (nazev) select 'Zakázka ' || g from generate_series(1, 120) g;`);
});

afterAll(async () => {
  if (!available) return;
  await src.end();
  await sql.unsafe(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`);
  await sql.end();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("zálohovací nástroj se skutečným resticem (lokální repozitář)", () => {
  it("první záloha inicializuje šifrovaný repozitář a vytvoří snapshot", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await tool(["backup"]);
    expect(r.out).toMatch(/Inicializuji restic repozitář/);
    expect(r.out).toMatch(/Záloha hotová/);
    expect(r.code).toBe(0);
    const snaps = JSON.parse((await restic("snapshots", "--json")).stdout) as {
      tags: string[];
      paths: string[];
    }[];
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.tags).toContain("daily");
    expect(snaps[0]!.paths).toContain(path.join(root, "files"));
    expect(status().lastSnapshot).toMatch(/^[0-9a-f]{8}$/);
    // repozitář je šifrovaný: bez hesla ho nikdo nepřečte
    await expect(
      run("restic", ["snapshots"], { env: env({ RESTIC_PASSWORD: "spatne-heslo" }) }),
    ).rejects.toThrow();
  });

  it("zkouška obnovy ze skutečného snapshotu projde", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await tool(["restore-test"]);
    expect(r.out).toMatch(/obnoveno 2 tabulek, počty záznamů sedí/);
    expect(r.code).toBe(0);
    expect(status().restoreTest).toMatchObject({ ok: true });
  });

  it("obnova vrátí databázi i soubory do stavu zálohy a odstraní, co vzniklo po ní", async (ctx) => {
    if (!available) return ctx.skip();
    await src.unsafe(
      `delete from firmy; delete from zakazky where id > 10; insert into firmy (nazev) values ('nová')`,
    );
    fs.rmSync(path.join(root, "files", "a.txt"));
    fs.writeFileSync(path.join(root, "files", "podslozka", "b.txt"), "změněno po záloze");
    fs.writeFileSync(path.join(root, "files", "navic.txt"), "vznikl po záloze");
    expect(await counts()).toEqual([1, 10]);

    await src.end(); // obnova databázi zakládá znovu
    const r = await tool(["restore"]);
    expect(r.out).toMatch(/Obnova hotová/);
    expect(r.code).toBe(0);
    await reconnect();
    expect(await counts()).toEqual([50, 120]);
    expect(fs.readFileSync(path.join(root, "files", "a.txt"), "utf8")).toBe("soubor A");
    expect(fs.readFileSync(path.join(root, "files", "podslozka", "b.txt"), "utf8")).toBe(
      "soubor B",
    );
    expect(fs.existsSync(path.join(root, "files", "navic.txt"))).toBe(false);
  });

  it("druhá záloha vytvoří druhý snapshot a repozitář projde kontrolou integrity", async (ctx) => {
    if (!available) return ctx.skip();
    await src.unsafe(`insert into firmy (nazev) values ('přibyla')`);
    expect((await tool(["backup"])).code).toBe(0);
    const snaps = JSON.parse((await restic("snapshots", "--json")).stdout) as unknown[];
    expect(snaps).toHaveLength(2);
    await expect(restic("check", "--read-data")).resolves.toBeTruthy();
    // obnova konkrétního (prvního) snapshotu vrací stav před změnou
    const first = (
      JSON.parse((await restic("snapshots", "--json")).stdout) as { short_id: string }[]
    )[0]!;
    await src.end();
    expect((await tool(["restore", first.short_id])).code).toBe(0);
    await reconnect();
    expect(await counts()).toEqual([50, 120]);
  });

  it("zkouška obnovy selže, když je dump poškozený", async (ctx) => {
    if (!available) return ctx.skip();
    // nový repozitář s poškozeným obsahem: snapshot bez dumpu
    const bad = path.join(root, "repo-bad");
    const dir = path.join(root, "empty");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "nic"), "x");
    const e = env({ RESTIC_REPOSITORY: bad });
    await run("restic", ["init"], { env: e });
    await run("restic", ["backup", dir, "--host", "system", "--tag", "daily"], { env: e });
    const r = await tool(["restore-test"], { RESTIC_REPOSITORY: bad });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/SELHALA/);
    expect(status().restoreTest).toMatchObject({ ok: false });
  });
});
