import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../apps/web/src/server/env";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const compose = read("deploy/docker-compose.yml");
const envExample = read("deploy/.env.example");

/** Klíče v deploy/.env.example (včetně prázdných). */
const exampleKeys = new Set(
  envExample
    .split("\n")
    .map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l)?.[1])
    .filter((k): k is string => !!k),
);

describe("provozní skripty", () => {
  const dir = path.join(root, "deploy/scripts");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sh"))) {
    it(`${file} je platný bash a je spustitelný`, () => {
      execFileSync("bash", ["-n", path.join(dir, file)]);
      expect(fs.statSync(path.join(dir, file)).mode & 0o111).not.toBe(0);
    });
  }
  it("init-roles.sh pro Postgres je platný sh", () => {
    execFileSync("sh", ["-n", path.join(root, "deploy/postgres/init-roles.sh")]);
  });

  it("install.sh dělá, co zadání požaduje", () => {
    const s = read("deploy/scripts/install.sh");
    expect(s).toMatch(/ufw allow 22\/tcp/);
    expect(s).toMatch(/ufw allow 80\/tcp/);
    expect(s).toMatch(/ufw allow 443\/tcp/);
    expect(s).toMatch(/fail2ban/);
    expect(s).toMatch(/unattended-upgrades/);
    expect(s).toMatch(/-security/);
    expect(s).toMatch(/fallocate -l 2G|bs=1M count=2048/);
    expect(s).toMatch(/dc run --rm migrate/);
    // idempotence: tajemství se generují jen když chybí
    expect(s).toMatch(/set_once AUTH_SECRET/);
    expect(s).toMatch(/set_once DB_APP_PASSWORD/);
  });

  it("update.sh zálohuje před změnou, migruje před restartem a vrací se při selhání", () => {
    const s = read("deploy/scripts/update.sh");
    const order = [
      "backup.sh",
      "dc pull",
      "dc run --rm migrate",
      'env_set APP_TAG "$new"',
      "wait_app_healthy",
      "rollback",
    ];
    let at = 0;
    for (const marker of order) {
      const i = s.indexOf(marker, at);
      expect(i, marker).toBeGreaterThanOrEqual(at);
      at = i;
    }
    expect(s).toMatch(/tee -a "\$LOG_DIR\/update-/);
  });
});

describe("nanečisto (--dry-run)", () => {
  const scripts = path.join(root, "deploy/scripts");
  it("update.sh vypíše plán a nic nezapíše ani nespustí", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-dry-"));
    fs.cpSync(path.join(root, "deploy"), dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".env"), "APP_TAG=v1.0.0\n");
    const out = execFileSync(path.join(dir, "scripts/update.sh"), ["v1.1.0", "--dry-run"], {
      encoding: "utf8",
    });
    expect(out).toMatch(/aktualizace v1\.0\.0 → v1\.1\.0/);
    expect(out).toMatch(/migrace databáze/);
    expect(fs.readFileSync(path.join(dir, ".env"), "utf8")).toBe("APP_TAG=v1.0.0\n");
    expect(fs.existsSync(path.join(dir, "logs"))).toBe(false);
    expect(() =>
      execFileSync(path.join(dir, "scripts/update.sh"), ["spatna", "--dry-run"], { stdio: "pipe" }),
    ).toThrow();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it("install.sh zkontroluje parametry bez práv roota a bez Dockeru", () => {
    const args = [
      "--dry-run",
      "--domain",
      "system.klient.cz",
      "--acme-email",
      "info@klient.cz",
      "--client",
      "opsys",
      "--image",
      "ghcr.io/x/y",
      "--backup-image",
      "ghcr.io/x/b",
      "--version",
      "v1.0.0",
    ];
    const out = execFileSync(path.join(scripts, "install.sh"), args, { encoding: "utf8" });
    expect(out).toMatch(/instalace opsys v1\.0\.0 na https:\/\/system\.klient\.cz/);
    expect(() =>
      execFileSync(path.join(scripts, "install.sh"), [...args, "--version", "1.0"], {
        stdio: "pipe",
      }),
    ).toThrow();
  });
});

