import { execFileSync } from "node:child_process";
import { createDecipheriv } from "node:crypto";

/**
 * Pomocníci pro procházky platformy. Bez nastaveného SMTP se e-maily nikam neodesílají a tajný odkaz (pozvánka, obnova
 * hesla) leží jen zašifrovaný v úloze fronty (`pgboss.job`). Test ho z ní přečte, když má k dispozici stejnou databázi
 * a klíč jako server (`DATABASE_URL`, `APP_ENCRYPTION_KEY(S)` z `.env.local`, nástroj `psql`); jinak vrátí `null`
 * a test se přeskočí s vysvětlením.
 */

function keyRing(): Map<string, Buffer> {
  const keys = new Map<string, Buffer>();
  const multi = process.env.APP_ENCRYPTION_KEYS;
  if (multi) {
    for (const part of multi.split(",").map((p) => p.trim())) {
      const i = part.indexOf(":");
      if (i > 0) keys.set(part.slice(0, i), Buffer.from(part.slice(i + 1), "base64"));
    }
  } else if (process.env.APP_ENCRYPTION_KEY) {
    keys.set("1", Buffer.from(process.env.APP_ENCRYPTION_KEY, "base64"));
  }
  return keys;
}

function decrypt(value: string): string | null {
  const [v, id, iv, tag, data] = value.split(".");
  const key = id ? keyRing().get(id) : undefined;
  if (v !== "v2" || !key || !iv || !tag || !data) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Je k dispozici vše, co čtení tajného odkazu z fronty potřebuje? */
export function canReadMailLinks(): boolean {
  if (!process.env.DATABASE_URL || keyRing().size === 0) return false;
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Poslední e-mail dané šablony pro adresu: odkaz z proměnných šablony (`url`), nebo `null`. */
export function latestMailUrl(
  to: string,
  template: "invitation" | "password-reset",
): string | null {
  if (!/^[\w.+@-]+$/.test(to)) throw new Error("Neplatná adresa v dotazu.");
  const out = execFileSync(
    "psql",
    [
      process.env.DATABASE_URL!,
      "-t",
      "-A",
      "-c",
      `select data->>'varsEnc' from pgboss.job where name = 'mail.send' and data->>'to' = '${to}' and data->>'template' = '${template}' order by created_on desc limit 1`,
    ],
    { encoding: "utf8" },
  ).trim();
  if (!out) return null;
  const vars = JSON.parse(decrypt(out) ?? "null") as { url?: string } | null;
  return vars?.url ?? null;
}
