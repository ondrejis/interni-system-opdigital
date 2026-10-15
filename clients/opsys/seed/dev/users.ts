import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { bootstrapOwner, hashPassword } from "@rebar/core/auth";
import { schema, type Db } from "@rebar/core/db";

/** E-maily vývojových uživatelů (rezervovaná doména `.test`, nikdy neodejde žádný e-mail). */
export const DEV_USERS = {
  owner: { email: "owner.dev@opsys.test", name: "Ondřej Vývojový", roleKey: "owner" },
  partner: { email: "partner.dev@opsys.test", name: "Patrik Vývojový", roleKey: "partner" },
} as const;

export type Who = keyof typeof DEV_USERS;

/** Soubor s přihlašovacími údaji vývojových uživatelů (složka `.data/` je v gitignore). */
export const DEV_CREDENTIALS_FILE = path.resolve(import.meta.dirname, "..", "..", "..", "..", ".data", "dev-credentials.txt");

/** Náhodné heslo (24 znaků, projde pravidly hesel jádra). */
const newPassword = () => randomBytes(18).toString("base64url");

function readCredentials(file: string): Partial<Record<Who, string>> {
  try {
    const out: Partial<Record<Who, string>> = {};
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = /^(owner|partner)\t[^\t]+\t(.+)$/.exec(line.trim());
      if (m) out[m[1] as Who] = m[2]!;
    }
    return out;
  } catch {
    return {};
  }
}

function writeCredentials(file: string, passwords: Partial<Record<Who, string>>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = (Object.keys(DEV_USERS) as Who[])
    .filter((w) => passwords[w])
    .map((w) => `${w}\t${DEV_USERS[w].email}\t${passwords[w]}`);
  fs.writeFileSync(
    file,
    `# Vývojové účty OPSYS (jen lokálně, gitignorováno). Sloupce: role, e-mail, heslo.\n${lines.join("\n")}\n`,
    { mode: 0o600 },
  );
  fs.chmodSync(file, 0o600);
}

export type EnsureUsersOptions = {
  db: Db;
  auth: Parameters<typeof bootstrapOwner>[0]["auth"];
  /** Kam zapsat hesla; `null` = nezapisovat (test). */
  credentialsFile: string | null;
};

/**
 * Založí chybějící vývojové uživatele. Existujícímu uživateli bez uloženého hesla nastaví nové (heslo se nikdy nevypisuje).
 * Vrací id obou a informaci, kterým bylo (znovu) nastaveno heslo.
 */
export async function ensureDevUsers({ db, auth, credentialsFile }: EnsureUsersOptions) {
  const saved = credentialsFile ? readCredentials(credentialsFile) : {};
  const ids = {} as Record<Who, string>;
  const fresh: Who[] = [];
  const passwords: Partial<Record<Who, string>> = { ...saved };
  for (const who of Object.keys(DEV_USERS) as Who[]) {
    const def = DEV_USERS[who];
    const password = newPassword();
    const res = await bootstrapOwner({ auth, db }, { ...def, password });
    ids[who] = res.userId;
    if (res.created) {
      passwords[who] = password;
      fresh.push(who);
    } else if (!saved[who]) {
      // uživatel existuje, ale heslo není k dispozici: nastaví se nové
      await db
        .update(schema.account)
        .set({ password: await hashPassword(password) })
        .where(and(eq(schema.account.userId, res.userId), eq(schema.account.providerId, "credential")));
      passwords[who] = password;
      fresh.push(who);
    }
  }
  if (credentialsFile && fresh.length) writeCredentials(credentialsFile, passwords);
  return { ids, fresh };
}

/** Vypne povinné 2FA rolí owner a partner (jen vývojová databáze a jen na výslovnou žádost). */
export async function disableTwoFactorRequirement(db: Db): Promise<void> {
  await db
    .update(schema.role)
    .set({ require2fa: false })
    .where(inArray(schema.role.key, ["owner", "partner"]));
}


/** Existují role `owner` a `partner` (po `pnpm db:seed`)? */
export async function devRolesExist(db: Db): Promise<boolean> {
  const roles = await db
    .select({ key: schema.role.key })
    .from(schema.role)
    .where(inArray(schema.role.key, ["owner", "partner"]));
  return roles.length >= 2;
}