describe("docker-compose.yml", () => {
  it("na serveru se nic nebuilduje", () => {
    expect(compose).not.toMatch(/^\s+build:/m);
  });

  it("databáze není vystavená ven a je jen ve vnitřní síti bez přístupu k internetu", () => {
    const pg = compose.slice(
      compose.indexOf("\n  postgres:"),
      compose.indexOf("\n  # Jednorázové nástroje"),
    );
    expect(pg).not.toMatch(/\bports:/);
    expect(pg).toMatch(/networks: \[internal\]/);
    expect(compose).toMatch(/internal:\n\s+internal: true/);
  });

  it("vše, na co se odkazuje přes ${PROMĚNNÁ}, je ve vzoru .env.example", () => {
    const used = new Set(
      [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/g)].map((m) => m[1]!),
    );
    const missing = [...used].filter(
      (k) => !exampleKeys.has(k) && !["OWNER_EMAIL", "OWNER_NAME", "OWNER_PASSWORD"].includes(k),
    );
    expect(missing).toEqual([]);
  });

  it("aplikace nedostane hesla k záloze ani superuživatele databáze", () => {
    const app = compose.slice(compose.indexOf("x-app: &app"), compose.indexOf("services:"));
    expect(app).not.toMatch(/RESTIC|AWS_|DB_SUPERUSER|env_file/);
  });

  it("prostředí aplikace stačí k tomu, aby ho validace při startu přijala", () => {
    const block = compose.slice(
      compose.indexOf("environment: &app-env"),
      compose.indexOf("  volumes:", compose.indexOf("environment: &app-env")),
    );
    const names = [...block.matchAll(/^ {4}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]!);
    const dummy: Record<string, string> = {
      AUTH_SECRET: "a".repeat(40),
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      HEALTH_TOKEN: "h".repeat(24),
      DATABASE_URL: "postgres://app:pw@postgres:5432/system",
      APP_URL: "https://system.klient.cz",
      HEARTBEAT_URL: "",
      APP_ENCRYPTION_KEYS: "",
      SENTRY_DSN: "",
    };
    const env = Object.fromEntries(names.map((n) => [n, dummy[n] ?? "x"]));
    expect(() => loadEnv({ ...env, NODE_ENV: "production" })).not.toThrow();
    expect(names).toEqual(
      expect.arrayContaining([
        "CLIENT",
        "AUTH_SECRET",
        "APP_ENCRYPTION_KEY",
        "DATABASE_URL",
        "DATABASE_MIGRATE_URL",
        "DATABASE_APP_ROLE",
      ]),
    );
  });

  it("příkazy služeb odpovídají tomu, co image obsahuje", () => {
    expect(compose).toMatch(/\/srv\/web\/apps\/web\/server\.js/);
    expect(compose).toMatch(/scripts\/worker\.ts/);
    expect(compose).toMatch(/scripts\/db-migrate\.ts/);
    expect(compose).toMatch(/scripts\/db-seed\.ts/);
    for (const s of ["caddy", "app", "worker", "postgres", "backup", "beszel-agent"])
      expect(compose, s).toMatch(new RegExp(`\\n  ${s}:`));
  });
});

describe(".env.example", () => {
  it("neobsahuje žádná skutečná tajemství", () => {
    const secrets = [
      "AUTH_SECRET",
      "APP_ENCRYPTION_KEY",
      "HEALTH_TOKEN",
      "DB_SUPERUSER_PASSWORD",
      "DB_MIGRATOR_PASSWORD",
      "DB_APP_PASSWORD",
      "VAPID_PRIVATE_KEY",
      "RESTIC_PASSWORD",
      "AWS_SECRET_ACCESS_KEY",
    ];
    for (const k of secrets) expect(envExample, k).toMatch(new RegExp(`^${k}=$`, "m"));
  });
});

