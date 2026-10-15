import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import postgres from "postgres";
import { MODULE_IDS } from "@rebar/core";
import { runMigrations } from "@rebar/core/migrations";
import { migrationSources } from "@rebar/core/migrations";
import { coreJobs } from "@rebar/core/jobs";
import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";

const run = promisify(execFile);
const script = path.resolve(import.meta.dirname, "../deploy/scripts/backup-tool.sh");

/*
  Zálohovací nástroj proti skutečnému PostgreSQL (pg_dump, pg_restore, createdb) a s napodobeninou resticu, která
  ukládá snapshoty do složky. Ověřuje logiku skriptu: záloha, retenci nevolá, stavový soubor, zkoušku obnovy
  (včetně selhání při nesouhlasu počtů), obnovu a chování bez nastavení.
*/

const admin = new URL(inject("rebarDb").admin);
const scratch = `backup_src_${Math.random().toString(36).slice(2, 8)}`;
let root: string;
let sql: ReturnType<typeof postgres>;

const FAKE_RESTIC = `#!/usr/bin/env bash
# Napodobenina resticu: snapshot = složka v $RESTIC_REPOSITORY s kopií zadaných cest.
set -eu
repo="$RESTIC_REPOSITORY"
cmd="$1"; shift
latest() { ls -1d "$repo"/snap-* 2>/dev/null | sort | tail -1; }
case "$cmd" in
  cat) [ -f "$repo/config" ] ;;
  init) mkdir -p "$repo"; : >"$repo/config" ;;
  backup)
    paths=()
    while [ $# -gt 0 ]; do
      case "$1" in
        --tag|--host) shift 2 ;;
        --*) shift ;;
        *) paths+=("$1"); shift ;;
      esac
    done
    snap="$repo/snap-$(date +%s%N)"
    for p in "\${paths[@]}"; do mkdir -p "$snap$(dirname "$p")"; cp -R "$p" "$snap$p"; done
    ;;
  forget|check) ;;
  snapshots) echo '[{"short_id":"abc12345"}]' ;;
  restore)
    shift
    target=""; includes=()
    while [ $# -gt 0 ]; do
      case "$1" in
        --target) target="$2"; shift 2 ;;
        --include) includes+=("$2"); shift 2 ;;
        --host) shift 2 ;;
        *) shift ;;
      esac
    done
    snap="$(latest)"
    [ -n "$snap" ] || { echo "žádný snapshot" >&2; exit 1; }
    for p in "\${includes[@]}"; do
      [ -e "$snap$p" ] || continue
      mkdir -p "$target$(dirname "$p")"
      if [ -d "$snap$p" ]; then mkdir -p "$target$p"; cp -R "$snap$p/." "$target$p/"; else cp "$snap$p" "$target$p"; fi
    done
    ;;
  *) echo "nepodporováno: $cmd" >&2; exit 1 ;;
esac
`;

