import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { newId } from "../db/ids";

/*
  Omezení přihlašování (AUT-06): nejvýš 5 neúspěšných pokusů za 15 minut na dvojici účet + IP. Šestý pokus se
  zablokuje, i kdyby heslo bylo správné. Pro rozstřik přes mnoho účtů z jedné adresy platí navíc strop na IP.
  Počítadla jsou v tabulce `rate_limit` (sdílená všemi procesy) pod klíči `app:login:*` a nesou jen otisk e-mailu a IP.
  Okno je pevné: začíná prvním neúspěšným pokusem a po 15 minutách se počítadlo samo vynuluje.
*/

/** Neúspěšných pokusů na účet a adresu za okno, po kterých se přihlášení zablokuje. */
export const LOGIN_LIMIT = { attempts: 5, windowSeconds: 900 } as const;
/** Strop neúspěšných pokusů z jedné adresy přes všechny účty. */
export const LOGIN_IP_LIMIT = { attempts: 30, windowSeconds: 900 } as const;

const digest = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 32);
const accountKey = (email: string, ip: string | null) =>
  `app:login:${digest(`${email.trim().toLowerCase()}|${ip ?? ""}`)}`;
const ipKey = (ip: string) => `app:login-ip:${digest(ip)}`;

async function peek(db: Executor, key: string, windowSeconds: number): Promise<number> {
  const windowStart = Date.now() - windowSeconds * 1000;
  const rows = await db.execute<{ count: number }>(
    sql`select count from rate_limit where key = ${key} and last_request > ${windowStart}`,
  );
  return rows[0]?.count ?? 0;
}

async function bump(db: Executor, key: string, windowSeconds: number): Promise<number> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const rows = await db.execute<{ count: number }>(sql`
    insert into rate_limit (id, key, count, last_request) values (${newId()}, ${key}, 1, ${now})
    on conflict (key) do update set
      count = case when rate_limit.last_request <= ${windowStart} then 1 else rate_limit.count + 1 end,
      last_request = case when rate_limit.last_request <= ${windowStart} then ${now} else rate_limit.last_request end
    returning count`);
  return rows[0]?.count ?? 1;
}

/** Je přihlášení pro tento účet z této adresy zablokované (vyčerpané pokusy)? */
export async function isLoginBlocked(
  db: Executor,
  email: string,
  ip: string | null,
): Promise<boolean> {
  const [acct, byIp] = await Promise.all([
    peek(db, accountKey(email, ip), LOGIN_LIMIT.windowSeconds),
    ip ? peek(db, ipKey(ip), LOGIN_IP_LIMIT.windowSeconds) : Promise.resolve(0),
  ]);
  return acct >= LOGIN_LIMIT.attempts || byIp >= LOGIN_IP_LIMIT.attempts;
}

/** Započítá neúspěšný pokus (špatné heslo). Vrací nový počet pokusů účtu z této adresy. */
export async function recordLoginFailure(
  db: Executor,
  email: string,
  ip: string | null,
): Promise<number> {
  const [count] = await Promise.all([
    bump(db, accountKey(email, ip), LOGIN_LIMIT.windowSeconds),
    ip ? bump(db, ipKey(ip), LOGIN_IP_LIMIT.windowSeconds) : Promise.resolve(0),
  ]);
  return count;
}

/** Započítá pokus, který byl zablokován (aby šlo poznat první zablokování od dalších). Vrací počet pokusů. */
export async function recordBlockedAttempt(
  db: Executor,
  email: string,
  ip: string | null,
): Promise<number> {
  return bump(db, accountKey(email, ip), LOGIN_LIMIT.windowSeconds);
}

/** Po úspěšném ověření heslem vynuluje počítadlo účtu z této adresy. */
export async function clearLoginFailures(
  db: Executor,
  email: string,
  ip: string | null,
): Promise<void> {
  await db.execute(sql`delete from rate_limit where key = ${accountKey(email, ip)}`);
}
