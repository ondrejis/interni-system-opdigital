import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INGEST_MAX_BODY_BYTES } from "@rebar/core/ingest";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

/** Soubory nasazení, které se klientovi nebo správci ukazují. */
const deployFiles = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : deployFiles(rel);
    return [".env", ".png"].includes(path.extname(e.name)) ? [] : [rel];
  });

describe("nasazení OPSYS (jedna instance)", () => {
  it("v nasazení nezůstaly zbytky stavebního jádra ani název Rebar", () => {
    for (const file of deployFiles("deploy")) {
      const text = read(file);
      expect(text, file).not.toMatch(/stavebn|rebar|poptáv|docházk|montér/i);
    }
  });

  it("vzor .env míří na OPSYS: klient opsys, doména OP Digital, image repozitáře OPSYS, bez tajných hodnot", () => {
    const env = read("deploy/.env.example");
    expect(env).toMatch(/^CLIENT=opsys$/m);
    expect(env).toMatch(/^DOMAIN=\S+\.opdigital\.cz$/m);
    expect(env).toMatch(/^APP_IMAGE=ghcr\.io\/ondrejis\/interni-system-opdigital-opsys$/m);
    expect(env).toMatch(/^BACKUP_IMAGE=ghcr\.io\/ondrejis\/interni-system-opdigital-backup$/m);
    // OAuth redirecty a adresy pro n8n jsou zdokumentované (bez tajných hodnot)
    expect(env).toContain("/api/kalendar/google/callback");
    expect(env).toContain("/api/ingest/drive");
    expect(env).toContain("/api/ingest/leads");
    expect(env).not.toMatch(/GOCSPX|ya29\.|whsec_[A-Za-z0-9]{8}|EAA[A-Za-z0-9]{20}/);
  });

  it("image odpovídají tomu, co staví vydání (repozitář + klient, repozitář + backup)", () => {
    const rel = read(".github/workflows/release.yml");
    expect(rel).toContain("${repo}-${{ matrix.client }}");
    expect(rel).toContain("-backup");
  });
});

describe("Caddy: veřejná doména, hlavičky a příchozí požadavky z n8n", () => {
  const caddy = read("deploy/caddy/Caddyfile");
  const ingest =
    /@ingest path \/api\/ingest\/\*\s+request_body @ingest \{\s+max_size (\d+)(KB|MB)/.exec(caddy);

  it("/api/ingest/* má vlastní limit těla, který není menší než limit aplikace (512 kB)", () => {
    expect(ingest).not.toBeNull();
    const bytes = Number(ingest![1]) * (ingest![2] === "MB" ? 1024 * 1024 : 1024);
    expect(INGEST_MAX_BODY_BYTES).toBe(512 * 1024);
    expect(bytes).toBeGreaterThanOrEqual(INGEST_MAX_BODY_BYTES);
    expect(bytes).toBeLessThan(30 * 1024 * 1024);
  });

  it("HTTPS s HSTS, bezpečnostní hlavičky a zákaz indexace; adresu klienta nastavuje proxy", () => {
    expect(caddy).toMatch(/^\{\$DOMAIN\} \{/m);
    expect(caddy).toMatch(/Strict-Transport-Security "max-age=31536000; includeSubDomains"/);
    expect(caddy).toMatch(/X-Robots-Tag "noindex/);
    expect(caddy).toMatch(/header_up X-Forwarded-For \{remote_host\}/);
    expect(caddy).not.toMatch(/\/api\/intake/);
  });

  it("rate limit příchozích požadavků je v aplikaci (120 za minutu z adresy) a Caddy to ve své konfiguraci říká", () => {
    expect(caddy).toMatch(/120 za minutu/);
    expect(read("apps/web/src/app/api/ingest/[source]/route.ts")).toMatch(
      /`ingest:\$\{ip\}`, 120, 60/,
    );
  });
});

describe("docker-compose: OPSYS", () => {
  const compose = read("deploy/docker-compose.yml");
  it("běží app, worker, postgres, caddy a backup; worker má stejnou image jako app", () => {
    for (const s of ["caddy", "app", "worker", "postgres", "backup"])
      expect(compose, s).toMatch(new RegExp(`\\n  ${s}:`));
    expect(compose).toMatch(/command: \["node_modules\/\.bin\/tsx", "scripts\/worker\.ts"\]/);
    expect(compose).toMatch(/BACKUP_STATUS_FILE: \/data\/status\/backup\.json/);
  });
});