function env(over: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
    PGHOST: admin.hostname,
    PGPORT: admin.port || "5432",
    PGUSER: decodeURIComponent(admin.username),
    ...(admin.password ? { PGPASSWORD: decodeURIComponent(admin.password) } : {}),
    PGDATABASE: scratch,
    RESTIC_REPOSITORY: path.join(root, "repo"),
    RESTIC_PASSWORD: "test",
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

let available = true;
beforeAll(async () => {
  try {
    await run("pg_dump", ["--version"]);
    await run("jq", ["--version"]);
  } catch {
    available = false;
    return;
  }
  root = fs.mkdtempSync(path.join(os.tmpdir(), "backup-tool-"));
  fs.mkdirSync(path.join(root, "bin"));
  fs.mkdirSync(path.join(root, "files"));
  fs.writeFileSync(path.join(root, "bin", "restic"), FAKE_RESTIC, { mode: 0o755 });
  fs.writeFileSync(path.join(root, "bin", "flock"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  fs.writeFileSync(path.join(root, "files", "a.txt"), "soubor A");
  fs.writeFileSync(path.join(root, "files", "b.txt"), "soubor B");

  const base = inject("rebarDb").admin;
  sql = postgres(base, { max: 1, onnotice: () => {} });
  await sql.unsafe(
    `CREATE DATABASE "${scratch}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'cs-CZ' LOCALE 'en_US.UTF-8'`,
  );
  const src = postgres(base.replace(/\/[^/]*$/, `/${scratch}`), { max: 1, onnotice: () => {} });
  await src.unsafe(`
    create table firmy (id serial primary key, nazev text);
    create table zakazky (id serial primary key, nazev text);
    insert into firmy (nazev) select 'Firma ' || g from generate_series(1, 50) g;
    insert into zakazky (nazev) select 'Zakázka ' || g from generate_series(1, 120) g;`);
  await src.end();
});

afterAll(async () => {
  if (!available) return;
  await sql.unsafe(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`);
  await sql.end();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("zálohovací nástroj", () => {
  it("bez nastavení repozitáře skončí chybou a nic nezapíše", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await tool(["backup"], { RESTIC_REPOSITORY: "", RESTIC_PASSWORD: "" });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/zálohy nejsou nastavené/);
    expect(fs.existsSync(path.join(root, "status", "backup.json"))).toBe(false);
  });

  it("záloha uloží dump i soubory, zapíše stav a uklidí pracovní soubory", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await tool(["backup"]);
    expect(r.out).toMatch(/Záloha hotová/);
    expect(r.code).toBe(0);
    const s = status();
    expect(new Date(s.lastSuccessAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(s).toMatchObject({ lastSnapshot: "abc12345", snapshots: 1 });
    expect(s.dumpBytes).toBeGreaterThan(100);
    expect(fs.existsSync(path.join(root, "work", "db.dump"))).toBe(false);
    const snap = fs.readdirSync(path.join(root, "repo")).find((n) => n.startsWith("snap-"))!;
    const counts = fs.readFileSync(
      path.join(root, "repo", snap, root, "work", "db.counts.tsv"),
      "utf8",
    );
    expect(counts).toContain("firmy\t50");
    expect(counts).toContain("zakazky\t120");
  });

  it("zkouška obnovy obnoví zálohu do dočasné databáze, ověří počty a databázi smaže", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await tool(["restore-test"]);
    expect(r.out).toMatch(/obnoveno 2 tabulek, počty záznamů sedí/);
    expect(r.code).toBe(0);
    expect(status().restoreTest).toMatchObject({ ok: true });
    expect(status().lastSuccessAt).toBeTruthy(); // stav zálohy zůstal
    const left = await sql`select datname from pg_database where datname like 'restore_test_%'`;
    expect(left).toHaveLength(0);
  });

  it("zkouška obnovy selže, když počty v záloze nesedí s obnovenými", async (ctx) => {
    if (!available) return ctx.skip();
    const snap = fs.readdirSync(path.join(root, "repo")).find((n) => n.startsWith("snap-"))!;
    const file = path.join(root, "repo", snap, root, "work", "db.counts.tsv");
    const original = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, original.replace("firmy\t50", "firmy\t5000"));
    try {
      const r = await tool(["restore-test"]);
      expect(r.code).not.toBe(0);
      expect(r.out).toMatch(/SELHALA/);
      expect(status().restoreTest).toMatchObject({ ok: false });
      expect(status().restoreTest.detail).toMatch(/firmy: obnoveno 50, v záloze 5000/);
    } finally {
      fs.writeFileSync(file, original);
    }
  });

  it("obnova vrátí databázi i soubory do stavu zálohy (i smazané, a odstraní nové)", async (ctx) => {
    if (!available) return ctx.skip();
    const src = postgres(inject("rebarDb").admin.replace(/\/[^/]*$/, `/${scratch}`), {
      max: 1,
      onnotice: () => {},
    });
    await src.unsafe(
      `delete from firmy; delete from zakazky where id > 10; insert into firmy (nazev) values ('nová')`,
    );
    fs.rmSync(path.join(root, "files", "a.txt"));
    fs.writeFileSync(path.join(root, "files", "navic.txt"), "vznikl po záloze");

    await src.end(); // obnova databázi zakládá znovu, otevřená spojení by ukončila
    const r = await tool(["restore"]);
    expect(r.out).toMatch(/Obnova hotová/);
    expect(r.code).toBe(0);
    const src2 = postgres(inject("rebarDb").admin.replace(/\/[^/]*$/, `/${scratch}`), {
      max: 1,
      onnotice: () => {},
    });
    const [{ f }] = (await src2`select count(*)::int as f from firmy`) as [{ f: number }];
    const [{ z }] = (await src2`select count(*)::int as z from zakazky`) as [{ z: number }];
    expect([f, z]).toEqual([50, 120]);
    await src2.end();
    expect(fs.readFileSync(path.join(root, "files", "a.txt"), "utf8")).toBe("soubor A");
    expect(fs.existsSync(path.join(root, "files", "navic.txt"))).toBe(false);
  });

  it("neúspěšná záloha zapíše chybu, ale zachová čas poslední úspěšné", async (ctx) => {
    if (!available) return ctx.skip();
    const before = status().lastSuccessAt;
    const r = await tool(["backup"], { PGDATABASE: "neexistuje_tahle_databaze" });
    expect(r.code).not.toBe(0);
    const s = status();
    expect(s.lastSuccessAt).toBe(before);
    expect(s.lastFailureAt).toBeTruthy();
    expect(s.lastError).toMatch(/záloha selhala/);
    // další úspěšná záloha chybu smaže
    expect((await tool(["backup"])).code).toBe(0);
    expect(status().lastError).toBeUndefined();
  });

  it("neznámý příkaz vypíše nápovědu", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await tool(["neco"]);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/Použití/);
  });

  it("celé skutečné schéma (rozšíření, generované sloupce, fronta) projde zálohou a zkouškou obnovy pod rolemi jako v provozu", async (ctx) => {
    if (!available) return ctx.skip();
    const suffix = Math.random().toString(36).slice(2, 8);
    const owner = `bk_owner_${suffix}`;
    const appRole = `bk_app_${suffix}`;
    const db = `bk_full_${suffix}`;
    // stejný model rolí jako deploy/postgres/init-roles.sh: vlastník schématu s CREATEDB, aplikační role bez DDL
    await sql.unsafe(`CREATE ROLE "${owner}" LOGIN CREATEDB PASSWORD 'pw'`);
    await sql.unsafe(`CREATE ROLE "${appRole}" LOGIN PASSWORD 'pw'`);
    await sql.unsafe(
      `CREATE DATABASE "${db}" OWNER "${owner}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'cs-CZ' LOCALE 'en_US.UTF-8'`,
    );
    try {
      const url = new URL(inject("rebarDb").admin);
      url.username = owner;
      url.password = "pw";
      url.pathname = `/${db}`;
      await runMigrations({
        url: url.toString(),
        appRole,
        queues: coreJobs,
        folders: migrationSources(path.resolve(import.meta.dirname, ".."), MODULE_IDS),
      });
      const over = { PGDATABASE: db, PGUSER: owner, PGPASSWORD: "pw" };
      const backup = await tool(["backup"], over);
      expect(backup.out).toMatch(/Záloha hotová/);
      expect(backup.code).toBe(0);
      const test = await tool(["restore-test"], over);
      expect(test.out).toMatch(/obnoveno \d+ tabulek, počty záznamů sedí/);
      expect(test.code).toBe(0);
      // skutečná obnova přes existující databázi (dělené tabulky fronty pg-boss, rozšíření, generované sloupce)
      const restore = await tool(["restore"], over);
      expect(restore.out).toMatch(/Obnova hotová/);
      expect(restore.code).toBe(0);
    } finally {
      await sql.unsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
      await sql.unsafe(`DROP ROLE IF EXISTS "${owner}"`);
      await sql.unsafe(`DROP ROLE IF EXISTS "${appRole}"`);
    }
  });
});