describe("Caddyfile", () => {
  const caddy = read("deploy/caddy/Caddyfile");
  it("nastavuje bezpečnostní hlavičky", () => {
    for (const h of [
      "Strict-Transport-Security",
      "Content-Security-Policy",
      "X-Frame-Options",
      "Referrer-Policy",
      "X-Content-Type-Options",
    ])
      expect(caddy, h).toContain(h);
    expect(caddy).toMatch(/frame-ancestors 'none'/);
    expect(caddy).toMatch(/object-src 'none'/);
  });
  it("přepisuje X-Forwarded-For adresou klienta (omezení přihlášení podle IP, Q24)", () => {
    expect(caddy).toMatch(/header_up X-Forwarded-For \{remote_host\}/);
  });
});

describe("Docker image", () => {
  const docker = read("deploy/docker/Dockerfile");
  it("běží bez práv roota, má healthcheck a pevnou základní verzi", () => {
    expect(docker).toMatch(/^USER node$/m);
    expect(docker).toMatch(/^HEALTHCHECK /m);
    expect(docker).not.toMatch(/FROM [^\s]+:latest/);
    expect(docker).toMatch(/pnpm install --frozen-lockfile/);
  });
  it("zálohovací image nebeží jako root", () => {
    expect(read("deploy/docker/backup.Dockerfile")).toMatch(/^USER backup$/m);
  });
  it(".dockerignore nepustí do image tajemství", () => {
    const ignore = read(".dockerignore");
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/^\.git$/m);
    // přihlášené relace e2e testů (cookies) leží v apps/web/e2e*/.auth
    expect(ignore).toMatch(/^\*\*\/\.auth$/m);
  });
});

describe("CI a závislosti", () => {
  it("vydání podle tagu staví image každého klienta a nahrává do GHCR", () => {
    const rel = read(".github/workflows/release.yml");
    expect(rel).toMatch(/tags: \["v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+\*"\]/);
    expect(rel).toMatch(/ghcr\.io/);
    expect(rel).toMatch(/push: true/);
    expect(rel).toMatch(/uses: \.\/\.github\/workflows\/ci\.yml/);
  });
  it("Renovate běží týdně", () => {
    const r = JSON.parse(read("renovate.json")) as { schedule: string[] };
    expect(r.schedule.join(" ")).toMatch(/monday/);
  });
});

describe("lib.sh: zápis do .env", () => {
  it("env_set uloží hodnotu přesně (zpětná lomítka, &, $ ani `\\n` ji nepoškodí ani nerozdělí na řádky)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-env-"));
    fs.writeFileSync(path.join(dir, ".env"), "A=1\n");
    const tricky = 'ab\\cd\\nxy\\\\z&q$1"=x';
    const script = `
      source "${path.join(root, "deploy/scripts/lib.sh")}"
      ENV_FILE="${path.join(dir, ".env")}"
      env_set RESTIC_PASSWORD "$1"
      env_set RESTIC_PASSWORD "$1"
      env_get RESTIC_PASSWORD
    `;
    const out = execFileSync("bash", ["-c", script, "bash", tricky], { encoding: "utf8" });
    expect(out.trimEnd()).toBe(tricky);
    expect(fs.readFileSync(path.join(dir, ".env"), "utf8")).toBe(
      `A=1\nRESTIC_PASSWORD=${tricky}\n`,
    );
  });
});

describe("restore.sh a update.sh: bezpečné pořadí", () => {
  it("obnova zastaví i plánovač záloh (záloha uprostřed obnovy by se stala nejnovějším snapshotem)", () => {
    const s = read("deploy/scripts/restore.sh");
    expect(s).toMatch(/dc stop app worker backup/);
    expect(s.indexOf("dc stop app worker backup")).toBeLessThan(s.indexOf("dc run --rm restore"));
  });

  it("selhání restartu po migraci vede k návratu na předchozí verzi, ne k tichému konci skriptu", () => {
    const s = read("deploy/scripts/update.sh");
    expect(s).toMatch(/if ! dc up -d app worker backup caddy; then[\s\S]*?rollback/);
  });
});
